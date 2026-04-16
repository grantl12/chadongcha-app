from fastapi import APIRouter, Query
from typing import Optional
from db import get_client

router = APIRouter()


@router.get("/makes")
async def list_makes():
    db = get_client()
    result = db.table("makes").select("*").order("name").execute()
    return result.data


@router.get("/models")
async def list_models(make_id: Optional[str] = Query(None)):
    db = get_client()
    q = db.table("models").select("*")
    if make_id:
        q = q.eq("make_id", make_id)
    return q.order("name").execute().data


@router.get("/generations/{generation_id}")
async def get_generation(generation_id: str):
    db = get_client()
    result = db.table("generations").select("*, models(*, makes(*)), variants(*)") \
        .eq("id", generation_id).maybe_single().execute()
    if not result or not result.data:
        return None

    data = result.data

    # Attach first finder credits
    ff = db.table("first_finders") \
        .select("region_scope, region_value, badge_name, awarded_at, players(username)") \
        .eq("generation_id", generation_id) \
        .order("awarded_at") \
        .execute()
    data["first_finders"] = ff.data if ff else []

    # Global catch count for this generation
    from postgrest.types import CountMethod
    count_res = db.table("catches").select("id", count=CountMethod.exact) \
        .eq("generation_id", generation_id).execute()
    data["global_catch_count"] = count_res.count or 0

    return data


@router.get("/search")
async def search_vehicles(q: str = Query(..., min_length=2)):
    db = get_client()
    result = db.table("generations").select("id, common_name, rarity_tier, models(name, makes(name))") \
        .ilike("common_name", f"%{q}%").limit(20).execute()
    return result.data


@router.get("/resolve")
async def resolve_generation(make: str, model: str, generation: str):
    """
    Map classifier output (make / model / generation string) to a DB generation ID.
    Called by the app before syncing a catch so generation_id is never null.

    Matching strategy:
    1. Exact make + model + generation common_name (case-insensitive)
    2. Fallback: make + model only, return the generation whose common_name most
       closely contains the classifier's generation string
    Returns {"generation_id": <uuid> | null, "rarity_tier": <str> | null}.
    """
    db = get_client()
    result = db.table("generations") \
        .select("id, common_name, rarity_tier, models(name, makes(name))") \
        .execute()

    make_lower  = make.strip().lower()
    model_lower = model.strip().lower()
    gen_lower   = generation.strip().lower()

    candidates = []
    for row in result.data:
        m = row.get("models") or {}
        mk = (m.get("makes") or {}).get("name", "").lower()
        mn = m.get("name", "").lower()
        if mk == make_lower and mn == model_lower:
            candidates.append(row)

    if not candidates:
        return {"generation_id": None, "rarity_tier": None}

    # Exact match on common_name first
    for row in candidates:
        if row["common_name"].lower() == gen_lower:
            return {"generation_id": row["id"], "rarity_tier": row["rarity_tier"]}

    # Partial match — generation string contains the classifier token or vice versa
    for row in candidates:
        cn = row["common_name"].lower()
        if gen_lower in cn or cn in gen_lower:
            return {"generation_id": row["id"], "rarity_tier": row["rarity_tier"]}

    # Last resort: return the most recent generation (highest year_start) for this model
    return {"generation_id": candidates[0]["id"], "rarity_tier": candidates[0]["rarity_tier"]}
