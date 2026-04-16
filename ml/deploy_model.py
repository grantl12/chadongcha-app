#!/usr/bin/env python3
"""
Model deployment pipeline — run after `bootstrap.py --phase export` completes.

Steps:
  1. Load and display the exported manifest
  2. Validate the ONNX model against labelled images (skippable)
  3. Bump the version in manifest.json
  4. Zip the .mlpackage for CoreML delivery
  5. Upload manifest.json, vehicle_classifier.onnx, vehicle_classifier.mlpackage.zip
     to Cloudflare R2 under models/{version}/
  6. Print the Railway command to activate the new version

Usage:
  python ml/deploy_model.py --version 0.2.0
  python ml/deploy_model.py --version 0.2.0 --skip-validate
  python ml/deploy_model.py --version 0.2.0 --dry-run

Required env vars (or .env file at repo root):
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET_MODELS     (default: chadongcha-models)
  R2_PUBLIC_URL        (default: empty — only needed for final URL display)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_REPO_ROOT  = Path(__file__).parent.parent
_ML_DIR     = Path(__file__).parent
EXPORT_DIR  = _ML_DIR / "export"

MANIFEST_PATH = EXPORT_DIR / "manifest.json"
ONNX_PATH     = EXPORT_DIR / "vehicle_classifier.onnx"
MLPKG_PATH    = EXPORT_DIR / "vehicle_classifier.mlpackage"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_dotenv() -> None:
    """Best-effort load of .env at repo root so credentials work locally."""
    env_file = _REPO_ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _require_env(name: str) -> str:
    val = os.environ.get(name) or os.environ.get(name.lower())
    if not val:
        print(f"ERROR: ${name} is not set.")
        print("  Add it to your .env file or export it before running.")
        sys.exit(1)
    return val


def _load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        print("ERROR: ml/export/manifest.json not found.")
        print("  Run:  python ml/training/bootstrap.py --phase export")
        sys.exit(1)
    return json.loads(MANIFEST_PATH.read_text())


def _validate() -> bool:
    validate_script = _ML_DIR / "validate_model.py"
    if not validate_script.exists():
        print("  WARNING: ml/validate_model.py not found — skipping validation.")
        return True
    result = subprocess.run(
        [sys.executable, str(validate_script)],
        cwd=str(_REPO_ROOT),
    )
    return result.returncode == 0


def _zip_mlpackage(tmp_dir: Path) -> Path | None:
    if not MLPKG_PATH.exists():
        print("  WARNING: vehicle_classifier.mlpackage not found — CoreML upload skipped.")
        return None
    zip_base = tmp_dir / "vehicle_classifier.mlpackage"
    shutil.make_archive(str(zip_base), "zip", str(MLPKG_PATH.parent), MLPKG_PATH.name)
    return Path(str(zip_base) + ".zip")


def _get_r2_client():
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("ERROR: boto3 not installed.  pip install boto3")
        sys.exit(1)

    account_id = _require_env("R2_ACCOUNT_ID")
    access_key = _require_env("R2_ACCESS_KEY_ID")
    secret_key = _require_env("R2_SECRET_ACCESS_KEY")
    bucket     = os.environ.get("R2_BUCKET_MODELS") or os.environ.get("r2_bucket_models") or "chadongcha-models"

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    return client, bucket


def _upload(client, bucket: str, key: str, path: Path, dry_run: bool) -> None:
    size_kb = path.stat().st_size // 1024
    tag = "[DRY RUN] " if dry_run else ""
    print(f"  {tag}{path.name}  ({size_kb:,} KB)  →  s3://{bucket}/{key}")
    if not dry_run:
        client.upload_file(str(path), bucket, key)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy trained model to Cloudflare R2.")
    parser.add_argument("--version",       required=True, help="Version string, e.g. 0.2.0")
    parser.add_argument("--skip-validate", action="store_true", help="Skip ONNX validation step")
    parser.add_argument("--dry-run",       action="store_true", help="Show what would be uploaded without uploading")
    args = parser.parse_args()

    _load_dotenv()

    version = args.version

    # ── 1. Load manifest ────────────────────────────────────────────────────
    manifest   = _load_manifest()
    n_classes  = len(manifest.get("classes", []))
    val_acc    = manifest.get("val_acc", 0.0)
    old_ver    = manifest.get("version", "?")

    print(f"\n{'='*55}")
    print(f"  Chadongcha model deploy")
    print(f"{'='*55}")
    print(f"  Classes  : {n_classes}")
    print(f"  val_acc  : {val_acc:.4f}")
    print(f"  Version  : {old_ver}  →  {version}")
    print(f"  Dry run  : {args.dry_run}")
    print(f"{'='*55}\n")

    if not ONNX_PATH.exists():
        print("ERROR: ml/export/vehicle_classifier.onnx not found.")
        print("  Run:  python ml/training/bootstrap.py --phase export")
        sys.exit(1)

    # ── 2. Validate ─────────────────────────────────────────────────────────
    if args.skip_validate:
        print("Skipping validation (--skip-validate).")
    else:
        print("Validating ONNX model...")
        if not _validate():
            print("\nValidation FAILED. Fix issues or re-run with --skip-validate.")
            sys.exit(1)
        print("Validation passed.\n")

    # ── 3. Bump version in manifest ─────────────────────────────────────────
    manifest["version"] = version
    if not args.dry_run:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
        print(f"manifest.json version bumped → {version}")

    # ── 4. Zip mlpackage + upload ────────────────────────────────────────────
    print(f"\nUploading to R2  models/{version}/")
    client, bucket = _get_r2_client()
    prefix = f"models/{version}"

    with tempfile.TemporaryDirectory() as tmp:
        zip_path = _zip_mlpackage(Path(tmp))

        _upload(client, bucket, f"{prefix}/manifest.json",                    MANIFEST_PATH, args.dry_run)
        _upload(client, bucket, f"{prefix}/vehicle_classifier.onnx",          ONNX_PATH,     args.dry_run)
        if zip_path:
            _upload(client, bucket, f"{prefix}/vehicle_classifier.mlpackage.zip", zip_path,  args.dry_run)

    # ── 5. Public URLs ───────────────────────────────────────────────────────
    public_base = (os.environ.get("R2_PUBLIC_URL") or "").rstrip("/")
    if public_base:
        print(f"\nPublic URLs:")
        print(f"  manifest  : {public_base}/{prefix}/manifest.json")
        print(f"  onnx      : {public_base}/{prefix}/vehicle_classifier.onnx")
        print(f"  coreml    : {public_base}/{prefix}/vehicle_classifier.mlpackage.zip")

    # ── 6. Next steps ────────────────────────────────────────────────────────
    dry_tag = "[DRY RUN] " if args.dry_run else ""
    print(f"""
{dry_tag}Upload complete.

To activate this version, bump MODEL_CURRENT_VERSION in Railway:

  railway variables set MODEL_CURRENT_VERSION={version} --service api

  OR: Railway dashboard → api service → Variables → MODEL_CURRENT_VERSION = {version}

Then redeploy the api service. The mobile app will download the new model on next launch.

Note: vehicle_classifier.tflite (Android TFLite) is not uploaded by this script.
  Convert with:  onnx2tf -i ml/export/vehicle_classifier.onnx -o tflite_out
  Then upload:   ml/deploy_model.py handles .onnx and .mlpackage only.
""")


if __name__ == "__main__":
    main()
