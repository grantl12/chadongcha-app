"""
In-game credit shop.

Endpoints:
  GET  /shop/items      — list purchasable items (public)
  POST /shop/buy        — purchase an item (auth)

Items are consumables and cosmetics — never catchable vehicles.
Credits flow: catch cars → sell to wholesaler → buy shop items.
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta

from db import get_client

router = APIRouter()

# ─── Item catalogue ────────────────────────────────────────────────────────────

SHOP_ITEMS: dict[str, dict] = {
    "xp_boost_60": {
        "id":       "xp_boost_60",
        "name":     "XP BOOST",
        "desc":     "2× XP on all vehicle catches for 60 minutes. Stacks with Orbital Boost.",
        "cost":     400,
        "category": "boost",
        "icon":     "⚡",
    },
    "scan_boost_30": {
        "id":       "scan_boost_30",
        "name":     "SCAN BOOST",
        "desc":     "Lowers the auto-catch confidence threshold for 30 minutes. Catch more, miss less.",
        "cost":     250,
        "category": "boost",
        "icon":     "📡",
    },
    "id_hint": {
        "id":       "id_hint",
        "name":     "ID HINT",
        "desc":     "Removes one wrong answer on the Identify screen. Stacks — buy as many as you need.",
        "cost":     75,
        "category": "consumable",
        "icon":     "🔍",
    },
}


# ─── Auth helper ──────────────────────────────────────────────────────────────

def _resolve_player(db, authorization: str) -> str:
    token = authorization.replace("Bearer ", "")
    try:
        result = db.auth.get_user(token)
        if not result or not result.user:
            raise ValueError()
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/items")
async def list_items():
    return list(SHOP_ITEMS.values())


class BuyRequest(BaseModel):
    item_id: str


@router.post("/buy")
async def buy_item(body: BuyRequest, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    item = SHOP_ITEMS.get(body.item_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Unknown item: {body.item_id}")

    # Load player credits + current boost state
    player = db.table("players") \
        .select("credits, xp_boost_expires, scan_boost_expires, id_hints") \
        .eq("id", player_id).maybe_single().execute()
    if not player or not player.data:
        raise HTTPException(status_code=404, detail="Player not found")

    p = player.data
    if (p.get("credits") or 0) < item["cost"]:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    # Deduct credits
    db.rpc("decrement_credits", {"p_player_id": player_id, "p_amount": item["cost"]}).execute()

    now = datetime.now(timezone.utc)
    update: dict = {}

    if body.item_id == "xp_boost_60":
        # Extend from whichever is later: now or existing expiry
        current = p.get("xp_boost_expires")
        base    = max(now, datetime.fromisoformat(current.replace("Z", "+00:00"))) if current else now
        update["xp_boost_expires"] = (base + timedelta(minutes=60)).isoformat()

    elif body.item_id == "scan_boost_30":
        current = p.get("scan_boost_expires")
        base    = max(now, datetime.fromisoformat(current.replace("Z", "+00:00"))) if current else now
        update["scan_boost_expires"] = (base + timedelta(minutes=30)).isoformat()

    elif body.item_id == "id_hint":
        update["id_hints"] = (p.get("id_hints") or 0) + 1

    if update:
        db.table("players").update(update).eq("id", player_id).execute()

    # Log
    db.table("credit_events").insert({
        "player_id": player_id,
        "delta":     -item["cost"],
        "reason":    f"shop_{body.item_id}",
    }).execute()

    # Return updated player state
    refreshed = db.table("players") \
        .select("credits, xp_boost_expires, scan_boost_expires, id_hints") \
        .eq("id", player_id).maybe_single().execute()
    r = (refreshed.data if refreshed else None) or {}

    return {
        "ok":                 True,
        "item_id":            body.item_id,
        "credits_spent":      item["cost"],
        "new_credits":        r.get("credits", 0),
        "xp_boost_expires":   r.get("xp_boost_expires"),
        "scan_boost_expires": r.get("scan_boost_expires"),
        "id_hints":           r.get("id_hints", 0),
    }
