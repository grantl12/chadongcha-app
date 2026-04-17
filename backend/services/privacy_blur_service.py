"""
Privacy blur service.

Downloads a photo from R2, blurs any detected faces and license plates
in-place using OpenCV Haar cascades, then re-uploads the processed image
to the same R2 key.

Called as a background task before a community photo is marked photo_shared=True.
Non-fatal — failures are logged but never block the catch response.
"""

import logging
import numpy as np

log = logging.getLogger(__name__)

# Lazy-load OpenCV so import errors don't crash the app if it's missing.
_cv2 = None

def _get_cv2():
    global _cv2
    if _cv2 is None:
        try:
            import cv2 as _imported_cv2
            _cv2 = _imported_cv2
        except ImportError:
            log.warning("opencv-python-headless not installed — privacy blur skipped")
    return _cv2

# Haar cascade paths (bundled with OpenCV — no external download needed)
_FACE_CASCADE  = None
_PLATE_CASCADE = None

def _get_cascades():
    global _FACE_CASCADE, _PLATE_CASCADE
    cv2 = _get_cv2()
    if cv2 is None:
        return None, None
    if _FACE_CASCADE is None:
        _FACE_CASCADE  = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        _PLATE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_russian_plate_number.xml")
    return _FACE_CASCADE, _PLATE_CASCADE


def _blur_regions(img: np.ndarray, regions, strength: int = 31) -> np.ndarray:
    """Gaussian-blur each (x, y, w, h) region in the image."""
    cv2 = _get_cv2()
    k = strength | 1  # must be odd
    for (x, y, w, h) in regions:
        roi = img[y:y + h, x:x + w]
        img[y:y + h, x:x + w] = cv2.GaussianBlur(roi, (k, k), 0)
    return img


def process_image_bytes(img_bytes: bytes) -> bytes:
    """
    Detect and blur faces + license plates in a JPEG image.
    Returns processed JPEG bytes, or original bytes if processing fails.
    """
    cv2 = _get_cv2()
    if cv2 is None:
        return img_bytes

    face_cascade, plate_cascade = _get_cascades()

    try:
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return img_bytes

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Faces — frontal detection; catches passengers through windshields
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
        )
        if len(faces):
            img = _blur_regions(img, faces)
            log.info("privacy_blur: blurred %d face(s)", len(faces))

        # License plates — Haar cascade for rectangular plates (EU / Russian style
        # works reasonably well on NA plates too; best-effort)
        plates = plate_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=3, minSize=(60, 20)
        )
        if len(plates):
            img = _blur_regions(img, plates)
            log.info("privacy_blur: blurred %d plate(s)", len(plates))

        success, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not success:
            return img_bytes
        return buf.tobytes()

    except Exception as exc:
        log.error("privacy_blur: processing failed: %s", exc)
        return img_bytes


async def blur_photo_in_place(photo_key: str) -> bool:
    """
    Download the R2 photo at photo_key, blur faces/plates, re-upload.
    Returns True if the photo was processed and re-uploaded, False otherwise.
    """
    try:
        from services.storage_service import download_from_r2, upload_bytes_to_r2
        original = download_from_r2(photo_key)
        if not original:
            log.warning("privacy_blur: could not download %s", photo_key)
            return False

        processed = process_image_bytes(original)

        if processed is original:
            # No changes (or cv2 unavailable)
            return False

        upload_bytes_to_r2(processed, photo_key, content_type="image/jpeg")
        log.info("privacy_blur: re-uploaded %s (%d → %d bytes)", photo_key, len(original), len(processed))
        return True

    except Exception as exc:
        log.error("privacy_blur: blur_photo_in_place failed for %s: %s", photo_key, exc)
        return False
