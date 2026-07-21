# World Office SSO Configuration Guide

**Version:** 1.0
**Date:** 2026-07-21
**Applies to:** identity-service (SAML 2.0, OpenID Connect, LDAP)

---

## Overview

World Office supports three enterprise single sign-on (SSO) protocols:

| Protocol | Type | Use Case |
|----------|------|----------|
| **SAML 2.0** | Federated IdP-initiated | Enterprise IdPs (Okta, Azure AD, ADFS, Keycloak) |
| **OpenID Connect** | Federated SP-initiated | Generic OIDC providers (Google, Auth0, Dex, Keycloak) |
| **LDAP** | Direct binding | On-premises directory services (OpenLDAP, Active Directory) |

All three integrate with the existing JWT token flow — upon successful SSO authentication, the identity-service issues a signed JWT identical to local login.

---

## Architecture

```
User Browser                      identity-service                  IdP / LDAP
     │                                   │                              │
     │── /saml/login ────────────────────┤                              │
     │                                   │── SAML AuthnRequest ────────→│
     │                                   │←─ SAML Response ────────────│
     │←─ JWT token ──────────────────────┤                              │
     │                                                                  │
     │── /oidc/login?provider=google ────┤                              │
     │                                   │── OIDC Auth Request ────────→│
     │                                   │←─ Auth Code Callback ────────│
     │                                   │── Token Exchange + UserInfo →│
     │←─ JWT token ──────────────────────┤                              │
     │                                                                  │
     │── POST /ldap/login ───────────────┤                              │
     │                                   │── LDAP Bind (user DN) ──────→│
     │                                   │── LDAP Search ──────────────→│
     │                                   │←─ User Attributes ───────────│
     │←─ JWT token ──────────────────────┤                              │
```

---

## 1. SAML 2.0 Configuration

### Prerequisites

- A SAML 2.0 Identity Provider (Okta, Azure AD, ADFS, Keycloak, etc.)
- IdP metadata URL (or SSO URL + certificate)
- SP entity ID and ACS URL (provided by identity-service)

### Configuration Methods

#### Method A: JSON Config File (Recommended)

**File:** `config/sso-providers.json`

```json
{
  "saml": {
    "entity_id": "https://sso.world-office.app/saml/metadata",
    "acs_url": "https://sso.world-office.app/saml/acs",
    "idp_metadata_url": "https://idp.example.com/metadata",
    "idp_sso_url": "https://idp.example.com/sso",
    "idp_cert": "-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----",
    "sp_private_key": "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----",
    "sp_cert": "-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"
  }
}
```

**Environment variable:** `SSO_CONFIG_PATH=/etc/world-office/sso-providers.json`

#### Method B: Environment Variables

```
SAML_ENTITY_ID=https://sso.world-office.app/saml/metadata
SAML_ACS_URL=https://sso.world-office.app/saml/acs
SAML_IDP_METADATA_URL=https://idp.example.com/metadata
SAML_IDP_SSO_URL=https://idp.example.com/sso
SAML_IDP_CERT=<base64-or-pem-cert>
SAML_SP_PRIVATE_KEY=<base64-or-pem-key>
SAML_SP_CERT=<base64-or-pem-cert>
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/saml/metadata` | GET | SP metadata XML (register with IdP) |
| `/saml/login` | GET | Initiate SAML SSO (redirects to IdP) |
| `/saml/acs` | POST | Assertion Consumer Service (IdP POSTs here) |

### IdP Registration Steps

1. **Get SP metadata:** `GET https://identity-service:8001/saml/metadata`
2. **Register** the metadata URL with your IdP as a SAML 2.0 application
3. **Set ACS URL** on the IdP to `https://identity-service:8001/saml/acs`
4. **Set Entity ID** on the IdP to `https://identity-service:8001/saml/metadata`

### User Provisioning

SAML auto-provisions users on first login:
- Subject NameID → email → username
- `sso_provider` set to `"saml"`, `external_id` set to NameID value
- Users matched by `external_id` first, then by `email`
- JWT issued with standard `sub`, `username`, `role` claims

---

## 2. OpenID Connect Configuration

### Prerequisites

- An OIDC provider (Google, Auth0, Keycloak, Dex, Azure AD, etc.)
- Client ID and Client Secret from the provider
- Registered redirect URI

### Configuration

#### JSON Config File

```json
{
  "oidc_providers": [
    {
      "id": "google",
      "name": "Google Workspace",
      "issuer_url": "https://accounts.google.com",
      "client_id": "xxxxxxxxxxxx-xxxxxxxxx.apps.googleusercontent.com",
      "client_secret": "GOCSPX-xxxxxxxxxxxx",
      "redirect_url": "https://sso.world-office.app/oidc/callback",
      "scopes": ["openid", "email", "profile"],
      "enabled": true
    },
    {
      "id": "keycloak",
      "name": "Keycloak",
      "issuer_url": "https://keycloak.example.com/realms/world-office",
      "client_id": "world-office",
      "client_secret": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "redirect_url": "https://sso.world-office.app/oidc/callback",
      "scopes": ["openid", "email", "profile", "roles"],
      "enabled": true
    }
  ]
}
```

#### Environment Variable

```json
# Single JSON string — must be valid JSON array
OIDC_PROVIDERS='[{"id":"google","name":"Google Workspace","issuer_url":"https://accounts.google.com","client_id":"xxx","client_secret":"xxx","redirect_url":"https://sso.world-office.app/oidc/callback","scopes":["openid","email","profile"],"enabled":true}]'
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oidc/login?provider={id}` | GET | Initiate OIDC SSO for a specific provider |
| `/oidc/callback` | GET | OIDC callback (IdP redirects here) |

### Provider Registration Steps

1. **Register a new application** in your OIDC provider's console
2. **Set redirect URI** to `https://identity-service:8001/oidc/callback`
3. **Copy Client ID and Client Secret** into the config
4. **Verify issuer URL** matches the provider's `.well-known/openid-configuration`

### User Provisioning

OIDC auto-provisions users on first login:
- `sub` claim → `external_id` (namespaced as `{provider_id}:{sub}`)
- `email` or `preferred_username` → username
- Userinfo endpoint called with access token for profile data
- Users matched by `external_id` first, then by `email`

---

## 3. LDAP Authentication

### Prerequisites

- LDAP server (OpenLDAP, Active Directory, FreeIPA, etc.)
- Bind DN and password for service account (read-only)
- Base DN for user search

### Configuration

#### JSON Config File

```json
{
  "ldap": {
    "url": "ldaps://ldap.example.com:636",
    "bind_dn": "cn=admin,dc=example,dc=com",
    "bind_password": "s3cr3t",
    "base_dn": "dc=example,dc=com",
    "user_filter": "(uid={username})",
    "group_filter": "(member={dn})",
    "mapping": {
      "displayName": "displayName",
      "mail": "mail",
      "uid": "uid"
    }
  }
}
```

#### Environment Variables

```
LDAP_URL=ldaps://ldap.example.com:636
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_BIND_PASSWORD=s3cr3t
LDAP_BASE_DN=dc=example,dc=com
LDAP_USER_FILTER=(uid={username})
LDAP_GROUP_FILTER=(member={dn})
```

**Placeholder substitution:** `{username}` is replaced with the login username, `{dn}` with the user's distinguished name.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /ldap/login` | POST | Authenticate via LDAP bind (JSON body: `{"username":"...","password":"..."}`) |
| `POST /ldap/sync` | POST | Sync all LDAP users to local database (admin-only) |

### LDAP Login Flow

1. Service account binds to LDAP
2. Searches for `{username}` using `user_filter`
3. Extracts user DN from search result
4. Second bind as the user (with provided password)
5. Retrieves attributes: `mail`, `displayName`, `cn`
6. Creates or updates local user record
7. Issues JWT

### LDAP Sync

`POST /ldap/sync` synchronizes all LDAP users matching the `user_filter` (with `{username}` replaced by `*`):

- Creates new local users for LDAP entries not yet in database
- Updates existing users' email if changed
- Returns JSON: `{"provider":"ldap","synced_users":N,"created_users":N,"status":"completed"}`
- Does NOT delete users removed from LDAP (safe operation)

### Active Directory Differences

For Active Directory, adjust:

```json
{
  "url": "ldaps://ad.example.com:636",
  "bind_dn": "WORLD\\sso-reader",
  "base_dn": "DC=ad,DC=example,DC=com",
  "user_filter": "(sAMAccountName={username})",
  "group_filter": "(member={dn})"
}
```

---

## 4. Viewing SSO Status

### API Endpoint

```
GET /sso/providers
```

Returns status of all configured providers:

```json
[
  {
    "provider": "saml",
    "configured": true,
    "enabled": true,
    "details": {
      "entity_id": "https://sso.world-office.app/saml/metadata",
      "acs_url": "https://sso.world-office.app/saml/acs"
    }
  },
  {
    "provider": "oidc:google",
    "configured": true,
    "enabled": true,
    "details": {
      "name": "Google Workspace",
      "issuer_url": "https://accounts.google.com",
      "scopes": ["openid", "email", "profile"]
    }
  },
  {
    "provider": "ldap",
    "configured": true,
    "enabled": true,
    "details": {
      "url": "ldaps://ldap.example.com:636",
      "base_dn": "dc=example,dc=com"
    }
  }
]
```

### Admin Panel UI

Navigate to **SSO Providers** in the admin panel (`/admin/sso`). The page displays cards for each configured provider with status badges, configuration details, and enable/disable state.

---

## 5. Feature Gates

SSO features are compile-time gated. The identity-service `Cargo.toml` defines:

```toml
[features]
default = ["saml", "oidc", "ldap"]
saml = ["samael"]
oidc = ["openidconnect"]
ldap = ["ldap3"]
```

All three are enabled by default. Disable individual providers:

```bash
cargo build --no-default-features --features oidc,ldap   # disable SAML
cargo build --no-default-features --features saml        # only SAML
```

---

## 6. Security Considerations

- **TLS:** Always use `ldaps://` for LDAP (never `ldap://` in production)
- **Certificates:** SP certificates for SAML should be signed by a trusted CA
- **Secrets:** Store `client_secret`, `bind_password`, and private keys in a secrets manager
- **JWT secret:** Set `JWT_SECRET` to a strong random value (not the dev default)
- **OIDC state:** State parameter is validated server-side with 10-minute expiry
- **User mapping:** SSO-provided `email` is trusted — configure the IdP to assert verified emails
- **Rate limiting:** LDAP bind failures can lock accounts — consider adding rate limits at the api-gateway layer

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/saml/metadata` returns 404 | SAML feature not compiled | Build with `--features saml` |
| `SAMLResponse` invalid | Clock skew > 5 minutes | Sync server time with NTP |
| OIDC callback returns 401 | State mismatch or expired | Retry login (state expires in 10 min) |
| LDAP bind fails | Wrong DN or password | Verify `bind_dn` and `bind_password` |
| LDAP search returns empty | Wrong `user_filter` or `base_dn` | Test filter with `ldapsearch` directly |
| Admin panel shows "Loading..." | identity-service unreachable | Check service health at `/health` |
| Users not created on SSO | DB file path wrong | Set `USERS_DB_PATH` to persistent location |
| Feature not implemented (501) | Feature flag disabled | Enable feature in `Cargo.toml` and rebuild |

---

## 8. Example: Okta SAML Integration

1. In Okta Admin Console: **Applications → Add Application → Create New App**
2. Platform: **Web**, Sign-on method: **SAML 2.0**
3. **Single sign-on URL:** `https://identity-service:8001/saml/acs`
4. **Audience URI:** `https://identity-service:8001/saml/metadata`
5. **Name ID format:** `EmailAddress`
6. **Attribute statements:** `email → user.email`, `firstName → user.firstName`
7. Assign users/groups to the application
8. Copy **Identity Provider metadata** URL into `sso-providers.json` → `idp_metadata_url`

---

## 9. Example: Keycloak OIDC Integration

1. In Keycloak Admin Console: **Clients → Create**
2. **Client ID:** `world-office`
3. **Client authentication:** ON (confidential)
4. **Valid redirect URIs:** `https://identity-service:8001/oidc/callback`
5. **Standard flow:** ON
6. Save, then copy **Client Secret**
7. Configure in `sso-providers.json` → `oidc_providers[]`
8. `issuer_url` = `https://keycloak.example.com/realms/{your-realm}`
