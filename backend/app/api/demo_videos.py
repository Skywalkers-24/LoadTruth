"""Tenant-scoped B2 demo library and direct browser upload handshake."""

from __future__ import annotations

import asyncio
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.api.deps import CurrentMember, require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_manage_demo_videos
from app.config import get_settings
from app.db.models import DemoVideo
from app.pipeline import b2_store

router = APIRouter(tags=["demo videos"])
ManageVideos = Depends(
    require(can_manage_demo_videos, "Only SuperAdmin can upload or manage demo videos.")
)


class VideoInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    filename: str = Field(min_length=1, max_length=240)
    mime: str = Field(max_length=80)
    size_bytes: int = Field(gt=0)
    notes: str | None = Field(default=None, max_length=2000)
    reference_fill_pct: Decimal | None = Field(default=None, ge=0, le=100)


class VideoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    filename: str
    mime: str
    size_bytes: int
    status: str
    notes: str | None
    reference_fill_pct: Decimal | None
    created_at: datetime


class VideoPage(BaseModel):
    items: list[VideoOut]
    total: int
    analysis_max_bytes: int
    upload_max_bytes: int


class UploadOut(BaseModel):
    video: VideoOut
    upload_url: str
    headers: dict[str, str]


async def owned_video(repo: Repository, tenant: UUID, video_id: UUID) -> DemoVideo:
    video = (
        await repo.session.execute(
            select(DemoVideo).where(DemoVideo.id == video_id, DemoVideo.tenant_id == tenant)
        )
    ).scalar_one_or_none()
    if video is None:
        raise HTTPException(404, "Demo video not found.")
    return video


@router.get("/demo-videos", response_model=VideoPage)
async def list_videos(
    _: CurrentMember,
    repo: Repository,
    tenant: ActiveTenant,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> VideoPage:
    where = DemoVideo.tenant_id == tenant
    total = int(
        (
            await repo.session.execute(select(func.count()).select_from(DemoVideo).where(where))
        ).scalar_one()
    )
    rows = (
        (
            await repo.session.execute(
                select(DemoVideo)
                .where(where)
                .order_by(DemoVideo.created_at.desc(), DemoVideo.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    s = get_settings()
    return VideoPage(
        items=[VideoOut.model_validate(row) for row in rows],
        total=total,
        analysis_max_bytes=s.analysis_max_bytes,
        upload_max_bytes=s.demo_upload_max_bytes,
    )


@router.post(
    "/demo-videos/uploads", response_model=UploadOut, status_code=201, dependencies=[ManageVideos]
)
async def begin_upload(body: VideoInput, repo: Repository, tenant: ActiveTenant) -> UploadOut:
    s = get_settings()
    if not body.title.strip():
        raise HTTPException(400, "Give this clip a title.")
    if body.size_bytes > s.demo_upload_max_bytes:
        raise HTTPException(413, "This clip exceeds the library upload limit.")
    if body.mime not in (
        "video/mp4",
        "video/quicktime",
        "video/webm",
        "video/x-matroska",
        "image/jpeg",
        "image/png",
        "image/webp",
    ):
        raise HTTPException(400, "Choose an MP4, MOV, WebM video or a supported image.")
    video_id = uuid4()
    key = f"loadtruth/demos/{tenant}/{video_id.hex}"
    try:
        url = await asyncio.to_thread(b2_store.signed_url, key, upload_mime=body.mime)
    except Exception as exc:
        raise HTTPException(
            503, "B2 storage is unavailable. Nothing has been accepted as uploaded."
        ) from exc
    row = DemoVideo(
        id=video_id,
        tenant_id=tenant,
        title=body.title.strip(),
        filename=body.filename,
        mime=body.mime,
        size_bytes=body.size_bytes,
        object_key=key,
        status="uploading",
        notes=body.notes,
        reference_fill_pct=body.reference_fill_pct,
    )
    repo.session.add(row)
    await repo.session.flush()
    return UploadOut(
        video=VideoOut.model_validate(row), upload_url=url, headers={"Content-Type": body.mime}
    )


@router.post(
    "/demo-videos/{video_id}/complete", response_model=VideoOut, dependencies=[ManageVideos]
)
async def complete_upload(repo: Repository, tenant: ActiveTenant, video_id: UUID) -> VideoOut:
    row = await owned_video(repo, tenant, video_id)
    if row.status == "ready":
        return VideoOut.model_validate(row)
    try:
        head = await asyncio.to_thread(b2_store.head_key, row.object_key)
    except Exception as exc:
        raise HTTPException(503, "B2 could not verify this upload. Retry verification.") from exc
    if head is None:
        raise HTTPException(409, "The file has not finished uploading to B2.")
    if (
        int(head.get("ContentLength", -1)) != row.size_bytes
        or head.get("ContentType", "").split(";")[0] != row.mime
    ):
        raise HTTPException(409, "Stored file size or type does not match this upload.")
    version = head.get("VersionId")
    if not version:
        raise HTTPException(409, "B2 did not return an object version. The clip was not accepted.")
    row.object_version = str(version)
    row.status = "ready"
    await repo.session.flush()
    return VideoOut.model_validate(row)


@router.get("/demo-videos/{video_id}/playback")
async def playback(
    _: CurrentMember, repo: Repository, tenant: ActiveTenant, video_id: UUID
) -> dict[str, str]:
    row = await owned_video(repo, tenant, video_id)
    if row.status != "ready":
        raise HTTPException(409, "Finish uploading this clip before playback.")
    try:
        url = await asyncio.to_thread(
            b2_store.signed_url, row.object_key, version=row.object_version
        )
    except Exception as exc:
        raise HTTPException(503, "B2 playback is unavailable. Try again shortly.") from exc
    return {"url": url}
