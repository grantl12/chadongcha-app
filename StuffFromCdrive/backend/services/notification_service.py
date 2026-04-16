"""
Expo Push Notification service.

Sends push notifications via the Expo Push API (no FCM/APNs credentials needed
for Expo-managed builds — Expo proxies for us).

Usage:
    from services.notification_service import notify_road_king_taken, notify_level_up, ...

All functions are fire-and-forget: they catch exceptions so a notification
failure never blocks the catch response.
"""
import logging
import httpx

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _send(db, player_id: str, title: str, body: str, data: dict | None = None):
    """Fetch the player's push token and fire a notification. Best-effort."""
    try:
        result = db.table("players").select("expo_push_token") \
            .eq("id", player_id).maybe_single().execute()
        token = result.data.get("expo_push_token") if result.data else None
        if not token:
            return

        payload = {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
        }
        if data:
            payload["data"] = data

        with httpx.Client(timeout=5) as client:
            resp = client.post(EXPO_PUSH_URL, json=payload)
            if resp.status_code != 200:
                log.warning(f"Push failed for {player_id}: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        log.warning(f"notify({player_id}) error: {e}")


# --- Public helpers ---

def notify_road_king_taken(db, dethroned_player_id: str, road_name: str, new_king_username: str):
    """Tell the dethroned king they lost their road."""
    _send(
        db, dethroned_player_id,
        title="Road Taken!",
        body=f"{new_king_username} just claimed {road_name or 'your road'}.",
        data={"type": "road_king_taken", "road_name": road_name},
    )


def notify_road_king_claimed(db, player_id: str, road_name: str, xp_earned: int):
    """Confirm to the new king that they took the road."""
    _send(
        db, player_id,
        title="Road King!",
        body=f"You now rule {road_name or 'a new road'}. +{xp_earned} XP",
        data={"type": "road_king_claimed", "road_name": road_name},
    )


def notify_level_up(db, player_id: str, new_level: int):
    _send(
        db, player_id,
        title=f"Level {new_level}!",
        body="You levelled up. Keep hunting.",
        data={"type": "level_up", "level": new_level},
    )


def notify_first_finder(db, player_id: str, badge_name: str, vehicle_name: str):
    _send(
        db, player_id,
        title=f"First Finder: {badge_name}",
        body=f"You're among the first to catch a {vehicle_name}.",
        data={"type": "first_finder", "badge": badge_name},
    )


def notify_spotted(db, owner_id: str, spotter_username: str, city: str | None):
    """Tell a plate owner their car was spotted."""
    where = f" in {city}" if city else ""
    _send(
        db, owner_id,
        title="Your car was spotted!",
        body=f"{spotter_username} caught your vehicle{where}.",
        data={"type": "plate_spotted"},
    )


def notify_spotter_award(db, spotter_id: str, xp: int):
    """Tell the catcher they earned a Spotter bonus."""
    _send(
        db, spotter_id,
        title="Spotter Award!",
        body=f"You caught a registered plate. +{xp} bonus XP.",
        data={"type": "spotter_award", "xp": xp},
    )


def notify_orbital_boost_expiring(db, player_id: str, remaining_min: int):
    """Warn when boost is about to expire (5 min left)."""
    _send(
        db, player_id,
        title="Orbital Boost Fading",
        body=f"XP boost expires in {remaining_min} minutes — catch more vehicles!",
        data={"type": "orbital_boost_expiring"},
    )
