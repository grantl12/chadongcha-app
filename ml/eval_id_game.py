"""
eval_id_game.py — Evaluate the vehicle classifier against the id_game R2 image set.

Parses id_game_inserts.sql (or optionally queries Supabase), downloads each
image, runs it through the deployed ONNX model, and reports:

  IN-VOCAB   — cars the model knows: accuracy, per-image confidence, top-1
  OOV        — cars outside the model's taxonomy: top-3 predictions + whether
               the model fires a confident false positive or correctly stays low

The 57 scraped images cover 20 cars.  ~5 of those cars exist in the model's
class list, giving us both a positive-class accuracy test AND a meaningful
negative/OOV test on the remaining 15.

Usage (run from the ml/ directory with .venv310 active):
  python eval_id_game.py
  python eval_id_game.py --sql ../backend/scripts/id_game_inserts.sql
  python eval_id_game.py --top-k 5 --conf-threshold 0.65

Requirements (add to ml/.venv310 if missing):
  pip install onnxruntime Pillow requests numpy
"""

import argparse
import io
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import requests
from PIL import Image

try:
    import onnxruntime as ort
except ImportError:
    sys.exit("Missing: pip install onnxruntime")

# ---------------------------------------------------------------------------
# Paths (relative to ml/)
# ---------------------------------------------------------------------------

_HERE         = Path(__file__).parent
ONNX_MODEL    = _HERE / "export" / "vehicle_classifier.onnx"
MANIFEST_FILE = _HERE / "export" / "manifest.json"
DEFAULT_SQL   = _HERE.parent / "backend" / "scripts" / "id_game_inserts.sql"

# ---------------------------------------------------------------------------
# Image preprocessing — matches NormalizedModel (input: [0,1] float, model
# handles ImageNet mean/std subtraction internally)
# ---------------------------------------------------------------------------

INPUT_SIZE = 224

def preprocess(img_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    img = img.resize((INPUT_SIZE, INPUT_SIZE), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32) / 255.0    # [0, 1]
    arr = arr.transpose(2, 0, 1)                        # HWC → CHW
    return arr[np.newaxis, :]                           # (1, 3, H, W)


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


# ---------------------------------------------------------------------------
# Label matching: id_game answer_class → model class
# ---------------------------------------------------------------------------

def _norm(s: str) -> str:
    return s.lower().replace(" ", "_").replace("-", "_")


def build_label_map(id_game_labels: list[str], model_classes: list[str]) -> dict[str, str | None]:
    """
    For each id_game label try to find a unique model class whose normalized
    name starts with the normalized id_game label.

    Examples:
      "Toyota GR86"      → "Toyota_GR86_ZN8"    (prefix match)
      "Tesla Cybertruck" → "Tesla_Cybertruck"    (exact match)
      "Nissan Z"         → "Nissan_Z_RZ34"       (prefix, not Nissan_370Z)
      "Ford F-150 Raptor"→ "Ford_F-150_Raptor"  (exact after norm)
      "McLaren 570S"     → None                  (OOV)
    """
    mapping: dict[str, str | None] = {}
    for label in id_game_labels:
        norm_label = _norm(label)
        matches = [c for c in model_classes if _norm(c).startswith(norm_label)]
        if len(matches) == 1:
            mapping[label] = matches[0]
        elif len(matches) > 1:
            # Prefer the shortest (most direct) match
            mapping[label] = min(matches, key=len)
        else:
            mapping[label] = None
    return mapping


# ---------------------------------------------------------------------------
# SQL parser — extract (image_url, answer_class, answer_label) from inserts
# ---------------------------------------------------------------------------

_INSERT_RE = re.compile(
    r"values\s*\('([^']+)',\s*'[^']+',\s*'([^']+)',\s*'([^']+)'",
    re.IGNORECASE,
)


def parse_sql(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = _INSERT_RE.search(line)
        if m:
            rows.append({
                "image_url":    m.group(1),
                "answer_class": m.group(2),
                "answer_label": m.group(3),
            })
    return rows


# ---------------------------------------------------------------------------
# Supabase loader (optional, requires python-dotenv + supabase)
# ---------------------------------------------------------------------------

def load_from_supabase() -> list[dict]:
    try:
        import os
        from dotenv import load_dotenv
        load_dotenv(_HERE.parent / "backend" / ".env")
        from supabase import create_client
        url  = os.environ["SUPABASE_URL"]
        key  = os.environ["SUPABASE_KEY"]
        db   = create_client(url, key)
        res  = db.table("id_game_queue").select(
            "image_url, answer_class, answer_label"
        ).eq("status", "active").execute()
        return res.data or []
    except Exception as exc:
        print(f"[supabase] Could not load: {exc}")
        return []


# ---------------------------------------------------------------------------
# Image downloader
# ---------------------------------------------------------------------------

def download(url: str, retries: int = 2) -> bytes | None:
    headers = {"User-Agent": "Mozilla/5.0 (chadongcha-eval/1.0)"}
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, timeout=20, headers=headers)
            if r.status_code == 200:
                return r.content
            print(f"  HTTP {r.status_code}: {url}")
        except requests.RequestException as e:
            print(f"  Request error (attempt {attempt+1}): {e}")
        if attempt < retries:
            time.sleep(1.5)
    return None


# ---------------------------------------------------------------------------
# Main evaluation
# ---------------------------------------------------------------------------

def run_eval(
    rows: list[dict],
    session: ort.InferenceSession,
    classes: list[str],
    top_k: int,
    conf_threshold: float,
) -> None:
    input_name = session.get_inputs()[0].name

    # Group rows by answer_class
    by_class: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_class[row["answer_class"]].append(row)

    all_labels = list(by_class.keys())
    label_map  = build_label_map(all_labels, classes)

    in_vocab_labels  = [l for l in all_labels if label_map[l] is not None]
    oov_labels       = [l for l in all_labels if label_map[l] is None]

    # ── Run inference ──────────────────────────────────────────────────────

    # Per-image results: {"label", "model_class", "url", "probs", "top_indices"}
    in_vocab_results: dict[str, list[dict]] = defaultdict(list)
    oov_results:      dict[str, list[dict]] = defaultdict(list)

    total_images = len(rows)
    print(f"\nDownloading and running inference on {total_images} images…\n")

    for i, row in enumerate(rows, 1):
        label     = row["answer_class"]
        url       = row["image_url"]
        filename  = url.split("/")[-1]

        sys.stdout.write(f"\r  [{i:3d}/{total_images}] {label:<30s} {filename}")
        sys.stdout.flush()

        img_bytes = download(url)
        if img_bytes is None:
            print(f"\n  ✗ Download failed: {url}")
            continue

        try:
            arr    = preprocess(img_bytes)
            logits = session.run(None, {input_name: arr})[0]
            probs  = softmax(logits)[0]
        except Exception as exc:
            print(f"\n  ✗ Inference error for {url}: {exc}")
            continue

        top_indices = np.argsort(probs)[::-1][:top_k]
        result = {
            "label":       label,
            "url":         url,
            "filename":    filename,
            "probs":       probs,
            "top_indices": top_indices,
        }

        if label_map.get(label):
            in_vocab_results[label].append(result)
        else:
            oov_results[label].append(result)

    print("\n")

    # ── In-vocab report ───────────────────────────────────────────────────

    print("=" * 70)
    print("  IN-VOCABULARY CARS  (model trained on this class)")
    print("=" * 70)

    iv_correct = iv_total = 0

    for label in in_vocab_labels:
        target_class  = label_map[label]
        target_idx    = classes.index(target_class)
        results       = in_vocab_results.get(label, [])
        correct_count = 0

        print(f"\n  {label}  →  {target_class}")
        for r in results:
            iv_total += 1
            top1_idx  = r["top_indices"][0]
            top1_name = classes[top1_idx]
            top1_conf = r["probs"][top1_idx]
            target_conf = r["probs"][target_idx]
            correct   = (top1_idx == target_idx)

            if correct:
                iv_correct += 1
                correct_count += 1
                mark = "✓"
            else:
                mark = "✗"

            top3 = "  |  ".join(
                f"{classes[i]} ({r['probs'][i]:.0%})"
                for i in r["top_indices"][:3]
            )
            print(f"    {mark}  {r['filename']}   target={target_conf:.0%}   top-3: {top3}")

        if not results:
            print("    (no images downloaded)")

    print()
    iv_pct = iv_correct / iv_total * 100 if iv_total else 0
    print(f"  In-vocab accuracy: {iv_correct}/{iv_total}  ({iv_pct:.1f}%)")

    # ── OOV report ────────────────────────────────────────────────────────

    print()
    print("=" * 70)
    print("  OUT-OF-VOCABULARY CARS  (model doesn't know this class)")
    print("  Ideal: _Background top-1, or low confidence on all classes")
    print("=" * 70)

    oov_total      = 0
    oov_high_conf  = 0   # confident mis-fire: top-1 non-Background >= threshold
    oov_background = 0   # correctly went to _Background
    oov_low_conf   = 0   # top-1 is not Background but confidence is low

    bg_idx = classes.index("_Background") if "_Background" in classes else -1

    for label in oov_labels:
        results = oov_results.get(label, [])
        print(f"\n  {label}  [OOV — no match in model]")

        for r in results:
            oov_total += 1
            top1_idx  = r["top_indices"][0]
            top1_name = classes[top1_idx]
            top1_conf = r["probs"][top1_idx]

            if top1_idx == bg_idx:
                oov_background += 1
                disposition = "→ _Background ✓"
            elif top1_conf >= conf_threshold:
                oov_high_conf += 1
                disposition = f"→ HIGH-CONF MISFIRE ⚠"
            else:
                oov_low_conf += 1
                disposition = "→ low-conf (ok)"

            top3 = "  |  ".join(
                f"{classes[i]} ({r['probs'][i]:.0%})"
                for i in r["top_indices"][:3]
            )
            print(f"    {r['filename']}  {disposition}  |  top-3: {top3}")

        if not results:
            print("    (no images downloaded)")

    # ── Summary ───────────────────────────────────────────────────────────

    print()
    print("=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"  Model version        : {manifest.get('version', '?')}  |  val_acc={manifest.get('val_acc', 0):.1%}  |  {len(classes)} classes")
    print(f"  Images evaluated     : {iv_total + oov_total}  ({iv_total} in-vocab, {oov_total} OOV)")
    print()
    print(f"  In-vocab accuracy    : {iv_correct}/{iv_total}  ({iv_pct:.1f}%)")
    if iv_total:
        avg_conf = np.mean([
            r["probs"][classes.index(label_map[r["label"]])]
            for label in in_vocab_labels
            for r in in_vocab_results.get(label, [])
            if label_map.get(label) in classes
        ])
        print(f"  Avg target-class conf: {avg_conf:.1%}")
    print()
    if oov_total:
        print(f"  OOV _Background rate : {oov_background}/{oov_total}  ({oov_background/oov_total:.0%})  ← model correctly abstained")
        print(f"  OOV low-conf rate    : {oov_low_conf}/{oov_total}  ({oov_low_conf/oov_total:.0%})  ← wrong class, but soft enough to filter")
        print(f"  OOV misfire rate     : {oov_high_conf}/{oov_total}  ({oov_high_conf/oov_total:.0%})  ← confident wrong prediction  ⚠")
        print(f"  (misfire threshold   : {conf_threshold:.0%})")
    print()
    print("  INTERPRETATION GUIDE")
    print("  ─────────────────────────────────────────────────────────────")
    print("  In-vocab accuracy < 70%  → rear-view queries are under-represented")
    print("                             in training data for those classes.")
    print("  OOV misfire rate  > 20%  → _Background class needs more examples,")
    print("                             or confidence threshold needs raising.")
    print("  OOV top-3 clusters       → tells you which 'adjacent' class the model")
    print("                             reaches for; useful for adding hard-negative")
    print("                             training examples for those classes.")
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Eval classifier on id_game images")
    parser.add_argument("--sql",            default=str(DEFAULT_SQL),  help="Path to id_game_inserts.sql")
    parser.add_argument("--supabase",       action="store_true",        help="Load records from Supabase instead of SQL")
    parser.add_argument("--top-k",          type=int, default=3,        help="Top-K predictions to display (default 3)")
    parser.add_argument("--conf-threshold", type=float, default=0.65,   help="OOV high-confidence misfire threshold (default 0.65)")
    args = parser.parse_args()

    # Load manifest
    if not MANIFEST_FILE.exists():
        sys.exit(f"Manifest not found: {MANIFEST_FILE}  — run bootstrap.py --phase export first")
    import json
    manifest = json.loads(MANIFEST_FILE.read_text())
    classes  = manifest["classes"]

    # Load ONNX session
    if not ONNX_MODEL.exists():
        sys.exit(f"ONNX model not found: {ONNX_MODEL}  — run bootstrap.py --phase export first")
    print(f"Loading ONNX model from {ONNX_MODEL} …")
    session = ort.InferenceSession(str(ONNX_MODEL), providers=["CPUExecutionProvider"])

    # Load records
    if args.supabase:
        print("Loading id_game records from Supabase…")
        rows = load_from_supabase()
        if not rows:
            sys.exit("No records returned from Supabase.")
    else:
        sql_path = Path(args.sql)
        if not sql_path.exists():
            sys.exit(f"SQL file not found: {sql_path}")
        print(f"Parsing {sql_path} …")
        rows = parse_sql(sql_path)
        if not rows:
            sys.exit("No INSERT rows found in SQL file.")

    print(f"Found {len(rows)} images across {len(set(r['answer_class'] for r in rows))} car classes.")
    print(f"Model has {len(classes)} classes  (val_acc={manifest.get('val_acc', 0):.1%})")

    run_eval(rows, session, classes, top_k=args.top_k, conf_threshold=args.conf_threshold)
