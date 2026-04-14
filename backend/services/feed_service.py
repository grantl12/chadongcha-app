"""
Activity feed writer.

Called from routers whenever a notable game event happens.
Writes to activity_feed so GET /feed/activities can surface it.

All writes are best-effort — a failure never blocks the calling request.
"""

import logging
from typing import Optional

log = logging.getLogger(__name__)


def write_event(
    db,
    player_id: str,
    event_type: str,
    catch_id: Optional[str] = None,
    payload: Optional[dict] = None,
) -> None:
    """
    Insert one row into activity_feed.
    event_type must be one of: catch | road_king | level_up | first_finder | market_sale
    """
    try:
        db.table("activity_feed").insert({
            "player_id":  player_id,
            "event_type": event_type,
            "catch_id":   catch_id,
            "payload":    payload or {},
        }).execute()
    except Exception as exc:
        log.warning("feed_service.write_event(%s) failed: %s", event_type, exc)
