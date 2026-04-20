"""
End-to-end test for Dash Sentry (highway) catch flow.

Tests the full path: API auth → POST /catches → Supabase DB write confirmed.

Usage:
    cd backend
    python scripts/test_dash_sentry.py --email you@example.com --password yourpass

    # Or set env vars TEST_EMAIL / TEST_PASSWORD and run without flags:
    python scripts/test_dash_sentry.py

Optional flags:
    --api     Override API base URL (default: production)
    --keep    Don't delete the test catch row after the run
"""
import argparse
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone

# Load .env if present (no external deps beyond stdlib for the test harness itself)
_env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

API_BASE = "https://chadongcha-production.up.railway.app"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SERVICE_KEY", "")
)


# ---------------------------------------------------------------------------
# Tiny HTTP helpers (stdlib only)
# ---------------------------------------------------------------------------

def _post(url: str, payload: dict, token: str | None = None) -> dict:
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} from {url}: {body}") from e


def _supabase_get(path: str, params: dict | None = None) -> list[dict]:
    """Direct Supabase REST query using the service key."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{qs}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def _supabase_delete(table: str, catch_id: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{catch_id}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }, method="DELETE")
    with urllib.request.urlopen(req, timeout=15):
        pass


# ---------------------------------------------------------------------------
# Test steps
# ---------------------------------------------------------------------------

def step_signin(api: str, email: str, password: str) -> tuple[str, str]:
    print(f"  → POST {api}/auth/signin")
    result = _post(f"{api}/auth/signin", {"email": email, "password": password})
    token = result.get("access_token")
    player_id = result.get("user_id")
    if not token or not player_id:
        raise RuntimeError(f"Unexpected signin response: {result}")
    print(f"  ✓ Signed in as player {player_id[:8]}…")
    return token, player_id


def step_get_generation() -> str:
    print("  → Supabase: SELECT id FROM generations LIMIT 1")
    rows = _supabase_get("generations", {"select": "id,common_name", "limit": "1", "order": "created_at.asc"})
    if not rows:
        raise RuntimeError("No generations in DB — seed data may be missing")
    gen = rows[0]
    print(f"  ✓ Using generation: {gen.get('common_name', '(no name)')} ({gen['id'][:8]}…)")
    return gen["id"]


def step_post_catch(api: str, token: str, generation_id: str) -> str:
    payload = {
        "generation_id": generation_id,
        "catch_type": "highway",
        "color": "silver",
        "body_style": "sedan",
        "confidence": 0.82,
        "fuzzy_city": "Test City",
        "fuzzy_district": "Test District",
        "caught_at": datetime.now(timezone.utc).isoformat(),
    }
    print(f"  → POST {api}/catches  (highway, confidence=0.82)")
    result = _post(f"{api}/catches", payload, token=token)
    catch_id = result.get("catch_id")
    if not catch_id:
        raise RuntimeError(f"No catch_id in response: {result}")
    xp = result.get("xp_earned", 0)
    duplicate = result.get("duplicate", False)
    print(f"  ✓ API accepted catch: id={catch_id[:8]}…  xp_earned={xp}  duplicate={duplicate}")
    return catch_id


def step_verify_db(catch_id: str, player_id: str) -> dict:
    print(f"  → Supabase: SELECT * FROM catches WHERE id = {catch_id[:8]}…")
    rows = _supabase_get("catches", {
        "select": "id,catch_type,color,confidence,player_id,synced_at",
        "id": f"eq.{catch_id}",
    })
    if not rows:
        raise RuntimeError(f"Catch {catch_id} NOT found in DB — sync failed!")
    row = rows[0]
    print("  ✓ Row confirmed in DB:")
    print(f"      id          = {row['id']}")
    print(f"      catch_type  = {row['catch_type']}")
    print(f"      color       = {row['color']}")
    print(f"      confidence  = {row['confidence']}")
    print(f"      player_id   = {row['player_id'][:8]}…")
    print(f"      synced_at   = {row['synced_at']}")
    return row


def step_cleanup(catch_id: str) -> None:
    print(f"  → Deleting test catch {catch_id[:8]}… from DB")
    _supabase_delete("catches", catch_id)
    print("  ✓ Cleaned up")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="E2E test: Dash Sentry → DB")
    parser.add_argument("--email",    default=os.environ.get("TEST_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("TEST_PASSWORD", ""))
    parser.add_argument("--api",      default=API_BASE)
    parser.add_argument("--keep",     action="store_true", help="Don't delete the test catch after run")
    args = parser.parse_args()

    if not args.email or not args.password:
        print("ERROR: provide --email and --password, or set TEST_EMAIL / TEST_PASSWORD env vars")
        sys.exit(1)
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (check backend/.env)")
        sys.exit(1)

    print("\n=== ChaDongCha — Dash Sentry E2E Test ===\n")
    catch_id = None

    try:
        print("[1/4] Auth")
        token, player_id = step_signin(args.api, args.email, args.password)

        print("\n[2/4] Pick a vehicle generation")
        generation_id = step_get_generation()

        print("\n[3/4] POST highway catch to API")
        catch_id = step_post_catch(args.api, token, generation_id)

        print("\n[4/4] Verify row landed in Supabase")
        step_verify_db(catch_id, player_id)

        print("\n✅  PASS — full Dash Sentry pipeline is working end-to-end\n")

    except Exception as exc:
        print(f"\n❌  FAIL — {exc}\n")
        sys.exit(1)

    finally:
        if catch_id and not args.keep:
            print("[cleanup]")
            try:
                step_cleanup(catch_id)
            except Exception as e:
                print(f"  ⚠ Cleanup failed (row may remain in DB): {e}")

    print("Done.\n")


if __name__ == "__main__":
    main()
