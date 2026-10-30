"""Partner endpoints and identities, without exposing credentials to the catalog."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from app.config import get_settings

PROVIDER_MODEL_IDS = {
    "baseten": "baseten/muse-spark-open",
    "modal": "modal/muse-spark-open",
    "fireworks": "fireworks/configured-model",
}


@dataclass(frozen=True)
class PartnerEndpoint:
    provider: str
    model: str
    base_url: str
    key: str = field(repr=False)
    headers: dict[str, str] = field(default_factory=dict, repr=False)
    vision: bool = True

    @property
    def configured(self) -> bool:
        return bool(self.model and self.base_url and self.key)


def endpoint(provider: str) -> PartnerEndpoint:
    s = get_settings()
    if provider == "baseten":
        return PartnerEndpoint(provider, s.baseten_model, s.baseten_base_url, s.baseten_api_key)
    if provider == "modal":
        key = (
            f"{s.modal_proxy_token_id}.{s.modal_proxy_token_secret}"
            if s.modal_proxy_token_id and s.modal_proxy_token_secret
            else ""
        )
        headers = (
            {"Modal-Routing-Affinity-Key": s.modal_routing_affinity_key}
            if s.modal_routing_affinity_key
            else {}
        )
        return PartnerEndpoint(provider, s.modal_model, s.modal_base_url, key, headers)
    if provider == "fireworks":
        return PartnerEndpoint(
            provider,
            s.fireworks_model,
            s.fireworks_base_url,
            s.fireworks_api_key,
            vision=s.fireworks_supports_vision,
        )
    raise ValueError("Unknown partner provider")


def default_chat_model(meta_default: str, *, vision: bool = False) -> str:
    s = get_settings()
    if vision and s.spark_provider == "fireworks" and not s.fireworks_supports_vision:
        return meta_default
    return PROVIDER_MODEL_IDS.get(s.spark_provider, meta_default)


def ai_config_fingerprint() -> str:
    """Model, endpoint, and request knobs participate in caches; secrets never do."""
    from app.ai.config_store import get_ai_config_store

    s = get_settings()
    routes = [(name, endpoint(name).base_url, endpoint(name).model) for name in PROVIDER_MODEL_IDS]
    payload = {
        "tasks": [cfg.model_dump(mode="json") for cfg in get_ai_config_store().all()],
        "routes": routes,
        "fallbacks": s.spark_fallback_providers,
        "meta_endpoint": s.model_api_base_url,
        "vision": s.fireworks_supports_vision,
        "media": [
            s.spark_frames_per_task,
            s.frame_downscale_longest_edge,
            s.target_sampled_frames,
            s.sam_bed_concepts,
            s.sam_bed_fallback_concept,
            s.sam_rim_concept,
            s.sam_load_max_concepts,
        ],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]
