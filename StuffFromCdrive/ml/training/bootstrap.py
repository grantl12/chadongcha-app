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

_BASE      = Path("D:/Users/grant/Documents/ChaDongCha/ml")
DATA_DIR   = _BASE / "data" / "images"
MODELS_DIR = _BASE / "models"
EXPORT_DIR = _BASE / "export"

IMGSZ = 224  # MobileNetV3 native resolution

# Generation taxonomy — must stay in sync with CLASS_QUERIES in scrape_images.py
# Format: "Make Model GenerationCode"
GENERATION_CLASSES = [
    # ── Cars ────────────────────────────────────────────────────────────────
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
    "2021 Tesla Model S",
    "2025 Honda Odyssey",
    # ── Trucks ──────────────────────────────────────────────────────────────
    "Ram 1500 DT",
    "Toyota Tacoma AN120",
    "Toyota Tundra XK70",
    "Ford Ranger P703",
    # ── Motorcycles ─────────────────────────────────────────────────────────
    "Ducati Panigale V4",
    "Honda CBR1000RR-R",
    "Kawasaki Ninja ZX-10R",
    "Yamaha YZF-R1",
    "Harley-Davidson Sportster S",
    "BMW S1000RR K67",
    # ── Background / negative class ─────────────────────────────────────────
    "_Background",
]


def phase_info():
    print(f"Configured generation classes: {len(GENERATION_CLASSES)}")
    for i, cls in enumerate(GENERATION_CLASSES):
        print(f"  {i:3d}  {cls}")


def phase_classify(epochs: int, resume: bool = False, patience: int = 7):
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

    using_directml = False
    try:
        import torch_directml
        device = torch_directml.device()
        using_directml = True
        print("Device: DirectML (AMD GPU)")
    except ImportError:
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

    # DirectML doesn't support pin_memory; use num_workers=0 to avoid Windows spawn issues
    n_workers = 0 if using_directml else 4
    pin = not using_directml

    train_loader = DataLoader(
        Subset(train_ds, train_idx),
        batch_size=32, shuffle=True, num_workers=n_workers, pin_memory=pin,
    )
    val_loader = DataLoader(
        Subset(val_ds, val_idx),
        batch_size=32, shuffle=False, num_workers=n_workers, pin_memory=pin,
    )

    n_classes = len(train_ds.classes)
    print(f"Classes : {n_classes}")
    print(f"Train   : {len(train_idx)} images")
    print(f"Val     : {len(val_idx)} images")

    checkpoint_path  = MODELS_DIR / "best.pt"
    start_epoch      = 1
    best_acc         = 0.0
    epochs_no_improve = 0

    model = timm.create_model("mobilenetv3_large_100", pretrained=True, num_classes=n_classes)

    if resume and checkpoint_path.exists():
        ckpt = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        model.load_state_dict(ckpt["model_state"])
        best_acc    = ckpt.get("val_acc", 0.0)
        start_epoch = ckpt.get("epoch", 0) + 1
        print(f"Resumed from epoch {start_epoch - 1}  (best val_acc={best_acc:.3f})")
    elif resume:
        print("No checkpoint found — starting from pretrained weights.")

    model = model.to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    # T_max covers the full remaining run so LR anneals smoothly to the end
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    total_epochs = start_epoch - 1 + epochs

    for epoch in range(start_epoch, total_epochs + 1):
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

        improved = val_acc > best_acc
        if improved:
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1

        marker = f"  ✓ best" if improved else f"  (no improvement {epochs_no_improve}/{patience})"
        print(f"Epoch {epoch:3d}/{total_epochs}  loss={avg_loss:.4f}  val_acc={val_acc:.3f}{marker}")

        if improved:
            best_acc = val_acc
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "classes": train_ds.classes,   # alphabetical dir names
                    "arch": "mobilenetv3_large_100",
                    "imgsz": IMGSZ,
                    "epoch": epoch,
                    "val_acc": val_acc,
                },
                MODELS_DIR / "best.pt",
            )

        if epochs_no_improve >= patience:
            print(f"\nEarly stopping — val_acc has not improved for {patience} consecutive epochs.")
            break

    print(f"\nTraining complete.  Best val acc: {best_acc:.3f}")
    print(f"Checkpoint: {MODELS_DIR / 'best.pt'}")
    print(f"To keep training: python training/bootstrap.py --phase classify --epochs N --resume")


def phase_export():
    try:
        import torch
        import torch.nn as nn
        import timm
    except ImportError:
        print("Install deps: pip install torch timm onnx")
        return

    checkpoint_path = MODELS_DIR / "best.pt"
    if not checkpoint_path.exists():
        print(f"No checkpoint at {checkpoint_path}. Run --phase classify first.")
        return

    ckpt      = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    classes   = ckpt["classes"]
    imgsz     = ckpt.get("imgsz", IMGSZ)
    n_classes = len(classes)
    print(f"Loaded checkpoint: {n_classes} classes  imgsz={imgsz}  val_acc={ckpt.get('val_acc', '?'):.3f}")

    # Rebuild model
    arch = ckpt.get("arch", "mobilenetv3_large_100")
    backbone = timm.create_model(arch, pretrained=False, num_classes=n_classes)
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
    # CoreML (.mlpackage) — macOS/Linux only
    # ------------------------------------------------------------------
    try:
        import coremltools as ct
        print("\nExporting to CoreML…")
        traced = torch.jit.trace(model, dummy)
        coreml_model = ct.convert(
            traced,
            inputs=[
                ct.ImageType(
                    name="image",
                    shape=(1, 3, imgsz, imgsz),
                    scale=1 / 255.0,
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
    except (ImportError, RuntimeError, Exception) as e:
        print(f"\nSkipping CoreML export (not supported on this platform: {e})")

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
    parser.add_argument("--resume", action="store_true", help="Resume from best.pt checkpoint")
    parser.add_argument("--patience", type=int, default=7,
                        help="Early stopping: epochs without val_acc improvement before stopping (default 7)")
    parser.add_argument("--data-dir", dest="data_dir", default=None,
                        help="Override image dataset directory (default: ml/data/images)")
    args = parser.parse_args()

    if args.data_dir:
        DATA_DIR   = Path(args.data_dir)
        MODELS_DIR = DATA_DIR.parent.parent / "models"
        EXPORT_DIR = DATA_DIR.parent.parent / "export"

    if args.phase == "info":
        phase_info()
    elif args.phase == "classify":
        phase_classify(args.epochs, resume=args.resume, patience=args.patience)
    elif args.phase == "export":
        phase_export()
