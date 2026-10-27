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
                detail=f"Missing required settings: {', '.join(missing)}.",
            )
        return ConfigValidation(ok=True, detail="Connection settings are valid.")

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


class S3Adapter(_UnwiredAdapter):
    """Amazon S3 bucket. Needs a ``bucket`` and a ``region``; ``prefix`` optional."""

    kind = SourceKind.S3
    required_keys = ("bucket", "region")


class GcsAdapter(_UnwiredAdapter):
    """Google Cloud Storage bucket. Needs a ``bucket``; ``prefix`` optional."""

    kind = SourceKind.GCS
    required_keys = ("bucket",)


class AzureBlobAdapter(_UnwiredAdapter):
    """Azure Blob Storage. Needs an ``account`` and a ``container``."""

    kind = SourceKind.AZURE_BLOB
    required_keys = ("account", "container")


class GoogleDriveAdapter(_UnwiredAdapter):
    """Google Drive folder. Needs a ``folder_id``."""

    kind = SourceKind.GOOGLE_DRIVE
    required_keys = ("folder_id",)


class DropboxAdapter(_UnwiredAdapter):
    """Dropbox folder. Needs a ``path`` to the shared folder."""

    kind = SourceKind.DROPBOX
    required_keys = ("path",)


class RtspAdapter(_UnwiredAdapter):
    """RTSP camera or NVR stream. Needs a stream ``url``."""

    kind = SourceKind.RTSP
    required_keys = ("url",)


class HlsAdapter(_UnwiredAdapter):
    """HLS playlist stream. Needs a playlist ``url``."""

    kind = SourceKind.HLS
    required_keys = ("url",)


class WebhookAdapter(_UnwiredAdapter):
    """Inbound webhook push. Needs an ``endpoint`` to register."""

    kind = SourceKind.WEBHOOK
    required_keys = ("endpoint",)


_ADAPTERS: dict[SourceKind, type[SourceAdapter]] = {
    SourceKind.UPLOAD: UploadAdapter,
    SourceKind.S3: S3Adapter,
    SourceKind.GCS: GcsAdapter,
    SourceKind.AZURE_BLOB: AzureBlobAdapter,
    SourceKind.GOOGLE_DRIVE: GoogleDriveAdapter,
    SourceKind.DROPBOX: DropboxAdapter,
    SourceKind.RTSP: RtspAdapter,
    SourceKind.HLS: HlsAdapter,
    SourceKind.WEBHOOK: WebhookAdapter,
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
