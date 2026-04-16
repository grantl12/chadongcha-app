"""
Community ID router — crowd-sourced vehicle identification and ID mini-game.
"""

import random
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from db import get_client
from services.xp_service import apply_xp, compute_xp, get_orbital_boost

router = APIRouter()

ID_GAME_GUESS_XP = 25

# --- Helpers ---

def levenshtein_distance(s1, s2):
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def is_close_match(guess, actual, threshold=2):
    """
    Returns true if the guess is within the Levenshtein threshold of the actual answer.
    Handles small spelling errors while resisting exploitation.
    """
    g = guess.lower().strip()
    a = actual.lower().strip()
    if not g: return False
    # Threshold scales slightly with length for very short names
    dist = levenshtein_distance(g, a)
    max_dist = threshold if len(a) > 4 else 1
    return dist <= max_dist

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
    make_res = db.table("makes").select("id").ilike("name", f"%{make}%").limit(1).execute()
    if not make_res.data: return None
    make_id = make_res.data[0]["id"]

    model_res = db.table("models").select("id").eq("make_id", make_id).ilike("name", f"%{model}%").limit(1).execute()
    if not model_res.data: return None
    model_id = model_res.data[0]["id"]

    gen_res = db.table("generations").select("id").eq("model_id", model_id).ilike("common_name", f"%{generation}%").limit(1).execute()
    if gen_res.data: return gen_res.data[0]["id"]

    fallback = db.table("generations").select("id").eq("model_id", model_id).order("year_start", desc=True).limit(1).execute()
    return fallback.data[0]["id"] if fallback.data else None

# --- Unknown Catches Queue ---

@router.get("/unknown")
async def list_unknown(limit: int = 20, offset: int = 0):
    db = get_client()
    res = db.table("unknown_catches") \
        .select("id, catch_id, body_type, city, community_photo_ref, status, created_at, catches(catch_type, caught_at, players(username))") \
        .eq("status", "open") \
        .eq("photo_shared", True) \
        .not_.is_("community_photo_ref", "null") \
        .order("created_at", desc=True) \
        .range(offset, offset + limit - 1) \
        .execute()
    rows = res.data or []
    ids = [r["id"] for r in rows]
    suggestion_counts = {}
    if ids:
        sugg_res = db.table("id_suggestions").select("unknown_catch_id").in_("unknown_catch_id", ids).execute()
        for s in (sugg_res.data or []):
            uid = s["unknown_catch_id"]
            suggestion_counts[uid] = suggestion_counts.get(uid, 0) + 1
    return [{
        "id": r["id"],
        "catchId": r["catch_id"],
        "bodyType": r["body_type"],
        "city": r["city"],
        "photoRef": r["community_photo_ref"],
        "status": r["status"],
        "createdAt": r["created_at"],
        "catcher": (r.get("catches") or {}).get("players", {}).get("username", "?"),
        "catchType": (r.get("catches") or {}).get("catch_type", "unknown"),
        "suggestionCount": suggestion_counts.get(r["id"], 0),
    } for r in rows]

@router.get("/unknown/{unknown_id}")
async def get_unknown(unknown_id: str):
    db = get_client()
    res = db.table("unknown_catches").select("id, catch_id, body_type, city, community_photo_ref, status, created_at, catches(catch_type, caught_at, players(username))").eq("id", unknown_id).maybe_single().execute()
    if not res or not res.data: raise HTTPException(status_code=404, detail="Unknown catch not found")
    r = res.data
    sugg_res = db.table("id_suggestions").select("generation_id, generations(common_name, models(name, makes(name)))").eq("unknown_catch_id", unknown_id).execute()
    tally = {}
    for s in (sugg_res.data or []):
        gid = s["generation_id"]
        if gid not in tally:
            gen = s.get("generations") or {}
            mod = gen.get("models") or {}
            make = (mod.get("makes") or {}).get("name", "?")
            tally[gid] = {
                "generationId": gid,
                "label": gen.get("common_name") or f"{make} {mod.get('name', '')}".strip(),
                "votes": 0,
            }
        tally[gid]["votes"] += 1
    suggestions = sorted(tally.values(), key=lambda x: -x["votes"])
    return {
        "id": r["id"],
        "catchId": r["catch_id"],
        "bodyType": r["body_type"],
        "city": r["city"],
        "photoRef": r["community_photo_ref"],
        "status": r["status"],
        "createdAt": r["created_at"],
        "catcher": (r.get("catches") or {}).get("players", {}).get("username", "?"),
        "catchType": (r.get("catches") or {}).get("catch_type", "unknown"),
        "suggestions": suggestions,
    }

class SuggestBody(BaseModel):
    unknown_catch_id: str
    make: str
    model: str
    generation: str = ""

@router.post("/suggest")
async def suggest_id(body: SuggestBody, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)
    unk = db.table("unknown_catches").select("id, status").eq("id", body.unknown_catch_id).maybe_single().execute()
    if not unk or not unk.data: raise HTTPException(status_code=404, detail="Unknown catch not found")
    if unk.data["status"] != "open": raise HTTPException(status_code=409, detail="This catch is already identified")
    generation_id = _resolve_generation(db, body.make, body.model, body.generation)
    if not generation_id: raise HTTPException(status_code=422, detail="Could not find a matching vehicle.")
    db.table("id_suggestions").upsert({"unknown_catch_id": body.unknown_catch_id, "player_id": player_id, "generation_id": generation_id}, on_conflict="unknown_catch_id,player_id").execute()
    _maybe_auto_confirm(db, body.unknown_catch_id)
    return {"ok": True, "generation_id": generation_id}

def _maybe_auto_confirm(db, unknown_catch_id: str) -> None:
    QUORUM = 3
    sugg_res = db.table("id_suggestions").select("generation_id").eq("unknown_catch_id", unknown_catch_id).execute()
    tally = {}
    for s in (sugg_res.data or []):
        gid = s["generation_id"]
        tally[gid] = tally.get(gid, 0) + 1
    winning_gen = next((gid for gid, count in tally.items() if count >= QUORUM), None)
    if not winning_gen: return
    db.table("unknown_catches").update({"status": "confirmed", "confirmed_generation_id": winning_gen}).eq("id", unknown_catch_id).execute()
    unk = db.table("unknown_catches").select("catch_id").eq("id", unknown_catch_id).maybe_single().execute()
    if not (unk and unk.data): return
    catch_id = unk.data["catch_id"]
    db.table("catches").update({"generation_id": winning_gen}).eq("id", catch_id).execute()
    catch_row = db.table("catches").select("player_id, catch_type").eq("id", catch_id).maybe_single().execute()
    gen_row = db.table("generations").select("rarity_tier").eq("id", winning_gen).maybe_single().execute()
    if catch_row and catch_row.data and gen_row and gen_row.data:
        xp, reasons = compute_xp(
            db, catch_row.data["player_id"],
            catch_type=catch_row.data["catch_type"],
            generation_id=winning_gen,
            rarity_tier=gen_row.data["rarity_tier"]
        )
        if xp > 0:
            reasons.append("community_id_confirmed")
            apply_xp(db, catch_row.data["player_id"], xp, catch_id, reasons)

# --- ID Game Mini-game ---

_BODY_STYLE_MAP: dict[str, list[str]] = {
    "sedan": ["Toyota Camry XV70", "Honda Civic FE", "Honda Accord CN2", "BMW 3-Series G20", "BMW M3 G80", "Mercedes C-Class W206", "Audi A4 B9"],
    "coupe": ["Toyota GR86 ZN8", "Toyota Supra A90", "BMW M4 G82", "Mercedes AMG-GT X290", "Porsche 911 992", "Ferrari SF90 F173", "Lamborghini Huracan LB724", "Bugatti Chiron VGT", "Dodge Challenger LC", "Nissan Z RZ34", "Ford Mustang S650", "Chevrolet Corvette C8"],
    "suv": ["Honda CR-V RS", "Jeep Grand Cherokee WL", "Jeep Wrangler JL", "Mitsubishi Outlander CW"],
    "truck": ["Ford F-150 P702", "Chevrolet Silverado GMTK2"],
    "hatchback": ["Mazda3 BP", "Volkswagen Golf MK8", "Subaru WRX VB", "Subaru BRZ ZD8"],
    "convertible": ["Mazda MX-5 ND"],
}
_ALL_CLASSES = [c for bucket in _BODY_STYLE_MAP.values() for c in bucket]

def _wrong_answers(correct_class: str, body_style: Optional[str], n: int = 3) -> list[str]:
    bucket = _BODY_STYLE_MAP.get((body_style or "").lower(), [])
    pool = [c for c in bucket if c != correct_class]
    if len(pool) < n:
        others = [c for c in _ALL_CLASSES if c != correct_class and c not in pool]
        random.shuffle(others)
        pool += others
    random.shuffle(pool)
    return pool[:n]

def _display_label(class_str: str) -> str:
    parts = class_str.split()
    return " ".join(parts[:-1]) if len(parts) > 2 else class_str

@router.get("/identify-queue")
async def identify_queue(limit: int = 5, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)
    seen_res = db.table("id_game_guesses").select("card_id").eq("player_id", player_id).execute()
    seen_ids = [r["card_id"] for r in (seen_res.data or [])]
    query = db.table("id_game_queue").select("id, image_url, author_username, answer_class, answer_label, body_style, is_text_entry, source").eq("status", "active").order("created_at", desc=False).limit(limit + len(seen_ids))
    res = query.execute()
    rows = [r for r in (res.data or []) if r["id"] not in seen_ids][:limit]
    cards = []
    for r in rows:
        options = []
        if not r["is_text_entry"]:
            wrongs = _wrong_answers(r["answer_class"], r["body_style"])
            options = [r["answer_label"]] + [_display_label(w) for w in wrongs]
            random.shuffle(options)
        cards.append({
            "id": r["id"],
            "imageUrl": r["image_url"],
            "author": r["author_username"],
            "options": options,
            "isTextEntry": r["is_text_entry"],
            "source": r["source"],
        })
    return cards

@router.post("/identify-guess")
async def identify_guess(body: GuessBody, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)
    item = db.table("id_game_queue").select("id, answer_class, answer_label, body_style, is_text_entry").eq("id", body.card_id).eq("status", "active").maybe_single().execute()
    if not item or not item.data: raise HTTPException(status_code=404, detail="Card not found")
    
    existing = db.table("id_game_guesses").select("id, correct, xp_awarded").eq("player_id", player_id).eq("card_id", body.card_id).maybe_single().execute()
    if existing and existing.data:
        return {"correct": existing.data["correct"], "correct_label": item.data["answer_label"], "xp_earned": existing.data["xp_awarded"], "new_total_xp": _get_player_xp(db, player_id), "new_level": _get_player_level(db, player_id)}

    if item.data["is_text_entry"]:
        correct = is_close_match(body.guess, item.data["answer_label"])
    else:
        correct = body.guess.strip().lower() == item.data["answer_label"].strip().lower()
    
    xp_earned = 0
    if correct:
        boost_result = get_orbital_boost(db, player_id)
        orbital_boost = boost_result[0] if boost_result else 1.0
        # Text entry guesses earn double XP for difficulty
        base_xp = ID_GAME_GUESS_XP * 2 if item.data["is_text_entry"] else ID_GAME_GUESS_XP
        xp_earned = int(base_xp * orbital_boost)
        apply_xp(db, player_id, xp_earned, body.card_id, ["id_game_correct"])

    db.table("id_game_guesses").insert({"player_id": player_id, "card_id": body.card_id, "guessed_class": body.guess, "correct": correct, "xp_awarded": xp_earned}).execute()
    
    # Badge Checks (Completionist Satisfaction)
    new_badge = None
    if correct:
        new_badge = _check_id_badges(db, player_id)

    return {
        "correct":       correct,
        "correct_label": item.data["answer_label"],
        "xp_earned":     xp_earned,
        "new_total_xp":  _get_player_xp(db, player_id),
        "new_level":     _get_player_level(db, player_id),
        "badge_earned":  new_badge
    }

def _check_id_badges(db, player_id: str) -> Optional[dict]:
    """
    Checks for and awards ID game achievement badges:
      - streak_10: 10 correct in a row
      - text_master_25: 25 correct text-entry guesses
      - volume_100: 100 total correct guesses
    Returns the first newly awarded badge info, or None.
    """
    # 1. Streak 10 (Sharpshooter)
    # Most recent 10 guesses must all be correct
    recent_res = db.table("id_game_guesses") \
        .select("correct") \
        .eq("player_id", player_id) \
        .order("created_at", desc=True) \
        .limit(10) \
        .execute()
    recent = recent_res.data or []
    if len(recent) == 10 and all(r["correct"] for r in recent):
        badge = _award_badge(db, player_id, "streak_10", "Sharpshooter")
        if badge: return badge

    # 2. Text Master 25 (Type Master)
    # 25 correct guesses on cards where is_text_entry = true
    # Requires a join or a count on the guesses where the card was text entry
    text_res = db.table("id_game_guesses") \
        .select("id", count="exact") \
        .eq("player_id", player_id) \
        .eq("correct", True) \
        .filter("card_id", "in", f"({_get_text_card_ids_subquery(db)})") \
        .execute()
    if (text_res.count or 0) >= 25:
        badge = _award_badge(db, player_id, "text_master_25", "Type Master")
        if badge: return badge

    # 3. Volume 100 (Catalog Chronicler)
    total_res = db.table("id_game_guesses") \
        .select("id", count="exact") \
        .eq("player_id", player_id) \
        .eq("correct", True) \
        .execute()
    if (total_res.count or 0) >= 100:
        badge = _award_badge(db, player_id, "volume_100", "Catalog Chronicler")
        if badge: return badge

    return None

def _award_badge(db, player_id: str, badge_type: str, label: str) -> Optional[dict]:
    """Award badge if not already owned. Returns badge info if newly awarded."""
    already = db.table("player_badges") \
        .select("id") \
        .eq("player_id", player_id) \
        .eq("badge_type", badge_type) \
        .maybe_single() \
        .execute()
    if already and already.data: return None

    db.table("player_badges").insert({
        "player_id":  player_id,
        "badge_type": badge_type,
        "label":      label
    }).execute()
    
    return {"type": badge_type, "label": label}

def _get_text_card_ids_subquery(db) -> str:
    """Helper to get a list of card IDs that are text entry."""
    res = db.table("id_game_queue").select("id").eq("is_text_entry", True).execute()
    ids = [f"'{r['id']}'" for r in (res.data or [])]
    return ",".join(ids) if ids else "'00000000-0000-0000-0000-000000000000'"

def _get_player_xp(db, player_id: str) -> int:
    r = db.table("players").select("xp").eq("id", player_id).single().execute()
    return r.data["xp"] if r.data else 0

def _get_player_level(db, player_id: str) -> int:
    r = db.table("players").select("level").eq("id", player_id).single().execute()
    return r.data["level"] if r.data else 1
