#!/usr/bin/env python3
"""
validate_model.py — Run vehicle_classifier.onnx against labelled images.

Run BEFORE a build to catch regressions without burning Expo quota.

Expected image layout (same as training):
  ml/data/images/
    <ClassName>/
      0001.jpg ...

Usage:
  cd /workspaces/ChaDongCha
  pip install onnxruntime Pillow
  python ml/validate_model.py
  python ml/validate_model.py --images-dir ml/data/images --threshold 0.72
  python ml/validate_model.py --verbose          # show per-image misses
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE         = Path(__file__).parent
MANIFEST     = BASE / "export" / "manifest.json"
ONNX_MODEL   = BASE / "export" / "vehicle_classifier.onnx"
DEFAULT_IMGS = BASE / "data" / "images"


def preprocess(img_path: Path, input_size: int):
    """Resize → center-crop → [0,1] float → CHW tensor (no ImageNet norm — baked into model)."""
    import numpy as np
    from PIL import Image

    img = Image.open(img_path).convert("RGB")

    # Replicate val_tf: resize shorter edge to int(input_size * 1.15), then center crop
    scale_size = int(input_size * 1.15)
    w, h = img.size
    if w < h:
        new_w = scale_size
        new_h = int(h * scale_size / w)
    else:
        new_h = scale_size
        new_w = int(w * scale_size / h)
    img = img.resize((new_w, new_h), Image.BILINEAR)

    # Center crop
    left = (new_w - input_size) // 2
    top  = (new_h - input_size) // 2
    img  = img.crop((left, top, left + input_size, top + input_size))

    arr = np.array(img, dtype=np.float32) / 255.0   # [0, 1]
    arr = arr.transpose(2, 0, 1)                     # HWC → CHW
    arr = arr[None, ...]                             # add batch dim
    return arr


def run_validation(images_dir: Path, threshold: float, verbose: bool):
    try:
        import onnxruntime as ort
        import numpy as np
    except ImportError:
        print("ERROR: onnxruntime not installed.  Run:  pip install onnxruntime Pillow")
        sys.exit(1)

    if not MANIFEST.exists():
        print(f"ERROR: manifest not found at {MANIFEST}")
        sys.exit(1)
    if not ONNX_MODEL.exists():
        print(f"ERROR: model not found at {ONNX_MODEL}")
        sys.exit(1)
    if not images_dir.exists():
        print(f"ERROR: images directory not found at {images_dir}")
        sys.exit(1)

    manifest   = json.loads(MANIFEST.read_text())
    classes    = manifest["classes"]           # ordered list matching model output
    input_size = manifest["input_size"]        # 224
    auto_thresh = manifest["confidence_auto_catch"]   # 0.72
    prob_thresh = manifest["confidence_probable"]     # 0.50
    BG_CLASS    = "_Background"

    print(f"\nModel:    {ONNX_MODEL.name}  (v{manifest['version']})")
    print(f"Classes:  {len(classes)}  (incl. {BG_CLASS})")
    print(f"Val acc (training): {manifest.get('val_acc', '?'):.4f}")
    print(f"Thresholds — auto-catch: {auto_thresh}  probable: {prob_thresh}  cli-flag: {threshold}")

    # ── Load ONNX session ──────────────────────────────────────────────────────
    sess_opts = ort.SessionOptions()
    sess_opts.log_severity_level = 3   # suppress verbose ONNX logs
    sess = ort.InferenceSession(str(ONNX_MODEL), sess_opts=sess_opts)
    input_name = sess.get_inputs()[0].name

    # ── Walk image dirs ────────────────────────────────────────────────────────
    # Only test classes that have a directory; skip ones with no images (fine)
    img_exts = {".jpg", ".jpeg", ".png", ".webp"}
    class_dirs = sorted([d for d in images_dir.iterdir() if d.is_dir()])

    if not class_dirs:
        print(f"\nNo class directories found in {images_dir}")
        sys.exit(1)

    # Stats collectors
    per_class_correct  = defaultdict(int)
    per_class_total    = defaultdict(int)
    confusion          = defaultdict(lambda: defaultdict(int))   # confusion[true][pred]
    auto_catch_fps     = 0   # non-background images that would auto-catch as the WRONG class
    bg_leaked          = 0   # images classified as a real vehicle when true class = Background
    total_images       = 0
    total_correct      = 0
    skipped            = 0

    print(f"\nRunning inference on {images_dir} …\n")

    for class_dir in class_dirs:
        true_label = class_dir.name
        if true_label not in classes:
            print(f"  WARN  {true_label!r} not in manifest classes — skipping directory")
            skipped += 1
            continue

        img_files = [f for f in sorted(class_dir.iterdir()) if f.suffix.lower() in img_exts]
        if not img_files:
            continue

        for img_path in img_files:
            total_images += 1
            per_class_total[true_label] += 1

            try:
                tensor  = preprocess(img_path, input_size)
                logits  = sess.run(None, {input_name: tensor})[0][0]   # shape: [n_classes]
                # Softmax
                e       = np.exp(logits - logits.max())
                probs   = e / e.sum()
                pred_idx   = int(np.argmax(probs))
                pred_label = classes[pred_idx]
                confidence = float(probs[pred_idx])
            except Exception as exc:
                if verbose:
                    print(f"  ERROR  {img_path.name}: {exc}")
                skipped += 1
                continue

            is_correct = (pred_label == true_label)
            if is_correct:
                per_class_correct[true_label] += 1
                total_correct += 1
            else:
                confusion[true_label][pred_label] += 1
                if verbose:
                    print(
                        f"  MISS  {true_label:<35}  →  {pred_label:<35}  conf={confidence:.3f}  [{img_path.name}]"
                    )

            # Track background leakage (real vehicle → classified as Background)
            if true_label != BG_CLASS and pred_label == BG_CLASS:
                pass  # model correctly suppressed; this is fine

            # Track false positives that would fire as wrong vehicle at auto-catch level
            if true_label != BG_CLASS and pred_label != true_label and pred_label != BG_CLASS:
                if confidence >= auto_thresh:
                    auto_catch_fps += 1

            # Track background leakage (Background → fires as real vehicle above threshold)
            if true_label == BG_CLASS and pred_label != BG_CLASS:
                if confidence >= prob_thresh:
                    bg_leaked += 1

    # ── Report ─────────────────────────────────────────────────────────────────
    if total_images == 0:
        print("No images processed.")
        sys.exit(1)

    overall_acc = total_correct / total_images
    tested_classes = sorted(per_class_total.keys())

    print("─" * 70)
    print(f"{'CLASS':<38} {'CORRECT':>7}  {'TOTAL':>5}  {'ACC':>6}")
    print("─" * 70)

    worst: list[tuple[float, str]] = []
    for cls in tested_classes:
        n_total   = per_class_total[cls]
        n_correct = per_class_correct[cls]
        acc       = n_correct / n_total if n_total else 0.0
        marker    = "  ◀ LOW" if acc < 0.80 and cls != BG_CLASS else ""
        print(f"  {cls:<36} {n_correct:>7}  {n_total:>5}  {acc:>6.1%}{marker}")
        worst.append((acc, cls))

    print("─" * 70)
    print(f"  {'OVERALL':<36} {total_correct:>7}  {total_images:>5}  {overall_acc:>6.1%}")
    if skipped:
        print(f"  ({skipped} images/dirs skipped due to errors or missing manifest entry)")

    # ── Confusion summary ──────────────────────────────────────────────────────
    print("\n── Top confusions (true → predicted, count > 1) ─────────────────────")
    all_confusions = [
        (count, true_cls, pred_cls)
        for true_cls, preds in confusion.items()
        for pred_cls, count in preds.items()
        if count > 1
    ]
    if all_confusions:
        for count, true_cls, pred_cls in sorted(all_confusions, reverse=True)[:15]:
            print(f"  {count:>3}×  {true_cls:<35} → {pred_cls}")
    else:
        print("  None (all misses occurred once each)")

    # ── Background suppression ─────────────────────────────────────────────────
    print("\n── Background / false-positive analysis ─────────────────────────────")
    bg_total   = per_class_total.get(BG_CLASS, 0)
    bg_correct = per_class_correct.get(BG_CLASS, 0)
    if bg_total > 0:
        bg_acc = bg_correct / bg_total
        print(f"  Background suppression:  {bg_correct}/{bg_total} ({bg_acc:.1%}) correctly → _Background")
        print(f"  BG frames that would fire (conf ≥ {prob_thresh}): {bg_leaked}")
    else:
        print(f"  No _Background images in test set (add some road/sky/interior shots for a real gate test)")

    print(f"\n  Wrong-vehicle auto-catches (conf ≥ {auto_thresh}): {auto_catch_fps}")

    # ── Ship / no-ship recommendation ─────────────────────────────────────────
    print("\n── Recommendation ───────────────────────────────────────────────────")
    issues = []
    if overall_acc < 0.85:
        issues.append(f"Overall accuracy {overall_acc:.1%} < 85% target")
    if bg_total == 0:
        issues.append("_Background class not in test set — gate not validated")
    elif bg_leaked > bg_total * 0.10:
        issues.append(f"Background leaks {bg_leaked}/{bg_total} frames above probable threshold ({bg_leaked/bg_total:.0%})")
    if auto_catch_fps > total_images * 0.02:
        issues.append(f"High wrong-vehicle auto-catch rate ({auto_catch_fps} images, {auto_catch_fps/total_images:.1%})")

    if issues:
        print("  ✗  DO NOT SHIP — issues found:")
        for issue in issues:
            print(f"      • {issue}")
    else:
        print(f"  ✓  LOOKS GOOD — accuracy {overall_acc:.1%}, no blocking issues found")
        print( "     (Run on background images to fully validate the rejection gate)")

    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate vehicle_classifier.onnx before building.")
    parser.add_argument("--images-dir", default=str(DEFAULT_IMGS), help="Path to labelled images directory")
    parser.add_argument("--threshold",  type=float, default=0.72,  help="Auto-catch confidence threshold (default 0.72)")
    parser.add_argument("--verbose",    action="store_true",        help="Print per-image misses")
    args = parser.parse_args()

    run_validation(
        images_dir=Path(args.images_dir),
        threshold=args.threshold,
        verbose=args.verbose,
    )
