"""
ML Training Bootstrap — Chadongcha vehicle classifier

Phases:
  info      — print configured generation classes
  classify  — train EfficientNet-Lite B2 classifier via timm
  export    — export trained model to CoreML (.mlpackage) + ONNX

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

IMGSZ = 260  # EfficientNet-Lite B2 native resolution

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
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, Subset
        from torchvision import datasets, transforms
        import timm
    except ImportError:
        print("Install deps: pip install torch torchvision timm")
        return

    if not DATA_DIR.exists() or not any(DATA_DIR.iterdir()):
        print(f"Dataset not found at {DATA_DIR}")
        print("Run scrape_images.py first.")
        return

    device = (
        "cuda" if torch.cuda.is_available()
        else "mps" if torch.backends.mps.is_available()
        else "cpu"
    )
    print(f"Device: {device}")

    # ImageNet normalization constants
    MEAN = [0.485, 0.456, 0.406]
    STD  = [0.229, 0.224, 0.225]

    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(IMGSZ, scale=(0.65, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05),
        transforms.RandomRotation(10),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    val_tf = transforms.Compose([
        transforms.Resize(int(IMGSZ * 1.15)),   # ~300
        transforms.CenterCrop(IMGSZ),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])

    # Two ImageFolder instances over the same root — different transforms
    train_ds = datasets.ImageFolder(str(DATA_DIR), transform=train_tf)
    val_ds   = datasets.ImageFolder(str(DATA_DIR), transform=val_tf)

    # Reproducible 80/20 split
    n = len(train_ds)
    indices = torch.randperm(n, generator=torch.Generator().manual_seed(42)).tolist()
    n_val = max(1, int(n * 0.2))
    train_idx, val_idx = indices[n_val:], indices[:n_val]

    train_loader = DataLoader(
        Subset(train_ds, train_idx),
        batch_size=32, shuffle=True, num_workers=4, pin_memory=True,
    )
    val_loader = DataLoader(
        Subset(val_ds, val_idx),
        batch_size=32, shuffle=False, num_workers=4, pin_memory=True,
    )

    n_classes = len(train_ds.classes)
    print(f"Classes : {n_classes}")
    print(f"Train   : {len(train_idx)} images")
    print(f"Val     : {len(val_idx)} images")

    model = timm.create_model("efficientnet_lite2", pretrained=True, num_classes=n_classes)
    model = model.to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    best_acc = 0.0

    for epoch in range(1, epochs + 1):
        # ---- train ----
        model.train()
        running_loss = 0.0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            loss = criterion(model(imgs), labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
        scheduler.step()

        # ---- validate ----
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs, labels = imgs.to(device), labels.to(device)
                preds = model(imgs).argmax(1)
                correct += (preds == labels).sum().item()
                total += len(labels)

        val_acc  = correct / total
        avg_loss = running_loss / len(train_loader)
        marker   = "  ✓ best" if val_acc > best_acc else ""
        print(f"Epoch {epoch:3d}/{epochs}  loss={avg_loss:.4f}  val_acc={val_acc:.3f}{marker}")

        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "classes": train_ds.classes,   # alphabetical dir names
                    "imgsz": IMGSZ,
                    "epoch": epoch,
                    "val_acc": val_acc,
                },
                MODELS_DIR / "best.pt",
            )

    print(f"\nTraining complete.  Best val acc: {best_acc:.3f}")
    print(f"Checkpoint: {MODELS_DIR / 'best.pt'}")


def phase_export():
    try:
        import torch
        import torch.nn as nn
        import timm
        import coremltools as ct
    except ImportError:
        print("Install deps: pip install torch timm coremltools onnx")
        return

    checkpoint_path = MODELS_DIR / "best.pt"
    if not checkpoint_path.exists():
        print(f"No checkpoint at {checkpoint_path}. Run --phase classify first.")
        return

    ckpt      = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    classes   = ckpt["classes"]
    imgsz     = ckpt.get("imgsz", IMGSZ)
    n_classes = len(classes)
    print(f"Loaded checkpoint: {n_classes} classes  imgsz={imgsz}  val_acc={ckpt.get('val_acc', '?'):.3f}")

    # Rebuild model
    backbone = timm.create_model("efficientnet_lite2", pretrained=False, num_classes=n_classes)
    backbone.load_state_dict(ckpt["model_state"])
    backbone.eval()

    # Wrap model to bake in ImageNet normalization so exported model accepts
    # raw [0, 1] float tensors (CoreML ImageType provides /255 automatically).
    class NormalizedModel(nn.Module):
        def __init__(self, net: nn.Module):
            super().__init__()
            self.net = net
            self.register_buffer(
                "mean", torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
            )
            self.register_buffer(
                "std",  torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.net((x - self.mean) / self.std)

    model = NormalizedModel(backbone)
    model.eval()

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros(1, 3, imgsz, imgsz)

    # ------------------------------------------------------------------
    # CoreML (.mlpackage)
    # ------------------------------------------------------------------
    print("\nExporting to CoreML…")
    traced = torch.jit.trace(model, dummy)

    coreml_model = ct.convert(
        traced,
        inputs=[
            ct.ImageType(
                name="image",
                shape=(1, 3, imgsz, imgsz),
                scale=1 / 255.0,        # pixel → [0, 1]; model handles normalization
                bias=[0, 0, 0],
                color_layout=ct.colorlayout.RGB,
            )
        ],
        outputs=[ct.TensorType(name="logits")],
        classifier_config=ct.ClassifierConfig(classes),
        minimum_deployment_target=ct.target.iOS15,
        convert_to="mlprogram",
    )

    coreml_model.short_description = "Chadongcha vehicle generation classifier"
    coreml_model.author            = "Chadongcha"
    coreml_model.version           = "0.1.0"

    coreml_path = EXPORT_DIR / "vehicle_classifier.mlpackage"
    coreml_model.save(str(coreml_path))
    print(f"CoreML saved → {coreml_path}")

    # ------------------------------------------------------------------
    # ONNX (TFLite conversion path — run onnx2tf or ai_edge_torch separately)
    # ------------------------------------------------------------------
    print("\nExporting to ONNX…")
    try:
        import onnx  # noqa: F401
        onnx_path = EXPORT_DIR / "vehicle_classifier.onnx"
        torch.onnx.export(
            model,
            dummy,
            str(onnx_path),
            input_names=["image"],
            output_names=["logits"],
            dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
            opset_version=17,
        )
        print(f"ONNX saved → {onnx_path}")
        print("  Convert to TFLite with: onnx2tf -i vehicle_classifier.onnx -o tflite_out")
    except ImportError:
        print("onnx not installed — skipping ONNX export (pip install onnx onnxruntime)")

    # ------------------------------------------------------------------
    # Manifest
    # ------------------------------------------------------------------
    manifest = {
        "version": "0.1.0",
        "classes": classes,
        "input_size": imgsz,
        "confidence_auto_catch": 0.72,
        "confidence_probable": 0.50,
        "val_acc": round(ckpt.get("val_acc", 0.0), 4),
    }
    manifest_path = EXPORT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nManifest → {manifest_path}")
    print("\nExport complete.")


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
