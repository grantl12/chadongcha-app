from fastapi import APIRouter
from config import settings

router = APIRouter()


@router.get("/latest")
async def model_latest():
    """
    App polls this on launch to check for a newer ML model.
    Returns version + download URLs for CoreML (iOS) and TFLite (Android).
    """
    version = settings.model_current_version
    base = settings.r2_public_url
    return {
        "version": version,
        "coreml_url": f"{base}/models/{version}/vehicle_classifier.mlpackage.zip",
        "tflite_url": f"{base}/models/{version}/vehicle_classifier.tflite",
        "min_app_version": "1.0.0",
    }
