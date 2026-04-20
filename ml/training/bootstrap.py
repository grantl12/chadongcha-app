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
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)  # type: ignore[union-attr]

_BASE      = Path(__file__).parent.parent
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
    # ── SUVs / Off-Road ──────────────────────────────────────────────────────
    "Ford Bronco U725",
    "Toyota 4Runner N280",
    "Toyota Land_Cruiser J300",
    "Mercedes G-Class W464",
    # ── Trucks ──────────────────────────────────────────────────────────────
    "Ram 1500 DT",
    "Toyota Tacoma AN120",
    "Toyota Tundra XK70",
    "Ford Ranger P703",
    "Jeep Gladiator JT",
    "GMC Sierra T1",
    # ── Sports / Muscle ─────────────────────────────────────────────────────
    "Nissan GT-R R35",
    "Nissan 370Z Z34",
    "Dodge Charger LD",
    "Acura NSX NC1",
    "Audi RS5 FY",
    "Honda Civic Type_R FL5",
    # ── Luxury ───────────────────────────────────────────────────────────────
    "Cadillac CT5-V BW",
    "Genesis G80 RG3",
    # ── Korean ───────────────────────────────────────────────────────────────
    "Hyundai IONIQ5 NE1",
    "Kia EV6 CV",
    # ── Motorcycles ─────────────────────────────────────────────────────────
    "Ducati Panigale V4",
    "Honda CBR1000RR-R",
    "Kawasaki Ninja ZX-10R",
    "Yamaha YZF-R1",
    "Harley-Davidson Sportster S",
    "BMW S1000RR K67",
    # ── Vans ─────────────────────────────────────────────────────────────────
    "Honda Odyssey RL6",
    "Toyota Sienna 4th Gen",
    "2000 Toyota Sienna Van",
    "Chrysler Pacifica",
    "Kia Carnival",
    # ── Hybrid / EV common ───────────────────────────────────────────────────
    "Toyota Prius 4th Gen",
    "Toyota Prius Prime",
    "Nissan LEAF 2nd Gen",
    "Chevrolet Bolt EV",
    "Volkswagen ID.4",
    "Ford Mustang Mach-E",
    # ── Entry-level luxury sedans ────────────────────────────────────────────
    "Lexus ES 350 7th Gen",
    "Cadillac CT5",
    "Acura TLX 2nd Gen",
    "Infiniti Q50",
    "Volvo S60 3rd Gen",
    "Genesis G70 2nd Gen",
    # ── Entry-level luxury SUVs ──────────────────────────────────────────────
    "BMW X3 G01",
    "Mercedes GLC W253",
    "Audi Q5 2nd Gen",
    "Lexus RX 500h",
    "Cadillac XT5",
    "Acura MDX 4th Gen",
    "Infiniti QX60 3rd Gen",
    "Volvo XC60 2nd Gen",
    "Genesis GV70",
    "Lincoln Corsair",
    # ── Public service / working fleet ──────────────────────────────────────
    "School Bus",
    "City Transit Bus",
    "Garbage Truck",
    "Recycling Truck",
    "Police Explorer",
    "Police Charger",
    "Police Tahoe",
    "Fire Engine",
    "Ladder Truck",
    "Ambulance",
    "USPS Mail Truck",
    "UPS Delivery Truck",
    "FedEx Truck",
    "Amazon Delivery Van",
    "Tow Truck",
    "Street Sweeper",
    # ── Background / negative class ─────────────────────────────────────────
    "_Background"
]


def phase_info():
    print(f"Configured generation classes: {len(GENERATION_CLASSES)}")
    for i, cls in enumerate(GENERATION_CLASSES):
        print(f"  {i:3d}  {cls}")


def phase_classify(epochs: int, resume: bool = False, patience: int = 10,
                   use_sam: bool = False, freeze_backbone: bool = False):
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
    except Exception as e:
        # ImportError  — package not installed
        # TypeError    — torch_directml staticmethod bug on Python 3.8
        # Any other    — DML not available on this system
        if not isinstance(e, ImportError):
            print(f"  [DirectML] Skipped ({type(e).__name__}: {e})")
        device = (
            "cuda" if torch.cuda.is_available()
            else "mps" if torch.backends.mps.is_available()
            else "cpu"
        )
        print(f"Device: {device}")
        if device == "cpu":
            print("ERROR: No GPU available (DirectML, CUDA, or MPS). Refusing to train on CPU.")
            print("Ensure torch-directml is installed and the AMD GPU is accessible, then retry.")
            return

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
        batch_size=64, shuffle=True, num_workers=n_workers, pin_memory=pin,
    )
    val_loader = DataLoader(
        Subset(val_ds, val_idx),
        batch_size=64, shuffle=False, num_workers=n_workers, pin_memory=pin,
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

    if freeze_backbone:
        # Incremental class addition: lock the feature extractor so only the
        # classifier head trains. Safe because MobileNetV3's backbone already
        # learned vehicle features; new classes only need the head to adapt.
        for name, param in model.named_parameters():
            if "classifier" not in name:
                param.requires_grad = False
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        total     = sum(p.numel() for p in model.parameters())
        print(f"Backbone frozen — training {trainable:,} / {total:,} params (classifier head only)")

    model = model.to(device)

    # SGD+momentum: only basic multiply/add ops — fully supported on DirectML.
    # AdamW's lerp_ (momentum EMA) is not supported and falls back to CPU.
    # SAM wraps SGD for sharpness-aware training (better generalization, ~2× slower).
    _sgd_kwargs = dict(lr=0.01, momentum=0.9, weight_decay=1e-4, nesterov=True)
    if use_sam:
        from sam import SAM  # noqa: PLC0415
        optimizer = SAM(model.parameters(), torch.optim.SGD, rho=0.05, **_sgd_kwargs)
        print("Optimizer: SAM (ρ=0.05, base=SGD)")
    else:
        optimizer = torch.optim.SGD(model.parameters(), **_sgd_kwargs)
        print("Optimizer: SGD+momentum")
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    total_epochs = start_epoch - 1 + epochs

    for epoch in range(start_epoch, total_epochs + 1):
        t0 = time.time()
        # ---- train ----
        model.train()
        running_loss = 0.0
        for imgs, labels in train_loader:
            imgs, labels = imgs.to(device), labels.to(device)
            if use_sam:
                loss = criterion(model(imgs), labels)
                loss.backward()
                optimizer.first_step(zero_grad=True)
                criterion(model(imgs), labels).backward()
                optimizer.second_step(zero_grad=True)
            else:
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

        elapsed = time.time() - t0
        marker = "  * best" if improved else f"  (no improvement {epochs_no_improve}/{patience})"
        print(f"Epoch {epoch:3d}/{total_epochs}  loss={avg_loss:.4f}  val_acc={val_acc:.3f}  {elapsed:.0f}s{marker}")

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
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--resume", action="store_true", help="Resume from best.pt checkpoint")
    parser.add_argument("--patience", type=int, default=10,
                        help="Early stopping: epochs without val_acc improvement (default 10)")
    parser.add_argument("--optimizer", choices=["sgd", "sam"], default="sgd",
                        help="sgd (default) or sam (sharpness-aware, ~2x slower, better generalization)")
    parser.add_argument("--freeze-backbone", dest="freeze_backbone", action="store_true",
                        help="Freeze feature extractor, train classifier head only (incremental class addition)")
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
        phase_classify(args.epochs, resume=args.resume, patience=args.patience,
                       use_sam=(args.optimizer == "sam"), freeze_backbone=args.freeze_backbone)
    elif args.phase == "export":
        phase_export()
