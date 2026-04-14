"""
Activity feed router.

GET /feed/activities  — unified event stream (catches + game milestones)
"""

from fastapi import APIRouter
from typing import Optional

from db import get_client

router = APIRouter()


@router.get("/activities")
async def get_activities(
    limit: int = 50,
    player_id: Optional[str] = None,
):
    """
    Return recent activity_feed events, newest first.
    Pass player_id to filter to a single player's activity (MINE tab).
    """
    db = get_client()

    query = (
        db.table("activity_feed")
        .select("id, event_type, player_id, catch_id, payload, created_at, players(username)")
        .order("created_at", desc=True)
        .limit(min(limit, 100))
    )

    if player_id:
        query = query.eq("player_id", player_id)

    result = query.execute()

    rows = []
    for row in result.data or []:
        rows.append({
            "id":              row["id"],
            "event_type":      row["event_type"],
            "player_id":       row["player_id"],
            "player_username": (row.get("players") or {}).get("username") or "—",
            "catch_id":        row.get("catch_id"),
            "payload":         row.get("payload") or {},
            "created_at":      row["created_at"],
        })

    return rows
