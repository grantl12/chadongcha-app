"""
Community ID router — crowd-sourced vehicle identification.

Endpoints:
  GET  /community/unknown              — open queue, newest first
  GET  /community/unknown/{id}         — single unknown catch with suggestion tally
  POST /community/suggest              — submit a make/model suggestion

  GET  /community/reddit-queue         — Reddit ID mini-game cards (unseen by player)
  POST /community/reddit-guess         — submit a guess, returns correct + XP
"""

import random
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from db import get_client
from services.xp_service import apply_xp, get_orbital_boost

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


# ─── Reddit ID mini-game ──────────────────────────────────────────────────────

# Body-style buckets for biasing wrong answers toward plausible alternatives.
# Classes not listed fall into 'other'.
_BODY_STYLE_MAP: dict[str, list[str]] = {
    "sedan":      ["Toyota Camry XV70", "Honda Civic FE", "Honda Accord CN2",
                   "BMW 3-Series G20", "BMW M3 G80", "Mercedes C-Class W206", "Audi A4 B9"],
    "coupe":      ["Toyota GR86 ZN8", "Toyota Supra A90", "BMW M4 G82",
                   "Mercedes AMG-GT X290", "Porsche 911 992", "Ferrari SF90 F173",
                   "Lamborghini Huracan LB724", "Bugatti Chiron VGT",
                   "Dodge Challenger LC", "Nissan Z RZ34", "Ford Mustang S650",
                   "Chevrolet Corvette C8"],
    "suv":        ["Honda CR-V RS", "Jeep Grand Cherokee WL", "Jeep Wrangler JL",
                   "Mitsubishi Outlander CW"],
    "truck":      ["Ford F-150 P702", "Chevrolet Silverado GMTK2"],
    "hatchback":  ["Mazda3 BP", "Volkswagen Golf MK8", "Subaru WRX VB", "Subaru BRZ ZD8"],
    "convertible":["Mazda MX-5 ND"],
}

# Flat list for random fallback
_ALL_CLASSES = [c for bucket in _BODY_STYLE_MAP.values() for c in bucket]


def _wrong_answers(correct_class: str, body_style: Optional[str], n: int = 3) -> list[str]:
    """
    Return n wrong answer labels biased toward the same body style as the
    correct answer. Falls back to random if the bucket is too small.
    """
    bucket = _BODY_STYLE_MAP.get((body_style or "").lower(), [])
    pool = [c for c in bucket if c != correct_class]

    # Top up from other classes if bucket is too small
    if len(pool) < n:
        others = [c for c in _ALL_CLASSES if c != correct_class and c not in pool]
        random.shuffle(others)
        pool += others

    random.shuffle(pool)
    return pool[:n]


def _display_label(class_str: str) -> str:
    """'Toyota GR86 ZN8' → 'Toyota GR86'  (drop generation code)."""
    parts = class_str.split()
    return " ".join(parts[:-1]) if len(parts) > 2 else class_str


REDDIT_GUESS_XP = 25


@router.get("/reddit-queue")
async def reddit_queue(limit: int = 5, authorization: str = Header(...)):
    """
    Return up to `limit` Reddit ID cards the player hasn't guessed yet.
    Each card includes the image, attribution, and 4 shuffled multiple-choice options.
    """
    db = get_client()
    player_id = _resolve_player(db, authorization)

    # IDs this player has already guessed
    seen_res = db.table("reddit_id_guesses") \
        .select("queue_item_id") \
        .eq("player_id", player_id) \
        .execute()
    seen_ids = [r["queue_item_id"] for r in (seen_res.data or [])]

    query = db.table("reddit_id_queue") \
        .select("id, image_url, post_title, reddit_author, answer_class, answer_label, body_style") \
        .eq("status", "active") \
        .order("created_at", desc=False) \
        .limit(limit + len(seen_ids))

    res = query.execute()
    rows = [r for r in (res.data or []) if r["id"] not in seen_ids][:limit]

    cards = []
    for r in rows:
        wrongs  = _wrong_answers(r["answer_class"], r["body_style"])
        options = [r["answer_label"]] + [_display_label(w) for w in wrongs]
        random.shuffle(options)
        cards.append({
            "id":           r["id"],
            "imageUrl":     r["image_url"],
            "redditAuthor": r["reddit_author"],
            "options":      options,
        })

    return cards


class RedditGuessBody(BaseModel):
    queue_item_id: str
    guessed_label: str   # must match one of the option labels returned by /reddit-queue


@router.post("/reddit-guess")
async def reddit_guess(body: RedditGuessBody, authorization: str = Header(...)):
    """
    Submit a guess for a Reddit ID card.
    Returns correct (bool), correct_label, and xp_earned.
    Orbital boost applies.
    """
    db = get_client()
    player_id = _resolve_player(db, authorization)

    item = db.table("reddit_id_queue") \
        .select("id, answer_class, answer_label, body_style") \
        .eq("id", body.queue_item_id) \
        .eq("status", "active") \
        .maybe_single() \
        .execute()
    if not item or not item.data:
        raise HTTPException(status_code=404, detail="Queue item not found")

    # Idempotent — ignore re-guesses
    existing = db.table("reddit_id_guesses") \
        .select("id, correct, xp_awarded") \
        .eq("player_id", player_id) \
        .eq("queue_item_id", body.queue_item_id) \
        .maybe_single() \
        .execute()
    if existing and existing.data:
        return {
            "correct":       existing.data["correct"],
            "correct_label": item.data["answer_label"],
            "xp_earned":     existing.data["xp_awarded"],
            "new_total_xp":  _get_player_xp(db, player_id),
            "new_level":     _get_player_level(db, player_id),
        }

    correct = body.guessed_label.strip().lower() == item.data["answer_label"].strip().lower()
    xp_earned = 0

    if correct:
        boost_result  = get_orbital_boost(db, player_id)
        orbital_boost = boost_result[0] if boost_result else 1.0
        xp_earned     = int(REDDIT_GUESS_XP * orbital_boost)
        apply_xp(db, player_id, xp_earned, body.queue_item_id, ["reddit_id_correct"])

    db.table("reddit_id_guesses").insert({
        "player_id":     player_id,
        "queue_item_id": body.queue_item_id,
        "guessed_class": body.guessed_label,
        "correct":       correct,
        "xp_awarded":    xp_earned,
    }).execute()

    return {
        "correct":       correct,
        "correct_label": item.data["answer_label"],
        "xp_earned":     xp_earned,
        "new_total_xp":  _get_player_xp(db, player_id),
        "new_level":     _get_player_level(db, player_id),
    }


def _get_player_xp(db, player_id: str) -> int:
    r = db.table("players").select("xp").eq("id", player_id).single().execute()
    return r.data["xp"] if r.data else 0


def _get_player_level(db, player_id: str) -> int:
    r = db.table("players").select("level").eq("id", player_id).single().execute()
    return r.data["level"] if r.data else 1
