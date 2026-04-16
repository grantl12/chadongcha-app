"""
Cloudflare R2 storage service.

Uses boto3's S3-compatible client with a custom endpoint URL.
Generates presigned PUT URLs so mobile clients can upload directly to R2
without proxying binary data through the FastAPI backend.
"""

import boto3
from botocore.config import Config
from config import settings

_s3_client = None


def _get_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def presign_photo_upload(key: str, expires_in: int = 300) -> str:
    """
    Generate a presigned PUT URL for a scan photo upload.

    Args:
        key:        R2 object key (e.g. 'scans/scan360/2026/04/abc123.jpg')
        expires_in: URL validity in seconds (default 5 minutes)

    Returns:
        A presigned URL the mobile client can PUT to directly.
    """
    client = _get_client()
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket":      settings.r2_bucket_assets,
            "Key":         key,
            "ContentType": "image/jpeg",
        },
        ExpiresIn=expires_in,
        HttpMethod="PUT",
    )


def public_url(key: str) -> str:
    """Build the public CDN URL for a stored R2 object."""
    base = settings.r2_public_url.rstrip("/")
    return f"{base}/{key}"
