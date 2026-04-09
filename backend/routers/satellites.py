from fastapi import APIRouter, Query
from db import get_client

router = APIRouter()


@router.get("/catchable")
async def catchable_objects(lat: float = Query(...), lon: float = Query(...)):
    """
    Returns space objects currently catchable overhead for the given position.
    The worker pre-computes these; this is just a read.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    db = get_client()
    result = db.table("catchable_objects") \
        .select("*, space_objects(*)") \
        .lte("pass_start", now) \
        .gte("pass_end", now) \
        .execute()
    return result.data
