# GPG Signing Key Management

**Last updated:** 2026-06-23  
**Purpose:** Governs the GPG key used to sign the World Office Debian/APT repository  
**Related:** `server/desktop/tauri-poc/scripts/debian-repo.sh`, `.forgejo/workflows/release.yml`

---

## Key Overview

| Property | Value |
|----------|-------|
| **Algorithm** | RSA-4096 |
| **Usage** | Signing only (no encryption) |
| **Expiration** | 2 years from creation |
| **Purpose** | Sign `Release` → `InRelease` / `Release.gpg` files in APT repo |
| **Email UID** | `deploy@world-office.dev` |
| **Real Name** | `World Office Debian Repository` |

---

## Key Generation

```bash
gpg --full-generate-key
# Select: RSA and RSA, 4096 bits, 2y expiry
# UID: World Office Debian Repository <deploy@world-office.dev>
```

After generation, export the public key:

```bash
# Export to ASCII-armored public key
gpg --armor --export deploy@world-office.dev > world-office-archive-keyring.gpg

# Add to APT repo root (so users can trust the repo)
cp world-office-archive-keyring.gpg /path/to/repo/
```

Users add it with:

```bash
curl -fsSL https://world-office.codeberg.page/desktop-releases/world-office-archive-keyring.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/world-office-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/world-office-archive-keyring.gpg] https://world-office.codeberg.page/desktop-releases stable main" \
  | sudo tee /etc/apt/sources.list.d/world-office.list

sudo apt update
```

---

## Key Storage & Distribution

The signing key is stored as a **Forgejo Actions secret**:

| Secret Name | Value | Used In |
|-------------|-------|---------|
| `GPG_PRIVATE_KEY` | ASCII-armored private key | `release.yml` |
| `GPG_PASSPHRASE` | Key passphrase | `release.yml` |

The public key is committed to the repository at:
- `desktop/tauri-poc/public/world-office-archive-keyring.gpg`
- Published to Codeberg Pages at `/desktop-releases/world-office-archive-keyring.gpg`

---

## CI Integration

The release workflow (`release.yml`) imports the key and signs the repo:

```yaml
- name: Import GPG key
  env:
    GPG_PRIVATE_KEY: ${{ secrets.GPG_PRIVATE_KEY }}
    GPG_PASSPHRASE: ${{ secrets.GPG_PASSPHRASE }}
  run: |
    echo "$GPG_PRIVATE_KEY" | gpg --batch --import
    echo "$GPG_PASSPHRASE" | gpg --batch --passphrase-fd 0 \
      --pinentry-mode loopback \
      --sign < /dev/null > /dev/null 2>&1 || true

- name: Sign repository
  env:
    GPG_PASSPHRASE: ${{ secrets.GPG_PASSPHRASE }}
  run: |
    ./scripts/debian-repo.sh sign ./repo stable main amd64
```

The `debian-repo.sh` script reads `$GPG_PASSPHRASE` for non-interactive signing.

---

## Key Rotation

### Schedule
- Rotate every **18 months** (6 months before expiration)
- Schedule a reminder for 30 days before rotation

### Rotation Procedure

1. **Generate new key** (with new expiration, keep same UID)
2. **Update secret** `GPG_PRIVATE_KEY` in Forgejo
3. **Update secret** `GPG_PASSPHRASE` in Forgejo
4. **Cross-sign** new key with old key (optional):
   ```bash
   gpg --default-key OLD_KEYID --sign-key NEW_KEYID
   ```
5. **Export new public key** to repo
6. **Re-sign all repo metadata**:
   ```bash
   ./scripts/debian-repo.sh sign ./repo stable main amd64
   ```
7. **Push updated** `world-office-archive-keyring.gpg` to repo
8. **Announce** key rotation in changelog

### Emergency Revocation

If the key is compromised:
1. **Revoke immediately** using the revocation certificate:
   ```bash
   gpg --import revoke.asc
   gpg --keyserver keys.openpgp.org --send-keys KEYID
   ```
2. **Generate new key pair**
3. **Update all secrets and public key**
4. **Notify users** — they must re-import `world-office-archive-keyring.gpg`

---

## Key Integrity Checks

Before each release:

```bash
# Verify the key is not expired
gpg --list-keys --with-colons deploy@world-office.dev | grep '^pub' | awk -F: '{print $7}'

# Verify we can sign without errors
echo "test" | gpg --clearsign > /dev/null 2>&1 && echo "Signing OK"
```

---

## Related Files

| File | Purpose |
|------|---------|
| `desktop/tauri-poc/scripts/debian-repo.sh` | APT repo management script |
| `server/.forgejo/workflows/release.yml` | CI release pipeline |
| `desktop/tauri-poc/public/world-office-archive-keyring.gpg` | Public key for distribution |
| `server/Cargo.toml` | Version source (used for release tagging) |
