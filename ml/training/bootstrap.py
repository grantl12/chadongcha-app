"""
ML Training Bootstrap — Chadongcha vehicle classifier

Phases:
  info      — print configured generation classes
  classify  — train EfficientNet-Lite B2 classifier
  export    — export trained model to CoreML (.mlpackage) + TFLite (.tflite)

Usage:
  python training/bootstrap.py --phase info
  python training/bootstrap.py --phase classify --epochs 30
  python training/bootstrap.py --phase export
"""

import argparse
import json
from pathlib import Path

DATA_DIR   = Path(__file__).parent.parent / "data" / "images"
MODELS_DIR = Path(__file__).parent.parent / "models"
EXPORT_DIR = Path(__file__).parent.parent / "export"

# Generation taxonomy — top 30 at bootstrap, grows to 300 pre-launch
# Format: "Make Model GenerationCode"
GENERATION_CLASSES = [
    "Toyota GR86 ZN8",
    "Toyota Supra A90",
    "Toyota Camry XV70",
    "Honda Civic FE",
    "Honda Accord CN2",
    "Honda CR-V RS",
    "Mazda3 BP",
    "Mazda MX-5 ND",
    "Subaru WRX VB",
    "Subaru BRZ ZD8",
    "Mitsubishi Outlander CW",
    "Nissan Z RZ34",
    "Ford Mustang S650",
    "Ford F-150 P702",
    "Chevrolet Corvette C8",
    "Chevrolet Silverado GMTK2",
    "Dodge Challenger LC",
    "Jeep Wrangler JL",
    "Jeep Grand Cherokee WL",
    "BMW 3-Series G20",
    "BMW M3 G80",
    "BMW M4 G82",
    "Mercedes C-Class W206",
    "Mercedes AMG-GT X290",
    "Audi A4 B9",
    "Volkswagen Golf MK8",
    "Porsche 911 992",
    "Ferrari SF90 F173",
    "Lamborghini Huracan LB724",
    "Bugatti Chiron VGT",
]


def phase_info():
    print(f"Configured generation classes: {len(GENERATION_CLASSES)}")
    for i, cls in enumerate(GENERATION_CLASSES):
        print(f"  {i:3d}  {cls}")


def phase_classify(epochs: int):
    try:
        from ultralytics import YOLO
        import torch
    except ImportError:
        print("Install deps: pip install ultralytics torch torchvision timm")
        return

    if not DATA_DIR.exists():
        print(f"Dataset not found at {DATA_DIR}")
        print("Populate ml/data/images/<ClassName>/*.jpg before training.")
        return

    print(f"Training EfficientNet-Lite B2 classifier for {len(GENERATION_CLASSES)} classes")
    print(f"Dataset: {DATA_DIR}")
    print(f"Epochs: {epochs}")

    # TODO: replace with timm EfficientNet-Lite B2 training loop
    # Using YOLO classify as scaffold until custom training loop is wired
    model = YOLO("yolov8n-cls.pt")
    results = model.train(
        data=str(DATA_DIR),
        epochs=epochs,
        imgsz=260,           # EfficientNet-Lite B2 native resolution
        project=str(MODELS_DIR),
        name="vehicle_classifier",
    )
    print(f"Training complete. Model saved to {MODELS_DIR}")


def phase_export():
    try:
        import coremltools as ct
        import torch
    except ImportError:
        print("Install deps: pip install coremltools torch")
        return

    checkpoint = MODELS_DIR / "vehicle_classifier" / "weights" / "best.pt"
    if not checkpoint.exists():
        print(f"No trained model found at {checkpoint}. Run --phase classify first.")
        return

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    from ultralytics import YOLO
    model = YOLO(str(checkpoint))

    # Export CoreML
    print("Exporting to CoreML...")
    model.export(format="coreml", imgsz=260, nms=True)
    print(f"CoreML export saved to {EXPORT_DIR}")

    # Export TFLite
    print("Exporting to TFLite...")
    model.export(format="tflite", imgsz=260, int8=False)
    print(f"TFLite export saved to {EXPORT_DIR}")

    # Write version manifest
    manifest = {
        "version": "0.0.1",
        "classes": GENERATION_CLASSES,
        "input_size": 260,
        "confidence_auto_catch": 0.72,
        "confidence_probable": 0.50,
    }
    manifest_path = EXPORT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"Manifest written to {manifest_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["info", "classify", "export"], required=True)
    parser.add_argument("--epochs", type=int, default=30)
    args = parser.parse_args()

    if args.phase == "info":
        phase_info()
    elif args.phase == "classify":
        phase_classify(args.epochs)
    elif args.phase == "export":
        phase_export()
