"""
Used-car marketplace router.

Endpoints:
  GET  /market/listings         — browse active listings (public)
  GET  /market/listings/mine    — caller's own listings (auth)
  GET  /market/bids/mine        — caller's placed bids (auth)
  POST /market/listings         — list a catch for sale (auth)
  POST /market/bids             — place a bid (auth)
  POST /market/listings/{id}/accept — seller accepts a bid (auth)
  DELETE /market/listings/{id}  — seller cancels listing (auth)
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta

from db import get_client

router = APIRouter()

LISTING_DURATION_DAYS = 7
CREDIT_REWARD_PER_CATCH = 10   # credits awarded per catch (applied by catches router)

VALID_RARITIES = {"common", "uncommon", "rare", "epic", "legendary"}


# ─── Auth helper ─────────────────────────────────────────────────────────────

def _resolve_player(db, authorization: str) -> str:
    token = authorization.replace("Bearer ", "")
    try:
        result = db.auth.get_user(token)
        if not result or not result.user:
            raise ValueError()
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CreateListingBody(BaseModel):
    catch_id:     str
    make:         str
    model:        str
    generation:   str
    body_style:   str
    color:        str
    rarity:       str
    asking_price: int = Field(gt=0)


class PlaceBidBody(BaseModel):
    listing_id: str
    amount:     int = Field(gt=0)


class AcceptBidBody(BaseModel):
    bid_id: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _serialize_listing(row: dict) -> dict:
    """Normalize a DB row into the shape the mobile client expects."""
    return {
        "id":              row["id"],
        "sellerId":        row["seller_id"],
        "sellerUsername":  (row.get("players") or {}).get("username", "unknown"),
        "catchId":         row["catch_id"],
        "make":            row["make"],
        "model":           row["model"],
        "generation":      row["generation"],
        "bodyStyle":       row["body_style"],
        "color":           row["color"],
        "rarity":          row["rarity"],
        "askingPrice":     row["asking_price"],
        "topBid":          row.get("top_bid") or 0,
        "bidCount":        row.get("bid_count") or 0,
        "status":          row["status"],
        "listedAt":        row["listed_at"],
        "expiresAt":       row["expires_at"],
    }


def _listing_with_bids(db, listing_id: str) -> dict:
    """Fetch a listing and annotate it with top_bid + bid_count."""
    listing = db.table("market_listings") \
        .select("*, players(username)") \
        .eq("id", listing_id) \
        .maybe_single() \
        .execute()
    if not listing or not listing.data:
        raise HTTPException(status_code=404, detail="Listing not found")

    bids = db.table("market_bids") \
        .select("amount") \
        .eq("listing_id", listing_id) \
        .order("amount", desc=True) \
        .execute()
    bid_amounts = [b["amount"] for b in (bids.data or [])]
    row = dict(listing.data)
    row["top_bid"]   = bid_amounts[0] if bid_amounts else 0
    row["bid_count"] = len(bid_amounts)
    return row


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/listings")
async def browse_listings(
    rarity: Optional[str] = None,
    make:   Optional[str] = None,
    limit:  int = 40,
    offset: int = 0,
):
    """Browse all active market listings, newest first."""
    db = get_client()

    query = db.table("market_listings") \
        .select("*, players(username)") \
        .eq("status", "active") \
        .gt("expires_at", datetime.now(timezone.utc).isoformat()) \
        .order("listed_at", desc=True) \
        .range(offset, offset + limit - 1)

    if rarity and rarity in VALID_RARITIES:
        query = query.eq("rarity", rarity)
    if make:
        query = query.ilike("make", f"%{make}%")

    res = query.execute()
    rows = res.data or []

    # Annotate with bid stats in bulk
    listing_ids = [r["id"] for r in rows]
    bid_stats: dict[str, dict] = {}
    if listing_ids:
        bids_res = db.table("market_bids") \
            .select("listing_id, amount") \
            .in_("listing_id", listing_ids) \
            .execute()
        for bid in (bids_res.data or []):
            lid = bid["listing_id"]
            if lid not in bid_stats:
                bid_stats[lid] = {"top": 0, "count": 0}
            bid_stats[lid]["count"] += 1
            bid_stats[lid]["top"] = max(bid_stats[lid]["top"], bid["amount"])

    result = []
    for row in rows:
        stats = bid_stats.get(row["id"], {"top": 0, "count": 0})
        row["top_bid"]   = stats["top"]
        row["bid_count"] = stats["count"]
        result.append(_serialize_listing(row))

    return result


@router.get("/listings/mine")
async def my_listings(authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    res = db.table("market_listings") \
        .select("*, players(username)") \
        .eq("seller_id", player_id) \
        .order("listed_at", desc=True) \
        .limit(100) \
        .execute()

    rows = res.data or []
    listing_ids = [r["id"] for r in rows]
    bid_stats: dict[str, dict] = {}
    if listing_ids:
        bids_res = db.table("market_bids") \
            .select("listing_id, amount") \
            .in_("listing_id", listing_ids) \
            .execute()
        for bid in (bids_res.data or []):
            lid = bid["listing_id"]
            if lid not in bid_stats:
                bid_stats[lid] = {"top": 0, "count": 0}
            bid_stats[lid]["count"] += 1
            bid_stats[lid]["top"] = max(bid_stats[lid]["top"], bid["amount"])

    result = []
    for row in rows:
        stats = bid_stats.get(row["id"], {"top": 0, "count": 0})
        row["top_bid"]   = stats["top"]
        row["bid_count"] = stats["count"]
        result.append(_serialize_listing(row))

    return result


@router.get("/bids/mine")
async def my_bids(authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    res = db.table("market_bids") \
        .select("*, market_listings(make, model, generation, rarity, status)") \
        .eq("bidder_id", player_id) \
        .order("created_at", desc=True) \
        .limit(100) \
        .execute()

    return [
        {
            "id":        b["id"],
            "listingId": b["listing_id"],
            "bidderId":  b["bidder_id"],
            "amount":    b["amount"],
            "createdAt": b["created_at"],
            "listing":   b.get("market_listings"),
        }
        for b in (res.data or [])
    ]


@router.post("/listings")
async def create_listing(body: CreateListingBody, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    if body.rarity not in VALID_RARITIES:
        raise HTTPException(status_code=400, detail=f"Invalid rarity: {body.rarity}")

    # Verify the catch belongs to this player
    catch = db.table("catches") \
        .select("id, player_id") \
        .eq("id", body.catch_id) \
        .eq("player_id", player_id) \
        .maybe_single() \
        .execute()
    if not catch or not catch.data:
        raise HTTPException(status_code=404, detail="Catch not found or not yours")

    # Prevent double-listing
    existing = db.table("market_listings") \
        .select("id") \
        .eq("catch_id", body.catch_id) \
        .eq("status", "active") \
        .maybe_single() \
        .execute()
    if existing and existing.data:
        raise HTTPException(status_code=409, detail="This vehicle is already listed")

    expires_at = (datetime.now(timezone.utc) + timedelta(days=LISTING_DURATION_DAYS)).isoformat()
    res = db.table("market_listings").insert({
        "seller_id":   player_id,
        "catch_id":    body.catch_id,
        "make":        body.make,
        "model":       body.model,
        "generation":  body.generation,
        "body_style":  body.body_style,
        "color":       body.color,
        "rarity":      body.rarity,
        "asking_price": body.asking_price,
        "expires_at":  expires_at,
    }).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Could not create listing")

    row = dict(res.data[0])
    row["top_bid"]   = 0
    row["bid_count"] = 0
    row["players"]   = {"username": None}
    return _serialize_listing(row)


@router.post("/bids")
async def place_bid(body: PlaceBidBody, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    # Load listing
    listing = db.table("market_listings") \
        .select("id, seller_id, asking_price, status, expires_at") \
        .eq("id", body.listing_id) \
        .maybe_single() \
        .execute()
    if not listing or not listing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.data["status"] != "active":
        raise HTTPException(status_code=409, detail="Listing is no longer active")
    if listing.data["seller_id"] == player_id:
        raise HTTPException(status_code=400, detail="Cannot bid on your own listing")

    # Check expiry
    expires = datetime.fromisoformat(listing.data["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=409, detail="Listing has expired")

    # Check player has enough credits
    player = db.table("players").select("credits").eq("id", player_id).maybe_single().execute()
    if not player or not player.data:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.data["credits"] < body.amount:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    # Upsert bid (player can raise their bid)
    try:
        res = db.table("market_bids").upsert({
            "listing_id": body.listing_id,
            "bidder_id":  player_id,
            "amount":     body.amount,
        }, on_conflict="listing_id,bidder_id").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not place bid: {e}")

    if not res.data:
        raise HTTPException(status_code=500, detail="Bid not recorded")

    return {
        "id":        res.data[0]["id"],
        "listingId": body.listing_id,
        "bidderId":  player_id,
        "amount":    body.amount,
        "createdAt": res.data[0]["created_at"],
    }


@router.post("/listings/{listing_id}/accept")
async def accept_bid(listing_id: str, body: AcceptBidBody, authorization: str = Header(...)):
    """
    Seller accepts a bid:
    1. Mark listing as sold
    2. Transfer credits: deduct from buyer, add to seller (minus any future fee)
    3. Transfer catch ownership (update catches.player_id)
    4. Refund losing bidders' credits (future: implement reserve logic)
    """
    db = get_client()
    seller_id = _resolve_player(db, authorization)

    listing = db.table("market_listings") \
        .select("id, seller_id, catch_id, status, asking_price") \
        .eq("id", listing_id) \
        .maybe_single() \
        .execute()
    if not listing or not listing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.data["seller_id"] != seller_id:
        raise HTTPException(status_code=403, detail="Not your listing")
    if listing.data["status"] != "active":
        raise HTTPException(status_code=409, detail="Listing is not active")

    # Load winning bid
    bid = db.table("market_bids") \
        .select("id, bidder_id, amount") \
        .eq("id", body.bid_id) \
        .eq("listing_id", listing_id) \
        .maybe_single() \
        .execute()
    if not bid or not bid.data:
        raise HTTPException(status_code=404, detail="Bid not found")

    buyer_id   = bid.data["bidder_id"]
    sale_price = bid.data["amount"]

    # Verify buyer still has funds
    buyer = db.table("players").select("credits").eq("id", buyer_id).maybe_single().execute()
    if not buyer or not buyer.data or buyer.data["credits"] < sale_price:
        raise HTTPException(status_code=402, detail="Buyer no longer has sufficient credits")

    # Execute transfer atomically via individual updates
    # (Supabase python client doesn't support true transactions; RPC would be ideal for prod)

    # Deduct from buyer
    db.rpc("decrement_credits", {"p_player_id": buyer_id, "p_amount": sale_price}).execute()
    # Add to seller
    db.rpc("increment_credits", {"p_player_id": seller_id, "p_amount": sale_price}).execute()

    # Transfer catch ownership
    db.table("catches").update({"player_id": buyer_id}).eq("id", listing.data["catch_id"]).execute()

    # Mark listing sold
    db.table("market_listings").update({
        "status":  "sold",
        "sold_at": datetime.now(timezone.utc).isoformat(),
        "sold_to": buyer_id,
    }).eq("id", listing_id).execute()

    # Log credit events
    db.table("credit_events").insert([
        {"player_id": buyer_id,  "delta": -sale_price, "reason": "market_purchase", "ref_id": listing_id},
        {"player_id": seller_id, "delta":  sale_price, "reason": "market_sale",     "ref_id": listing_id},
    ]).execute()

    return {"ok": True, "sale_price": sale_price}


@router.delete("/listings/{listing_id}")
async def cancel_listing(listing_id: str, authorization: str = Header(...)):
    db = get_client()
    seller_id = _resolve_player(db, authorization)

    listing = db.table("market_listings") \
        .select("id, seller_id, status") \
        .eq("id", listing_id) \
        .maybe_single() \
        .execute()
    if not listing or not listing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.data["seller_id"] != seller_id:
        raise HTTPException(status_code=403, detail="Not your listing")
    if listing.data["status"] != "active":
        raise HTTPException(status_code=409, detail="Listing is not active")

    db.table("market_listings") \
        .update({"status": "cancelled"}) \
        .eq("id", listing_id) \
        .execute()

    return {"ok": True}
