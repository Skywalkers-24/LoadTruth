"""Source adapter layer — normalize each source kind into validate + fetch.

A `Source` row (app/db/models.Source) describes where evidence comes from. This
module turns a source ``kind`` into an adapter that (a) validates the row's
``config`` has the keys that kind needs and (b) exposes a ``fetch`` interface to
pull evidence. Only ``upload`` has a real fetch path today (it reuses
`app.pipeline.ingest`); the streaming/bucket/webhook/mobile connectors validate
their config but raise a clear `SourceFetchNotImplementedError` on fetch.

No adapter performs real network I/O. ``validate_config`` is pure (key-presence
checks only), so the ``POST /sources/{id}/test`` route is always side-effect free.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import ClassVar

from app.pipeline.ingest import IngestedArtifact, ingest_upload
from app.tickets.schemas import SourceKind


class SourceFetchNotImplementedError(NotImplementedError):
    """Raised when a source kind's fetch path is not yet wired (no network I/O)."""


class UnknownSourceKindError(ValueError):
    """Raised when no adapter is registered for a source kind."""


@dataclass(frozen=True, slots=True)
class ConfigValidation:
    """Result of validating a source's config against its kind's requirements."""

    ok: bool
    detail: str


class SourceAdapter(ABC):
    """Normalizes one source kind into config-validation + a fetch interface.

    Subclasses declare the config keys their kind requires; the base class checks
    presence (non-empty) and reports which keys are missing. ``fetch`` is the
    only place real evidence retrieval would happen.
    """

    kind: ClassVar[SourceKind]
    required_keys: ClassVar[tuple[str, ...]] = ()

    def __init__(self, config: dict[str, object]) -> None:
        self.config = config

    def validate_config(self) -> ConfigValidation:
        """Pure check that every required key is present and non-empty."""
        missing = [
            key
            for key in self.required_keys
            if key not in self.config or self.config[key] in (None, "")
        ]
        if missing:
            return ConfigValidation(
                ok=False,
                detail=f"{self.kind.value}: missing required config: {', '.join(missing)}",
            )
        return ConfigValidation(ok=True, detail=f"{self.kind.value}: config looks valid")

    @abstractmethod
    def fetch(self, *args: object, **kwargs: object) -> IngestedArtifact:
        """Pull one piece of evidence from the source into a normalized artifact."""


class UploadAdapter(SourceAdapter):
    """Direct file upload — the only fully-implemented source (reuses ingest)."""

    kind = SourceKind.UPLOAD
    required_keys = ()

    def fetch(self, *args: object, **kwargs: object) -> IngestedArtifact:
        """Normalize + hash an uploaded blob via the shared ingest path.

        Expects ``filename: str`` and ``data: bytes`` keyword arguments.
        """
        filename = kwargs.get("filename")
        data = kwargs.get("data")
        if not isinstance(filename, str) or not isinstance(data, bytes):
            msg = "upload fetch requires filename: str and data: bytes"
            raise ValueError(msg)
        return ingest_upload(filename, data, source_kind=self.kind.value)


class _UnwiredAdapter(SourceAdapter):
    """Base for connectors that validate config but have no fetch path yet."""

    def fetch(self, *args: object, **kwargs: object) -> IngestedArtifact:
        msg = f"fetch for source kind '{self.kind.value}' is not implemented yet"
        raise SourceFetchNotImplementedError(msg)


class RtspAdapter(_UnwiredAdapter):
    """RTSP stream (IP camera / NVR). Needs a stream ``url``."""

    kind = SourceKind.RTSP
    required_keys = ("url",)


class HlsAdapter(_UnwiredAdapter):
    """HLS stream. Needs a playlist ``url``."""

    kind = SourceKind.HLS
    required_keys = ("url",)


class IpCameraAdapter(_UnwiredAdapter):
    """Generic IP camera. Needs a ``url`` (and optionally credentials-ref)."""

    kind = SourceKind.IP_CAMERA
    required_keys = ("url",)


class CloudBucketAdapter(_UnwiredAdapter):
    """Object-storage bucket polling. Needs a ``bucket`` and a ``prefix``."""

    kind = SourceKind.CLOUD_BUCKET
    required_keys = ("bucket", "prefix")


class WebhookAdapter(_UnwiredAdapter):
    """Inbound webhook push. Needs an ``endpoint`` to register."""

    kind = SourceKind.WEBHOOK
    required_keys = ("endpoint",)


class MobileAdapter(_UnwiredAdapter):
    """Mobile field-capture app. Needs a ``device_id`` to bind uploads to."""

    kind = SourceKind.MOBILE
    required_keys = ("device_id",)


_ADAPTERS: dict[SourceKind, type[SourceAdapter]] = {
    SourceKind.UPLOAD: UploadAdapter,
    SourceKind.RTSP: RtspAdapter,
    SourceKind.HLS: HlsAdapter,
    SourceKind.IP_CAMERA: IpCameraAdapter,
    SourceKind.CLOUD_BUCKET: CloudBucketAdapter,
    SourceKind.WEBHOOK: WebhookAdapter,
    SourceKind.MOBILE: MobileAdapter,
}


def get_adapter(kind: SourceKind | str, config: dict[str, object] | None = None) -> SourceAdapter:
    """Return the adapter for a source kind, bound to the given config.

    Accepts the enum or its string value. Raises ``UnknownSourceKindError`` for
    an unregistered kind.
    """
    try:
        resolved = SourceKind(kind)
    except ValueError as exc:
        raise UnknownSourceKindError(str(kind)) from exc
    return _ADAPTERS[resolved](config or {})
