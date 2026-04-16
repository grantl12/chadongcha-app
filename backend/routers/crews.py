from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from db import get_client

router = APIRouter()

class CreateCrewRequest(BaseModel):
    name: str
    description: Optional[str] = None
    home_city: Optional[str] = None
    team_color: str = "#e63946"

def _resolve_player(db, authorization: str) -> str:
    token = authorization.replace("Bearer ", "")
    try:
        result = db.auth.get_user(token)
        if not result or not result.user:
            raise ValueError()
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.get("/")
async def list_crews(limit: int = 20, offset: int = 0):
    db = get_client()
    res = db.table("crews") \
        .select("id, name, home_city, team_color") \
        .order("name") \
        .range(offset, offset + limit - 1) \
        .execute()
    return res.data or []

@router.post("/")
async def create_crew(body: CreateCrewRequest, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    # Require Pro subscription to create a crew
    player = db.table("players").select("crew_id, is_subscriber").eq("id", player_id).maybe_single().execute()
    if not (player and player.data and player.data.get("is_subscriber")):
        raise HTTPException(status_code=402, detail="Creating a crew requires a Pro subscription.")

    # Check if player is already in a crew
    if player and player.data and player.data.get("crew_id"):
        raise HTTPException(status_code=400, detail="You are already in a crew. Leave your current crew first.")

    # Create crew
    try:
        new_crew = db.table("crews").insert({
            "name": body.name,
            "description": body.description,
            "home_city": body.home_city,
            "team_color": body.team_color,
            "leader_id": player_id
        }).execute()
        
        if not new_crew.data:
            raise HTTPException(status_code=500, detail="Failed to create crew")
        
        crew_id = new_crew.data[0]["id"]
        
        # Add player to crew
        db.table("players").update({"crew_id": crew_id}).eq("id", player_id).execute()
        
        return new_crew.data[0]
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="A crew with this name already exists")
        raise HTTPException(status_code=500, detail=f"Could not create crew: {str(e)}")

@router.get("/{crew_id}")
async def get_crew(crew_id: str):
    db = get_client()
    res = db.table("crews").select("*").eq("id", crew_id).maybe_single().execute()
    if not res or not res.data:
        raise HTTPException(status_code=404, detail="Crew not found")
    
    # Get members
    members = db.table("players").select("id, username, level, xp").eq("crew_id", crew_id).execute()
    
    data = res.data
    data["members"] = members.data or []
    return data

@router.post("/{crew_id}/join")
async def join_crew(crew_id: str, authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    # Verify crew exists
    crew = db.table("crews").select("id").eq("id", crew_id).maybe_single().execute()
    if not crew or not crew.data:
        raise HTTPException(status_code=404, detail="Crew not found")

    # Check current crew
    player = db.table("players").select("crew_id").eq("id", player_id).maybe_single().execute()
    if player and player.data and player.data.get("crew_id"):
        raise HTTPException(status_code=400, detail="You are already in a crew.")

    db.table("players").update({"crew_id": crew_id}).eq("id", player_id).execute()
    return {"ok": True}

@router.post("/leave")
async def leave_crew(authorization: str = Header(...)):
    db = get_client()
    player_id = _resolve_player(db, authorization)

    player = db.table("players").select("crew_id").eq("id", player_id).maybe_single().execute()
    if not player or not player.data or not player.data.get("crew_id"):
        raise HTTPException(status_code=400, detail="You are not in a crew.")

    crew_id = player.data["crew_id"]
    
    # If leader leaves, what happens? For now, the crew stays but leader_id might become null or we transfer it.
    # Simple approach: set crew_id to null for the player.
    db.table("players").update({"crew_id": None}).eq("id", player_id).execute()
    
    # Optional: If crew has 0 members, delete it?
    members = db.table("players").select("id", count="exact").eq("crew_id", crew_id).execute()
    if members.count == 0:
        db.table("crews").delete().eq("id", crew_id).execute()

    return {"ok": True}
