#!/usr/bin/env bash
# debian-repo.sh — Manage the World Office Debian APT repository
# Usage: ./debian-repo.sh <command> [args...]
#
# Commands:
#   init <repo-dir>      — Initialize a new repository structure
#   add <repo-dir> <deb> — Add a .deb package to the repository
#   sign <repo-dir>      — Regenerate Packages/Release files and sign
#   verify <repo-dir>    — Verify repository structure is valid

set -euo pipefail

COMMAND="${1:?Usage: $0 <command> <repo-dir> [deb-file]}"
REPO_DIR="${2:?Usage: $0 <command> <repo-dir> [deb-file]}"

case "$COMMAND" in
  init)
    mkdir -p "${REPO_DIR}/dists/stable/main/binary-amd64"
    mkdir -p "${REPO_DIR}/pool/main/w/world-office"
    echo "Initialized Debian repo at ${REPO_DIR}"
    ;;

  add)
    DEB_FILE="${3:?Usage: $0 add <repo-dir> <deb-file>}"
    if [ ! -f "$DEB_FILE" ]; then
      echo "Error: .deb file not found: $DEB_FILE"
      exit 1
    fi
    POOL_DIR="${REPO_DIR}/pool/main/w/world-office"
    VERSION=$(dpkg-deb -f "$DEB_FILE" Version)
    ARCH=$(dpkg-deb -f "$DEB_FILE" Architecture)
    cp "$DEB_FILE" "${POOL_DIR}/world-office_${VERSION}_${ARCH}.deb"
    echo "Added: world-office_${VERSION}_${ARCH}.deb"
    ;;

  sign)
    DIST="${3:-stable}"
    COMP="${4:-main}"
    ARCH="${5:-amd64}"

    cd "${REPO_DIR}"
    dpkg-scanpackages --multiversion "pool/${COMP}" > "dists/${DIST}/${COMP}/binary-${ARCH}/Packages" 2>/dev/null
    gzip -9c "dists/${DIST}/${COMP}/binary-${ARCH}/Packages" > "dists/${DIST}/${COMP}/binary-${ARCH}/Packages.gz"

    cd "dists/${DIST}"
    apt-ftparchive release . > Release 2>/dev/null
    if [ -n "${GPG_PASSPHRASE:-}" ]; then
      gpg --batch --passphrase "$GPG_PASSPHRASE" --pinentry-mode loopback \
        --clearsign -o InRelease Release
      gpg --batch --passphrase "$GPG_PASSPHRASE" --pinentry-mode loopback \
        -abs -o Release.gpg Release
    else
      gpg --clearsign -o InRelease Release
      gpg -abs -o Release.gpg Release
    fi
    echo "Signed dists/${DIST}/"
    ;;

  verify)
    DIST="${3:-stable}"
    ARCH="${4:-amd64}"
    PASS=true
    for f in "${REPO_DIR}/dists/${DIST}/InRelease" \
             "${REPO_DIR}/dists/${DIST}/Release.gpg" \
             "${REPO_DIR}/dists/${DIST}/main/binary-${ARCH}/Packages.gz"; do
      if [ ! -f "$f" ]; then
        echo "MISSING: $f"
        PASS=false
      fi
    done
    if [ "$PASS" = true ]; then
      echo "Repository structure valid."
    else
      echo "Repository structure INVALID."
      exit 1
    fi
    ;;

  *)
    echo "Unknown command: $COMMAND"
    echo "Usage: $0 <init|add|sign|verify> <repo-dir> [args...]"
    exit 1
    ;;
esac
