"""
Upload presign router.

Authenticated players can request a presigned PUT URL for a scan photo.
The client uploads directly to Cloudflare R2 — the binary never touches
the FastAPI backend.

GET /uploads/presign?catch_type=scan360
→ { upload_url: str, key: str }
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, Query
from db import get_client
from services.storage_service import presign_photo_upload
from config import settings

router = APIRouter()

ALLOWED_CATCH_TYPES = {"highway", "scan360", "space"}


def _resolve_player(db, authorization: str) -> str:
    token = authorization.replace("Bearer ", "")
    try:
        result = db.auth.get_user(token)
        if not result or not result.user:
            raise ValueError()
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/presign")
async def presign_upload(
    catch_type: str = Query(..., description="highway | scan360 | space"),
    authorization: str = Header(...),
):
    """
    Issue a short-lived presigned PUT URL for a scan photo.

    The client uses this URL to upload directly to R2, then passes the
    returned key back to the /catches endpoint as photo_ref.
    """
    if not settings.r2_account_id:
        raise HTTPException(status_code=503, detail="Storage not configured")

    if catch_type not in ALLOWED_CATCH_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid catch_type: {catch_type}")

    db = get_client()
    _resolve_player(db, authorization)   # auth check only — we don't need the ID here

    # Build a unique, path-organized key
    now   = datetime.now(timezone.utc)
    uid   = uuid.uuid4().hex
    key   = f"scans/{catch_type}/{now.year}/{now.month:02d}/{uid}.jpg"

    upload_url = presign_photo_upload(key)
    return {"upload_url": upload_url, "key": key}
