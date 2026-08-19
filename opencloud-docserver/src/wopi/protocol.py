"""WOPI protocol helpers: response shapes, lock headers, constants.

Follows the WOPI (Web Application Open Platform Interface) spec
https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/
"""

from __future__ import annotations

# Lock header name used on PutFile / lock operations
LOCK_HEADER = "X-WOPI-Lock"
OLD_LOCK_HEADER = "X-WOPI-OldLock"
OVERRIDE_HEADER = "X-WOPI-Override"

# Response codes defined by the WOPI spec
HTTP_FILE_NOT_FOUND = 404
HTTP_LOCK_MISMATCH = 409
HTTP_LOCK_CONFLICT = 409
HTTP_FILE_TOO_LARGE = 413
HTTP_METHOD_NOT_IMPLEMENTED = 501


class WopiError(Exception):
    """Represents a WOPI-protocol-level failure with an HTTP status."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def empty_wopi_response() -> dict:
    """Return an empty WOPI JSON body (used for most calls)."""
    return {}


def file_info_response(
    *,
    name: str,
    version: str,
    size: int,
    owner: str,
    user_id: str,
    user_name: str,
    last_modified: int,
    read_only: bool = False,
    supports_update: bool = True,
    supports_locks: bool = True,
    supports_get_lock: bool = True,
    user_can_write: bool = True,
    user_can_not_write: bool = False,
) -> dict:
    """Build the CheckFileInfo JSON payload per the WOPI spec."""
    return {
        "BaseFileName": name,
        "OwnerId": owner,
        "Size": size,
        "UserId": user_id,
        "UserFriendlyName": user_name,
        "Version": version,
        "LastModifiedTime": last_modified,
        "ReadOnly": read_only,
        "SupportsUpdate": supports_update,
        "SupportsLocks": supports_locks,
        "SupportsGetLock": supports_get_lock,
        "UserCanWrite": user_can_write,
        "UserCanNotWrite": user_can_not_write,
        "UserCanRename": True,
        "SupportsRename": False,
    }


def lock_mismatch_error(expected: str, actual: str) -> WopiError:
    """Return the standard WOPI lock-mismatch error with X-WOPI-Lock."""
    return WopiError(HTTP_LOCK_MISMATCH, f"Lock mismatch: expected {expected!r}, got {actual!r}")
