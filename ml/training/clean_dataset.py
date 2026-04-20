"""
ML Dataset Cleaning — ChaDongCha

Audits the local image dataset using a pre-trained ImageNet classifier
to flag non-vehicle images (car parts, interiors, random junk) that
DuckDuckGo search may have pulled in.

Moves flagged images to ml/data/images_flagged/<ClassName>/

Usage:
  python training/clean_dataset.py
  python training/clean_dataset.py --threshold 0.4
"""

import argparse
import os
import shutil
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import datasets, transforms
import timm
from PIL import Image

# ── Paths ──────────────────────────────────────────────────────────────────────
_BASE      = Path(__file__).parent.parent
DATA_DIR   = _BASE / "data" / "images"
FLAG_DIR   = _BASE / "data" / "images_flagged"

# ── ImageNet Classes of Interest ──────────────────────────────────────────────
# We want to FLAG these if they are the top prediction in a vehicle folder:
# 479: car wheel, brake disc, ...
# 544: disk brake, brake disc
# 817: sports car (OK)
# 656: minivan (OK)
# 468: taxicab (OK)
# 717: pickup (OK)
# 609: jeep (OK)

# Common 'garbage' in our scrape:
GARBAGE_IDS = {
    479, # car wheel
    544, # disk brake
    670, # motor scooter (if in a car folder)
    829, # streetcar (if in a car folder)
    438, # barrow, garden cart
    516, # cookery pan (often confused with hubcaps)
    811, # space shuttle (random junk)
    985, # daisy (nature)
    744, # seat belt (interiors)
    526, # dashboard (interiors)
    682, # odometer (interiors)
    754, # radio, wireless (interiors)
    608, # jacket (random)
    919, # street sign
    603, # hubcap
    408, # analog clock
}

# Instead of a blacklist, we can also look for high-confidence 'vehicle' matches.
# ImageNet indices for common 'vehicle' classes:
VEHICLE_IDS = {
    407, # ambulance
    436, # beach wagon
    468, # taxicab
    511, # convertible
    609, # jeep
    627, # limousine
    656, # minivan
    717, # pickup
    751, # racer
    817, # sports car
    864, # tow truck
    565, # freight car
    475, # bus
    867, # trailer truck
    661, # Model T
    444, # bicycle-built-for-two
}

def load_model(device):
    print("Loading pre-trained MobileNetV3 (ImageNet-1K)…")
    model = timm.create_model("mobilenetv3_large_100", pretrained=True)
    model = model.to(device)
    model.eval()
    return model

def main(threshold: float, dry_run: bool):
    device = "cpu"
    try:
        import torch_directml
        device = torch_directml.device()
        print("Using DirectML (AMD GPU)")
    except ImportError:
        if torch.cuda.is_available():
            device = "cuda"
            print("Using CUDA")

    model = load_model(device)

    # Standard ImageNet transforms
    transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    if not DATA_DIR.exists():
        print(f"Dataset not found at {DATA_DIR}")
        return

    # Skip _Background as it is supposed to be 'garbage'
    class_dirs = [d for d in DATA_DIR.iterdir() if d.is_dir() and d.name != "_Background"]
    
    total_flagged = 0
    total_scanned = 0

    print(f"Auditing {len(class_dirs)} vehicle classes…\n")

    for class_dir in class_dirs:
        flag_class_dir = FLAG_DIR / class_dir.name
        img_files = list(class_dir.glob("*.jpg"))
        
        if not img_files:
            continue
            
        print(f"  {class_dir.name:<35} ({len(img_files)} images)")
        
        for img_path in img_files:
            total_scanned += 1
            try:
                with Image.open(img_path) as img:
                    input_tensor = transform(img.convert("RGB")).unsqueeze(0).to(device)
            except Exception as e:
                print(f"    ✗ Error reading {img_path.name}: {e}")
                continue

            with torch.no_grad():
                output = model(input_tensor)
                probs = torch.nn.functional.softmax(output[0], dim=0)
                conf, pred_idx = torch.max(probs, dim=0)
                pred_idx = pred_idx.item()
                conf = conf.item()

            # Logic: Flag if top prediction is garbage OR if no vehicle class is in top-3 with decent conf
            is_garbage = pred_idx in GARBAGE_IDS
            is_vehicle = pred_idx in VEHICLE_IDS
            
            # Additional heuristic: If the top prediction isn't a vehicle and we are very confident
            # (e.g. it's a dog, a building, a tree)
            should_flag = False
            if is_garbage:
                should_flag = True
                reason = "Identified as car part/garbage"
            elif not is_vehicle and conf > threshold:
                should_flag = True
                reason = f"Identified as non-vehicle ({pred_idx})"
            
            if should_flag:
                total_flagged += 1
                if dry_run:
                    print(f"    [FLAG] {img_path.name} ({conf:.2%}) -> {reason}")
                else:
                    flag_class_dir.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(img_path), str(flag_class_dir / img_path.name))
                    # Also print the finding
                    # print(f"    [MOVED] {img_path.name} ({conf:.2%}) -> {reason}")

    print(f"\nAudit complete.")
    print(f"  Scanned: {total_scanned}")
    print(f"  Flagged: {total_flagged}")
    if dry_run:
        print("  (Dry run: no files were moved)")
    else:
        print(f"  Flagged images moved to: {FLAG_DIR}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit dataset for garbage images")
    parser.add_argument("--threshold", type=float, default=0.5, help="Confidence threshold for non-vehicle flagging")
    parser.add_argument("--dry-run", action="store_true", help="Don't move files, just print what would be flagged")
    args = parser.parse_args()

    main(args.threshold, args.dry_run)
