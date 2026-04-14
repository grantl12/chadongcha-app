"""
Content moderation service — checks uploaded photos before they become
community-visible.

Uses Google Cloud Vision SafeSearch API if GOOGLE_CLOUD_VISION_KEY is set.
Falls back to "approved" if the key is absent (dev mode).

Moderation statuses written to catches.moderation_status:
  'pending'  — queued but not yet checked
  'approved' — passed all checks, safe to show
  'rejected' — flagged as unsafe (adult / violence / racy above threshold)
  'skipped'  — no API key configured; check was not performed
"""

import logging
import os
from enum import Enum

import httpx

log = logging.getLogger(__name__)

_VISION_KEY = os.getenv("GOOGLE_CLOUD_VISION_KEY", "")
_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"

# Reject if SafeSearch likelihood >= this level (1=UNKNOWN 2=VERY_UNLIKELY 3=UNLIKELY 4=POSSIBLE 5=LIKELY 6=VERY_LIKELY)
_REJECT_THRESHOLD = 4   # POSSIBLE or higher → reject


class ModerationResult(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    SKIPPED  = "skipped"
    ERROR    = "error"


async def check_photo(r2_public_url: str, photo_key: str) -> ModerationResult:
    """
    Run SafeSearch detection on a photo already uploaded to R2.
    `photo_key` is the R2 object key (e.g. "scans/highway/2026/04/abc.jpg").
    `r2_public_url` is the public base URL for the R2 bucket.
    """
    if not _VISION_KEY:
        log.debug("GOOGLE_CLOUD_VISION_KEY not set — skipping moderation for %s", photo_key)
        return ModerationResult.SKIPPED

    photo_url = f"{r2_public_url.rstrip('/')}/{photo_key}"

    payload = {
        "requests": [{
            "image":    {"source": {"imageUri": photo_url}},
            "features": [{"type": "SAFE_SEARCH_DETECTION"}],
        }]
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{_VISION_URL}?key={_VISION_KEY}",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        annotation = (
            data.get("responses", [{}])[0]
                .get("safeSearchAnnotation", {})
        )

        # Likelihood values are strings: UNKNOWN VERY_UNLIKELY UNLIKELY POSSIBLE LIKELY VERY_LIKELY
        _LEVEL = {
            "UNKNOWN":       1,
            "VERY_UNLIKELY": 2,
            "UNLIKELY":      3,
            "POSSIBLE":      4,
            "LIKELY":        5,
            "VERY_LIKELY":   6,
        }

        adult    = _LEVEL.get(annotation.get("adult",    "UNKNOWN"), 1)
        violence = _LEVEL.get(annotation.get("violence", "UNKNOWN"), 1)
        racy     = _LEVEL.get(annotation.get("racy",     "UNKNOWN"), 1)

        if max(adult, violence, racy) >= _REJECT_THRESHOLD:
            log.warning(
                "Photo REJECTED — adult=%s violence=%s racy=%s key=%s",
                annotation.get("adult"), annotation.get("violence"),
                annotation.get("racy"), photo_key,
            )
            return ModerationResult.REJECTED

        return ModerationResult.APPROVED

    except Exception as exc:
        log.error("Moderation check failed for %s: %s", photo_key, exc)
        return ModerationResult.ERROR
