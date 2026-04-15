#!/usr/bin/env python3
"""
test_pipeline.py — End-to-end simulation of the ChaDongCha catch pipeline.

Exercises both catch paths exactly as the mobile app does, then calls the
live backend to resolve generation IDs and preview catch payloads.

Usage:
  python ml/test_pipeline.py
  python ml/test_pipeline.py --api https://your-api.railway.app
  python ml/test_pipeline.py --api http://localhost:8000

Env vars:
  API_URL    — backend base URL (overrides --api flag)
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE        = Path(__file__).parent
MANIFEST    = BASE / "export" / "manifest.json"
ONNX_MODEL  = BASE / "export" / "vehicle_classifier.onnx"
IMAGES_DIR  = BASE / "data" / "images"

# ── Colours for terminal output ────────────────────────────────────────────────
R  = "\033[91m"   # red
G  = "\033[92m"   # green
Y  = "\033[93m"   # yellow
B  = "\033[94m"   # blue
M  = "\033[95m"   # magenta
C  = "\033[96m"   # cyan
W  = "\033[97m"   # white
DIM = "\033[2m"
RST = "\033[0m"
BOLD = "\033[1m"

def col(text, color): return f"{color}{text}{RST}"
def bold(text):       return f"{BOLD}{text}{RST}"
def dim(text):        return f"{DIM}{text}{RST}"

def hr(char="─", width=72, color=DIM): print(col(char * width, color))
def section(title):
    print()
    hr("═", color=BOLD)
    print(bold(f"  {title}"))
    hr("═", color=BOLD)


# ── ONNX inference ─────────────────────────────────────────────────────────────

def load_model():
    import onnxruntime as ort
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    sess = ort.InferenceSession(str(ONNX_MODEL), sess_opts=opts)
    return sess

def preprocess(img: Image.Image, input_size: int) -> np.ndarray:
    """Same as val_tf in bootstrap.py — resize → center-crop → [0,1] CHW."""
    scale_size = int(input_size * 1.15)
    w, h = img.size
    if w < h:
        new_w, new_h = scale_size, int(h * scale_size / w)
    else:
        new_h, new_w = scale_size, int(w * scale_size / h)
    img = img.resize((new_w, new_h), Image.BILINEAR).convert("RGB")
    left = (new_w - input_size) // 2
    top  = (new_h - input_size) // 2
    img  = img.crop((left, top, left + input_size, top + input_size))
    arr  = np.array(img, dtype=np.float32) / 255.0
    return arr.transpose(2, 0, 1)[None]   # [1, 3, H, W]

def classify(sess, img: Image.Image, classes: list, input_size: int) -> list:
    """Return sorted list of (label, confidence) pairs, highest first."""
    input_name = sess.get_inputs()[0].name
    tensor = preprocess(img, input_size)
    logits = sess.run(None, {input_name: tensor})[0][0]
    e      = np.exp(logits - logits.max())
    probs  = e / e.sum()
    pairs  = sorted(zip(classes, probs.tolist()), key=lambda x: x[1], reverse=True)
    return pairs   # [(label, prob), ...]


# ── Synthetic images ───────────────────────────────────────────────────────────

def make_background_images() -> list:
    """Generate synthetic non-vehicle frames for background gate testing."""
    imgs = []

    # 1. Solid grey (parking lot ground)
    g = Image.new("RGB", (640, 480), (128, 128, 128))
    imgs.append(("synthetic_grey_ground", g))

    # 2. Blue sky gradient
    sky = Image.new("RGB", (640, 480))
    draw = ImageDraw.Draw(sky)
    for y in range(480):
        c = int(135 + y * 0.1)
        draw.line([(0, y), (640, y)], fill=(100, 149, c))
    imgs.append(("synthetic_sky", sky))

    # 3. Random noise (corrupt frame / glare)
    noise = Image.fromarray(np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8))
    imgs.append(("synthetic_noise_frame", noise))

    # 4. Interior dashboard blur
    dash = Image.new("RGB", (640, 480), (30, 25, 20))
    draw = ImageDraw.Draw(dash)
    for _ in range(60):
        x, y = random.randint(0, 640), random.randint(0, 480)
        r = random.randint(5, 40)
        shade = random.randint(40, 90)
        draw.ellipse([x-r, y-r, x+r, y+r], fill=(shade, shade-5, shade-10))
    dash = dash.filter(ImageFilter.GaussianBlur(4))
    imgs.append(("synthetic_dashboard_interior", dash))

    return imgs


# ── HTTP helper ────────────────────────────────────────────────────────────────

def api_get(url: str, timeout: int = 5) -> tuple:
    """Returns (status_code, dict|None). Never raises."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "chadongcha-test/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read())
        except Exception:
            body = {"detail": str(e)}
        return e.code, body
    except Exception as e:
        return 0, {"error": str(e)}


# ── Dash (highway) mode simulation ────────────────────────────────────────────
# Mirrors highway.tsx: poll → classify → _Background guard → threshold gates

HIGHWAY_AUTO_CATCH  = 0.80   # CONFIDENCE_AUTO_CATCH
HIGHWAY_PROBABLE    = 0.65   # CONFIDENCE_PROBABLE
HIGHWAY_SCAN_BOOST  = 0.05   # SCAN_BOOST_REDUCTION (when boost active)

def dash_decision(label: str, confidence: float, auto_thresh: float, prob_thresh: float) -> str:
    if label == "_Background":
        return "BACKGROUND_REJECTED"
    if confidence >= auto_thresh:
        return "AUTO_CAUGHT"
    if confidence >= prob_thresh:
        return "PROBABLE"
    return "BELOW_THRESHOLD"

def run_dash_mode(sess, manifest, images, api_url):
    section("DASH SENTRY MODE  (highway.tsx)")

    auto_thresh = HIGHWAY_AUTO_CATCH
    prob_thresh = HIGHWAY_PROBABLE
    classes     = manifest["classes"]
    input_size  = manifest["input_size"]

    print(f"  Thresholds — auto-catch: {col(auto_thresh, G)}  probable: {col(prob_thresh, Y)}")
    print(f"  Poll interval: 500ms  |  _Background filter: {col('ON', G)}")

    caught = []

    for img_path, img in images:
        print()
        hr()
        print(f"  {bold('FRAME')}  {col(img_path, C)}")

        t0 = time.perf_counter()
        top = classify(sess, img, classes, input_size)
        ms = (time.perf_counter() - t0) * 1000

        pred_label, pred_conf = top[0]
        decision = dash_decision(pred_label, pred_conf, auto_thresh, prob_thresh)

        # Top-3 predictions
        print(f"  {dim('inference  ')} {ms:.1f}ms")
        print(f"  {dim('top-3 predictions:')}")
        for rank, (lbl, prob) in enumerate(top[:3]):
            bar_len = int(prob * 30)
            bar = "█" * bar_len + "░" * (30 - bar_len)
            rank_col = G if rank == 0 else DIM
            print(f"    {col(f'#{rank+1}', rank_col)}  {lbl:<35}  {bar}  {col(f'{prob:.3f}', rank_col)}")

        # Decision
        if decision == "AUTO_CAUGHT":
            dec_str = col("✓ AUTO-CAUGHT", G)
        elif decision == "PROBABLE":
            dec_str = col("~ PROBABLE (show banner, no auto-catch)", Y)
        elif decision == "BACKGROUND_REJECTED":
            dec_str = col("✗ BACKGROUND REJECTED (dropped)", R)
        else:
            dec_str = col("✗ BELOW THRESHOLD (ignored)", DIM)

        print(f"\n  {bold('DECISION')}  {dec_str}")

        if decision == "AUTO_CAUGHT":
            parts = pred_label.split("_")
            # Class format: Make_Model_Generation (e.g. Toyota_GR86_ZN8)
            make, model, gen = (parts[0], "_".join(parts[1:-1]), parts[-1]) if len(parts) >= 3 else (parts[0], parts[0], "")
            print(f"  {dim('→ addCatch() called:')}")
            print(f"     make={col(make, W)}  model={col(model, W)}  generation={col(gen, W)}")
            print(f"     catchType=highway  confidence={col(f'{pred_conf:.3f}', G)}")
            caught.append(dict(make=make, model=model, generation=gen, label=pred_label, confidence=pred_conf))

    # Backend resolve for caught vehicles
    if caught and api_url:
        print()
        hr()
        print(f"\n  {bold('BACKEND RESOLVE')}  → GET /vehicles/resolve")
        for c in caught:
            params = f"make={urllib.parse.quote(c['make'])}&model={urllib.parse.quote(c['model'])}&generation={urllib.parse.quote(c['generation'])}"
            url = f"{api_url}/vehicles/resolve?{params}"
            status, data = api_get(url)
            gen_id  = (data or {}).get("generation_id")
            rarity  = (data or {}).get("rarity_tier", "?")
            if gen_id:
                print(f"    {col('✓', G)} {c['label']:<40} → gen_id={dim(gen_id[:8]+'…')}  rarity={col(rarity, M)}")
            else:
                print(f"    {col('?', Y)} {c['label']:<40} → {col('no DB match (generation_id=null)', Y)}")

    return caught


# ── 360 Scan mode simulation ───────────────────────────────────────────────────
# Mirrors scan360.tsx: FRONT gate → lock-on → PASSENGER/REAR/DRIVER → handleConfirm

SCAN360_MIN_CONFIDENCE = 0.65  # MIN_CONFIDENCE in scan360.tsx
ANCHORS = ["FRONT", "PASSENGER", "REAR", "DRIVER"]

def run_scan360_mode(sess, manifest, images, api_url):
    section("360 SCAN MODE  (scan360.tsx)")

    classes    = manifest["classes"]
    input_size = manifest["input_size"]

    print(f"  FRONT gate threshold: {col(SCAN360_MIN_CONFIDENCE, G)}  |  _Background filter: {col('ON', G)}")
    print(f"  Anchors: {' → '.join(col(a, C) for a in ANCHORS)}")

    caught = []

    for img_path, img in images:
        print()
        hr()
        print(f"  {bold('TARGET IMAGE')}  {col(img_path, C)}")
        print()

        # ── FRONT gate ────────────────────────────────────────────────────────
        print(f"  [{col('FRONT', B)}]  Classifying…")
        t0  = time.perf_counter()
        top = classify(sess, img, classes, input_size)
        ms  = (time.perf_counter() - t0) * 1000

        pred_label, pred_conf = top[0]
        print(f"         inference: {ms:.1f}ms")
        print(f"         result:    {col(pred_label, W)}  conf={col(f'{pred_conf:.3f}', G if pred_conf >= SCAN360_MIN_CONFIDENCE else R)}")
        print(f"         top-3:     " + "   ".join(f"{lbl.split('_')[-1]}={prob:.2f}" for lbl, prob in top[:3]))

        # Gate check
        rejected = pred_label == "_Background" or pred_conf < SCAN360_MIN_CONFIDENCE
        if rejected:
            reason = "_Background class" if pred_label == "_Background" else f"conf {pred_conf:.3f} < {SCAN360_MIN_CONFIDENCE}"
            print(f"         {col(f'✗ GATE FAIL — {reason} — stay on FRONT, clear photo', R)}")
            print(f"         {dim('(User sees: low-confidence banner, must re-aim)')}")
            continue

        print(f"         {col('✓ GATE PASS — LOCKED ON', G)}")
        print()

        # ── Remaining anchors ─────────────────────────────────────────────────
        for anchor in ANCHORS[1:]:
            print(f"  [{col(anchor, B)}]  Shutter press → photo captured  {dim('(no re-classify)')}")
            time.sleep(0.05)   # tiny pause for visual rhythm

        print()
        print(f"  {col('✓ ALL 4 ANGLES CAPTURED', G)}  →  result sheet shown to user")

        # Parse class label into make/model/gen
        parts = pred_label.split("_")
        make  = parts[0]
        gen   = parts[-1]
        model = "_".join(parts[1:-1]) if len(parts) > 2 else parts[0]

        print()
        print(f"  {bold('USER CONFIRMS CATCH')}  →  handleConfirm()")
        print(f"  {dim('addCatch() called:')}")
        print(f"     make={col(make, W)}  model={col(model, W)}  generation={col(gen, W)}")
        print(f"     catchType=scan360  confidence={col(f'{pred_conf:.3f}', G)}")
        print(f"     photoPaths=[front.jpg, passenger.jpg, rear.jpg, driver.jpg]")

        caught.append(dict(make=make, model=model, generation=gen, label=pred_label, confidence=pred_conf))

    # Backend resolve for caught vehicles
    if caught and api_url:
        print()
        hr()
        print(f"\n  {bold('BACKEND RESOLVE')}  → GET /vehicles/resolve")
        for c in caught:
            params = f"make={urllib.parse.quote(c['make'])}&model={urllib.parse.quote(c['model'])}&generation={urllib.parse.quote(c['generation'])}"
            url    = f"{api_url}/vehicles/resolve?{params}"
            status, data = api_get(url)
            gen_id  = (data or {}).get("generation_id")
            rarity  = (data or {}).get("rarity_tier", "?")
            if gen_id:
                print(f"    {col('✓', G)} {c['label']:<40} → gen_id={dim(gen_id[:8]+'…')}  rarity={col(rarity, M)}")
            else:
                print(f"    {col('?', Y)} {c['label']:<40} → {col('no DB match (generation_id=null)', Y)}")

    return caught


# ── Background gate test ───────────────────────────────────────────────────────

def run_background_gate(sess, manifest):
    section("BACKGROUND GATE TEST  (synthetic non-vehicle frames)")

    classes    = manifest["classes"]
    input_size = manifest["input_size"]
    auto_thresh = manifest["confidence_auto_catch"]

    synth = make_background_images()
    passed = 0

    for name, img in synth:
        print()
        hr()
        print(f"  {bold('SYNTHETIC FRAME')}  {col(name, M)}")
        top = classify(sess, img, classes, input_size)
        pred_label, pred_conf = top[0]
        print(f"  top prediction: {col(pred_label, W)}  conf={pred_conf:.3f}")
        print(f"  top-5:  " + "   ".join(f"{lbl.split('_')[-1]}={p:.3f}" for lbl, p in top[:5]))

        is_bg       = pred_label == "_Background"
        below_auto  = pred_conf < auto_thresh
        dash_safe   = is_bg or pred_conf < HIGHWAY_PROBABLE   # neither gate fires
        scan_safe   = is_bg or pred_conf < SCAN360_MIN_CONFIDENCE

        if is_bg:
            verdict = col(f"✓ CLASSIFIED AS _Background — both gates reject", G)
            passed += 1
        elif below_auto and pred_conf < HIGHWAY_PROBABLE:
            verdict = col(f"✓ Below all thresholds — both gates reject", G)
            passed += 1
        elif below_auto and pred_conf < SCAN360_MIN_CONFIDENCE:
            verdict = col(f"~ Below SCAN360 threshold but above PROBABLE — dash banner would show", Y)
        else:
            verdict = col(f"✗ WOULD FIRE as {pred_label} at conf {pred_conf:.3f} — false positive!", R)

        print(f"  {bold('VERDICT')}  {verdict}")
        print(f"  dash: {'safe' if dash_safe else col('FIRES', R)}   "
              f"360: {'safe' if scan_safe else col('FIRES', R)}")

    print()
    hr()
    print(f"  Background suppression: {col(f'{passed}/{len(synth)}', G if passed == len(synth) else Y)} synthetic frames correctly rejected")


# ── Catch payload preview ──────────────────────────────────────────────────────

def show_catch_payload(caught_dash, caught_360):
    section("CATCH PAYLOAD PREVIEW  (what syncPending() would POST to /catches)")
    all_caught = [(c, "highway") for c in caught_dash] + [(c, "scan360") for c in caught_360]
    if not all_caught:
        print(col("  No catches to show — all frames were rejected or below threshold.", Y))
        return

    for c, catch_type in all_caught:
        print()
        payload = {
            "generation_id":    "<resolved by /vehicles/resolve>",
            "catch_type":       catch_type,
            "color":            "<from native ALPR>",
            "body_style":       "<from native classifier>",
            "confidence":       round(c["confidence"], 4),
            "fuzzy_city":       "<from GPS>",
            "fuzzy_district":   "<from GPS>",
            "caught_at":        "<ISO timestamp>",
            "photo_ref":        "<R2 key after upload>" if catch_type == "scan360" else None,
        }
        print(f"  {bold(c['label'])}  ({catch_type})")
        for k, v in payload.items():
            v_str = dim(str(v)) if "<" in str(v) else col(str(v), W)
            print(f"    {k:<22} {v_str}")


# ── Feed check ─────────────────────────────────────────────────────────────────

def check_feed(api_url):
    if not api_url:
        return
    section("ACTIVITY FEED CHECK  (GET /feed/activities)")
    status, data = api_get(f"{api_url}/feed/activities?limit=5")
    if status != 200 or not isinstance(data, list):
        print(col(f"  Could not reach feed (status {status}): {data}", Y))
        return
    if not data:
        print(col("  Feed is empty.", DIM))
        return
    print(f"  Last {len(data)} events:\n")
    for ev in data:
        p      = ev.get("payload", {})
        ts     = ev.get("created_at", "")[:16].replace("T", " ")
        evtype = ev.get("event_type", "?")
        vname  = p.get("vehicle_name", p.get("road_name", ""))
        rarity = p.get("rarity_tier", "")
        user   = ev.get("player_username", "?")
        evtype_fmt = f"{evtype.upper():<14}"
        vname_fmt  = f"{vname:<32}"
        rarity_fmt = f"{rarity:<12}"
        print(f"  {dim(ts)}  {col(evtype_fmt, C)}  {bold(vname_fmt)}  "
              f"{col(rarity_fmt, M)}  {dim(user)}")


# ── Health check ───────────────────────────────────────────────────────────────

def check_health(api_url) -> bool:
    if not api_url:
        return False
    status, data = api_get(f"{api_url}/health", timeout=4)
    ok = status == 200 and (data or {}).get("status") == "ok"
    verdict = col("✓ online", G) if ok else col(f"✗ unreachable (status={status})", R)
    print(f"  Backend  {col(api_url, DIM)}  {verdict}")
    return ok


# ── Image selection ────────────────────────────────────────────────────────────

DASH_PICKS = [
    # (class_dir, image_filename, label_override)
    # One common, one rare, one epic, one legendary — good spread
    ("Toyota_Camry_XV70",        "0001.jpg", "common Toyota Camry"),
    ("Ford_F-150_P702",          "0003.jpg", "common Ford F-150"),
    ("Subaru_WRX_VB",            "0005.jpg", "rare Subaru WRX"),
    ("Porsche_911_992",          "0002.jpg", "epic Porsche 911"),
    ("Ferrari_SF90_F173",        "0001.jpg", "legendary Ferrari SF90"),
]

SCAN360_PICKS = [
    ("Toyota_GR86_ZN8",  "0001.jpg", "rare Toyota GR86"),
    ("BMW_M3_G80",        "0002.jpg", "epic BMW M3"),
]


def load_pick(class_name, fname, label):
    path = IMAGES_DIR / class_name / fname
    if not path.exists():
        # fallback to first available image in dir
        d = IMAGES_DIR / class_name
        if d.exists():
            imgs = sorted(d.glob("*.jpg"))
            if imgs:
                path = imgs[0]
    if not path.exists():
        return None
    return (f"{label}  [{path.name}]", Image.open(path).convert("RGB"))


def run_your_cars_check(sess, manifest):
    """
    Show what the current model does when pointed at the owner's two cars:
      - 2021 Tesla Model S (white)
      - 2025 Honda Odyssey van (white)

    Both are NOT in the current training set, so the model will confuse them.
    This section makes that gap visible and shows the misclassification.
    After retraining with the new classes, re-run to confirm they resolve correctly.
    """
    section("YOUR CARS CHECK  (pre-retrain gap analysis)")

    classes    = manifest["classes"]
    input_size = manifest["input_size"]
    in_model   = {c for c in classes}

    target_cars = [
        ("Tesla Model_S Plaid",  "2021 Tesla Model S",    "Pearl White Multi-Coat"),
        ("Honda Odyssey RL6",    "2025 Honda Odyssey",    "Platinum White Pearl"),
    ]

    print(f"  These are your cars. Are they in the current model?\n")

    for cls_name, display, color in target_cars:
        in_current = cls_name in in_model
        status = col("✓ IN MODEL", G) if in_current else col("✗ NOT IN MODEL — will be misclassified", R)
        print(f"  {bold(display):<30}  {status}")

    print()
    print(f"  Simulating misclassification (white 224×224 image — closest proxy to white car body):\n")

    # Create a white image (closest synthetic stand-in for a white car panel)
    white_img = Image.new("RGB", (640, 480), (245, 245, 245))
    # Add a hint of warmth and subtle gradient to be less synthetic
    draw = ImageDraw.Draw(white_img)
    for y in range(480):
        shade = 245 - int(y * 0.015)
        draw.line([(0, y), (640, y)], fill=(shade, shade, min(255, shade + 2)))
    white_img = white_img.filter(ImageFilter.GaussianBlur(1))

    top = classify(sess, white_img, classes, input_size)
    pred_label, pred_conf = top[0]

    print(f"  {'White panel image':<35}  top={col(pred_label, W)}  conf={pred_conf:.3f}")
    print(f"  top-5: " + "   ".join(f"{lbl.split('_')[-1]}={p:.3f}" for lbl, p in top[:5]))

    print()
    print(col("  ─── What this means ─────────────────────────────────────────────────", DIM))
    print(f"  Your Tesla Model S and Honda Odyssey are {col('missing from the training set', R)}.")
    print(f"  The model cannot recognize them and will {col('misclassify them as other vehicles', Y)}.")
    print()
    print(f"  {bold('Fix (already queued):')}")
    print(f"    1. {col('Scrape images:', C)}  python ml/training/scrape_images.py --cls 'Tesla Model_S Plaid'")
    print(f"                       python ml/training/scrape_images.py --cls 'Honda Odyssey RL6'")
    print(f"    2. {col('Retrain:', C)}         python ml/training/bootstrap.py --phase classify --resume")
    print(f"    3. {col('Export:', C)}          python ml/training/bootstrap.py --phase export")
    print(f"    4. {col('Validate:', C)}        python ml/validate_model.py")
    print(f"    5. {col('Build:', C)}           eas build (after validation passes)")
    print()
    print(f"  Color note: {col('white', W)} is detected by the {col('native CoreML/TFLite module', C)},")
    print(f"  not the ONNX classifier. Once the vehicle class is recognised, color")
    print(f"  accuracy for white cars depends on the native module's color segmentation.")


def main():
    import urllib.parse   # noqa: needed for quote

    parser = argparse.ArgumentParser(description="End-to-end ChaDongCha pipeline test")
    parser.add_argument("--api", default=os.environ.get("API_URL", ""), help="Backend base URL")
    args = parser.parse_args()
    api_url = args.api.rstrip("/") if args.api else None

    # ── Header ─────────────────────────────────────────────────────────────────
    print()
    print(bold(col("  ██████╗██╗  ██╗ █████╗ ██████╗  ██████╗ ███╗   ██╗ ██████╗  ██████╗██╗  ██╗ █████╗", R)))
    print(bold(col("  CHADONGCHA — END-TO-END PIPELINE TEST", W)))
    print()

    if not ONNX_MODEL.exists():
        print(col(f"ERROR: model not found at {ONNX_MODEL}", R)); sys.exit(1)
    if not MANIFEST.exists():
        print(col(f"ERROR: manifest not found at {MANIFEST}", R)); sys.exit(1)

    manifest = json.loads(MANIFEST.read_text())
    print(f"  Model:    {col(ONNX_MODEL.name, C)}  v{manifest['version']}  "
          f"({len(manifest['classes'])} classes  val_acc={manifest.get('val_acc', '?'):.4f})")
    print(f"  Manifest: auto_catch={manifest['confidence_auto_catch']}  "
          f"probable={manifest['confidence_probable']}")

    api_reachable = check_health(api_url)
    if not api_reachable:
        if api_url:
            print(col("  (backend offline — resolve/feed steps will be skipped)", Y))
        else:
            print(dim("  (no --api URL provided — resolve/feed steps skipped)"))
        api_url = None

    # ── Load model ─────────────────────────────────────────────────────────────
    print(f"\n  Loading ONNX session…  ", end="", flush=True)
    t0   = time.perf_counter()
    sess = load_model()
    print(f"done ({(time.perf_counter()-t0)*1000:.0f}ms)")

    # ── Load test images ───────────────────────────────────────────────────────
    dash_images = []
    for cls, fname, label in DASH_PICKS:
        item = load_pick(cls, fname, label)
        if item:
            dash_images.append(item)

    scan_images = []
    for cls, fname, label in SCAN360_PICKS:
        item = load_pick(cls, fname, label)
        if item:
            scan_images.append(item)

    if not dash_images and not scan_images:
        print(col("ERROR: no test images found in ml/data/images/", R)); sys.exit(1)

    # ── Your cars (pre-retrain gap check) ─────────────────────────────────────
    run_your_cars_check(sess, manifest)

    # ── Run tests ──────────────────────────────────────────────────────────────
    caught_dash = run_dash_mode(sess, manifest, dash_images, api_url)
    caught_360  = run_scan360_mode(sess, manifest, scan_images, api_url)
    run_background_gate(sess, manifest)
    show_catch_payload(caught_dash, caught_360)
    check_feed(api_url)

    # ── Summary ────────────────────────────────────────────────────────────────
    section("SUMMARY")
    total_tested = len(dash_images) + len(scan_images)
    total_caught = len(caught_dash) + len(caught_360)
    print(f"  Dash frames tested:  {len(dash_images)}   auto-caught: {col(len(caught_dash), G)}")
    print(f"  360 scans tested:    {len(scan_images)}   confirmed:   {col(len(caught_360), G)}")
    print(f"  Background tests:    4 synthetic frames")
    print()
    if total_caught == total_tested:
        print(col("  ✓ All vehicle frames caught as expected.", G))
    elif total_caught == 0:
        print(col("  ✗ No vehicles caught — check model or thresholds.", R))
    else:
        print(col(f"  ~ {total_caught}/{total_tested} caught — some frames below threshold (check verbose above).", Y))

    print(col("\n  Pipeline test complete.\n", BOLD))


if __name__ == "__main__":
    main()
