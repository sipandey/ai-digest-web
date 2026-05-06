"""
Application-layer AES-256-GCM decryption for Notion credential fields.

Matches the encryption format produced by web/lib/encryption.ts:
  ciphertext = base64url(iv[12 bytes]) + "." + base64url(ciphertext + authTag)

Key source: NOTION_TOKEN_ENCRYPTION_KEY env var — must be exactly 64 hex
characters (32 bytes = 256-bit key).
Same key used by the Next.js web app.

Backward compatibility:
  decrypt_if_encrypted() returns the value unchanged if it does not match
  the encrypted format.  This handles legacy plaintext rows during the
  migration window (before scripts/encrypt-existing-tokens.ts is run).
"""

import base64
import os
import re

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _load_key() -> bytes:
    raw = os.environ.get("NOTION_TOKEN_ENCRYPTION_KEY", "")
    if not raw:
        raise ValueError("NOTION_TOKEN_ENCRYPTION_KEY env var is not set")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", raw):
        raise ValueError(
            "NOTION_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)"
        )
    return bytes.fromhex(raw)


def _b64url_decode(s: str) -> bytes:
    # base64url uses '-' and '_'; add padding that Python requires.
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def is_encrypted(value: str) -> bool:
    """Return True if *value* looks like an AES-GCM token (iv.ciphertext)."""
    parts = value.split(".")
    if len(parts) != 2:
        return False
    return all(re.fullmatch(r"[A-Za-z0-9_-]+", p) for p in parts)


def decrypt(encrypted_value: str) -> str:
    """Decrypt an AES-256-GCM value produced by web/lib/encryption.ts.

    Raises ValueError / cryptography exceptions on bad key or tampered data.
    """
    dot = encrypted_value.index(".")
    iv = _b64url_decode(encrypted_value[:dot])
    ct_with_tag = _b64url_decode(encrypted_value[dot + 1 :])

    aesgcm = AESGCM(_load_key())
    # AESGCM.decrypt raises InvalidTag if the ciphertext was tampered with.
    plaintext = aesgcm.decrypt(iv, ct_with_tag, None)  # no AAD
    return plaintext.decode()


def decrypt_if_encrypted(value: str) -> str:
    """Decrypt *value* if it looks encrypted; return it unchanged otherwise.

    The unchanged-return path handles legacy plaintext rows that predate the
    encryption migration.  Once all rows are migrated, this function is
    equivalent to decrypt().
    """
    if is_encrypted(value):
        return decrypt(value)
    return value
