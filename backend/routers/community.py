"""
Community ID router — crowd-sourced vehicle identification.

Players browse unknown catches (those with a photo but no resolved generation)
and vote on what the vehicle is. When enough votes agree, a moderator confirms.

Endpoints:
  GET  /community/unknown              — open queue, newest first
  GET  /community/unknown/{id}         — single unknown catch with suggestion tally
  POST /community/suggest              — submit a make/model suggestion
  GET  /community/unknown/{id}/suggestions — full suggestion list for a catch
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from db import get_client
from services.xp_service import compute_xp, apply_xp, SCAN_360_MULTIPLIER

router = APIRouter()


def _resolve_player(db, authorization: str) -> str:
    token = authorization.replace("Bearer ", "")
    try:
        result = db.auth.get_user(token)
        if not result or not result.user:
            raise ValueError()
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def _resolve_generation(db, make: str, model: str, generation: str) -> Optional[str]:
    """Attempt to match free-text make/model/generation to a generations row."""
    # Find make
    make_res = db.table("makes") \
        .select("id") \
        .ilike("name", f"%{make}%") \
        .limit(1) \
        .execute()
    if not make_res.data:
        return None
    make_id = make_res.data[0]["id"]

    # Find model under that make
    model_res = db.table("models") \
        .select("id") \
        .eq("make_id", make_id) \
        .ilike("name", f"%{model}%") \
        .limit(1) \
        .execute()
    if not model_res.data:
        return None
    model_id = model_res.data[0]["id"]

    # Find generation — first try common_name match, then year_start
    gen_res = db.table("generations") \
        .select("id") \
        .eq("model_id", model_id) \
        .ilike("common_name", f"%{generation}%") \
        .limit(1) \
        .execute()
    if gen_res.data:
        return gen_res.data[0]["id"]

    # Fall back — just pick the most recent generation for this model
    fallback = db.table("generations") \
        .select("id") \
        .eq("model_id", model_id) \
        .order("year_start", desc=True) \
        .limit(1) \
        .execute()
    return fallback.data[0]["id"] if fallback.data else None


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/unknown")
async def list_unknown(limit: int = 20, offset: int = 0):
    """Browse open unknown catches that have a community photo."""
    db = get_client()

    res = db.table("unknown_catches") \
        .select(
            "id, catch_id, body_type, city, community_photo_ref, status, created_at, "
            "catches(catch_type, caught_at, players(username))"
        ) \
        .eq("status", "open") \
        .eq("photo_shared", True) \
        .not_.is_("community_photo_ref", "null") \
        .order("created_at", desc=True) \
        .range(offset, offset + limit - 1) \
        .execute()

    rows = res.data or []

    # Annotate with suggestion count
    ids = [r["id"] for r in rows]
    suggestion_counts: dict[str, int] = {}
    if ids:
        sugg_res = db.table("id_suggestions") \
            .select("unknown_catch_id") \
            .in_("unknown_catch_id", ids) \
            .execute()
        for s in (sugg_res.data or []):
            uid = s["unknown_catch_id"]
            suggestion_counts[uid] = suggestion_counts.get(uid, 0) + 1

    return [
        {
            "id":              r["id"],
            "catchId":         r["catch_id"],
            "bodyType":        r["body_type"],
            "city":            r["city"],
            "photoRef":        r["community_photo_ref"],
            "status":          r["status"],
            "createdAt":       r["created_at"],
            "catcher":         (r.get("catches") or {}).get("players", {}).get("username", "?"),
            "catchType":       (r.get("catches") or {}).get("catch_type", "unknown"),
            "suggestionCount": suggestion_counts.get(r["id"], 0),
        }
        for r in rows
    ]


@router.get("/unknown/{unknown_id}")
async def get_unknown(unknown_id: str):
    """Fetch a single unknown catch with suggestion tally."""
    db = get_client()

    res = db.table("unknown_catches") \
        .select(
            "id, catch_id, body_type, city, community_photo_ref, status, created_at, "
            "catches(catch_type, caught_at, players(username))"
        ) \
        .eq("id", unknown_id) \
        .maybe_single() \
        .execute()

    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Unknown catch not found")

    r = res.data

    # Top suggestions — group by generation_id, count votes
    sugg_res = db.table("id_suggestions") \
        .select("generation_id, generations(common_name, models(name, makes(name)))") \
        .eq("unknown_catch_id", unknown_id) \
        .execute()

    tally: dict[str, dict] = {}
    for s in (sugg_res.data or []):
        gid = s["generation_id"]
        if gid not in tally:
            gen  = s.get("generations") or {}
            mod  = gen.get("models") or {}
            make = (mod.get("makes") or {}).get("name", "?")
            tally[gid] = {
                "generationId": gid,
                "label":        gen.get("common_name") or f"{make} {mod.get('name', '')}".strip(),
                "votes":        0,
            }
        tally[gid]["votes"] += 1

    suggestions = sorted(tally.values(), key=lambda x: -x["votes"])

    return {
        "id":          r["id"],
        "catchId":     r["catch_id"],
        "bodyType":    r["body_type"],
        "city":        r["city"],
        "photoRef":    r["community_photo_ref"],
        "status":      r["status"],
        "createdAt":   r["created_at"],
        "catcher":     (r.get("catches") or {}).get("players", {}).get("username", "?"),
        "catchType":   (r.get("catches") or {}).get("catch_type", "unknown"),
        "suggestions": suggestions,
    }


class SuggestBody(BaseModel):
    unknown_catch_id: str
    make:             str
    model:            str
    generation:       str = ""   # hint — used to narrow generation lookup


@router.post("/suggest")
async def suggest_id(body: SuggestBody, authorization: str = Header(...)):
    """
    Submit an identification suggestion for an unknown catch.
    Resolves make/model → generation_id. One suggestion per player per catch
    (upsert on conflict).
    """
    db = get_client()
    player_id = _resolve_player(db, authorization)

    # Verify unknown catch exists and is still open
    unk = db.table("unknown_catches") \
        .select("id, status") \
        .eq("id", body.unknown_catch_id) \
        .maybe_single() \
        .execute()
    if not unk or not unk.data:
        raise HTTPException(status_code=404, detail="Unknown catch not found")
    if unk.data["status"] != "open":
        raise HTTPException(status_code=409, detail="This catch is already identified")

    # Resolve generation_id from the text hint
    generation_id = _resolve_generation(db, body.make, body.model, body.generation)
    if not generation_id:
        raise HTTPException(
            status_code=422,
            detail=f"Could not find a matching vehicle for '{body.make} {body.model}'. "
                   "Try using the exact name from the catalog."
        )

    # Upsert — player can revise their suggestion
    try:
        res = db.table("id_suggestions").upsert({
            "unknown_catch_id": body.unknown_catch_id,
            "player_id":        player_id,
            "generation_id":    generation_id,
        }, on_conflict="unknown_catch_id,player_id").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not record suggestion: {e}")

    # Auto-confirm if 3+ players agree on the same generation
    _maybe_auto_confirm(db, body.unknown_catch_id)

    return {"ok": True, "generation_id": generation_id}


def _maybe_auto_confirm(db, unknown_catch_id: str) -> None:
    """If 3+ suggestions share the same generation_id, mark the catch confirmed."""
    QUORUM = 3
    sugg_res = db.table("id_suggestions") \
        .select("generation_id") \
        .eq("unknown_catch_id", unknown_catch_id) \
        .execute()

    tally: dict[str, int] = {}
    for s in (sugg_res.data or []):
        gid = s["generation_id"]
        tally[gid] = tally.get(gid, 0) + 1

    winning_gen = next((gid for gid, count in tally.items() if count >= QUORUM), None)
    if not winning_gen:
        return

    # Confirm the unknown catch
    db.table("unknown_catches").update({
        "status":                   "confirmed",
        "confirmed_generation_id":  winning_gen,
    }).eq("id", unknown_catch_id).execute()

    # Backfill the catches row with the resolved generation
    unk = db.table("unknown_catches") \
        .select("catch_id") \
        .eq("id", unknown_catch_id) \
        .maybe_single() \
        .execute()
    if not (unk and unk.data):
        return

    catch_id = unk.data["catch_id"]
    db.table("catches").update({
        "generation_id": winning_gen,
    }).eq("id", catch_id).execute()

    # Award retroactive XP to the original catcher.
    # We skip personal-first and orbital-boost multipliers since those
    # windows have passed — just the base rarity XP for the catch type.
    catch_row = db.table("catches") \
        .select("player_id, catch_type") \
        .eq("id", catch_id) \
        .maybe_single() \
        .execute()
    gen_row = db.table("generations") \
        .select("rarity_tier") \
        .eq("id", winning_gen) \
        .maybe_single() \
        .execute()

    if catch_row and catch_row.data and gen_row and gen_row.data:
        xp, reasons = compute_xp(
            catch_type=catch_row.data["catch_type"],
            generation_id=winning_gen,
            rarity_tier=gen_row.data["rarity_tier"],
        )
        if xp > 0:
            reasons.append("community_id_confirmed")
            try:
                apply_xp(db, catch_row.data["player_id"], xp, catch_id, reasons)
            except Exception:
                pass   # XP award is best-effort — don't fail the confirmation
