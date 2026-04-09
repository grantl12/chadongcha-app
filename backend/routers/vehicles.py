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
    return result.data


@router.get("/search")
async def search_vehicles(q: str = Query(..., min_length=2)):
    db = get_client()
    result = db.table("generations").select("id, common_name, rarity_tier, models(name, makes(name))") \
        .ilike("common_name", f"%{q}%").limit(20).execute()
    return result.data
