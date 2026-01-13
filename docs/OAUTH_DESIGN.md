# OAuth 2.0 Implementation Design

## Overview

This document outlines the OAuth 2.0 implementation required for Anthropic MCP Directory submission.

**Current State:** Username/password via HTTP headers
**Target State:** OAuth 2.0 Authorization Code flow

---

## OAuth 2.0 Flow Diagram

```
┌──────────────┐     ┌───────────────────┐     ┌─────────────────┐
│   Claude     │     │  MCP Server       │     │  OnCalls API    │
│   (Client)   │     │  (mcp.oncalls.com)│     │  (v3.oncalls.com)│
└──────┬───────┘     └────────┬──────────┘     └────────┬────────┘
       │                      │                         │
       │ 1. Connect to MCP    │                         │
       │─────────────────────>│                         │
       │                      │                         │
       │ 2. Return auth URL   │                         │
       │<─────────────────────│                         │
       │                      │                         │
       │ 3. User opens auth URL in browser              │
       │────────────────────────────────────────────────>
       │                      │                         │
       │                      │  4. User logs in,       │
       │                      │     approves access     │
       │                      │                         │
       │ 5. Redirect with code│                         │
       │<────────────────────────────────────────────────
       │                      │                         │
       │ 6. Provide code to MCP                         │
       │─────────────────────>│                         │
       │                      │                         │
       │                      │ 7. Exchange code        │
       │                      │    for tokens           │
       │                      │────────────────────────>│
       │                      │                         │
       │                      │ 8. Return access +      │
       │                      │    refresh tokens       │
       │                      │<────────────────────────│
       │                      │                         │
       │ 9. MCP ready         │                         │
       │<─────────────────────│                         │
       │                      │                         │
       │ 10. Tool calls work  │ 11. API calls with     │
       │─────────────────────>│     bearer token       │
       │                      │────────────────────────>│
```

---

## Part 1: OnCalls Backend Changes

### New Endpoints Required

#### 1. `GET /oauth/authorize`
Authorization page where users log in and approve access.

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | MCP server's client ID |
| `redirect_uri` | Yes | Where to redirect after auth |
| `response_type` | Yes | Must be `code` |
| `scope` | No | Space-separated scopes |
| `state` | Yes | CSRF protection token |

**Behavior:**
1. Show login form if user not logged in
2. Show approval screen with requested scopes
3. On approval, redirect to `redirect_uri` with `code` and `state`
4. On denial, redirect with `error=access_denied`

**Example Request:**
```
GET https://v3.oncalls.com/oauth/authorize?
  client_id=mcp-server-oncalls&
  redirect_uri=https://mcp.oncalls.com/oauth/callback&
  response_type=code&
  scope=read:schedule read:members&
  state=random-csrf-token
```

**Success Redirect:**
```
https://mcp.oncalls.com/oauth/callback?
  code=AUTH_CODE_HERE&
  state=random-csrf-token
```

#### 2. `POST /oauth/token`
Token exchange and refresh endpoint.

**For Authorization Code Exchange:**
```json
{
  "grant_type": "authorization_code",
  "code": "AUTH_CODE_HERE",
  "redirect_uri": "https://mcp.oncalls.com/oauth/callback",
  "client_id": "mcp-server-oncalls",
  "client_secret": "CLIENT_SECRET_HERE"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJ...",
  "scope": "read:schedule read:members"
}
```

**For Token Refresh:**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "REFRESH_TOKEN_HERE",
  "client_id": "mcp-server-oncalls",
  "client_secret": "CLIENT_SECRET_HERE"
}
```

#### 3. `GET /oauth/userinfo` (Optional but recommended)
Returns user info for the authenticated token.

**Response:**
```json
{
  "sub": "123",
  "name": "Lee Stetzer",
  "email": "stetzer@example.com",
  "group_id": 46,
  "is_admin": true
}
```

### Database Changes

New table: `oauth_clients`
```sql
CREATE TABLE oauth_clients (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

New table: `oauth_authorization_codes`
```sql
CREATE TABLE oauth_authorization_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Scopes

| Scope | Description |
|-------|-------------|
| `read:schedule` | View on-call schedules |
| `read:members` | View group member info |
| `read:requests` | View shift requests |
| `admin:requests` | Manage pending requests (admin) |
| `admin:members` | Manage group members (admin) |

---

## Part 2: MCP Server Changes

### New Endpoints

#### `GET /oauth/callback`
Receives the authorization code from OnCalls.

```typescript
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/auth-error?error=${error}`);
  }

  // Verify state matches what we sent
  if (!verifyState(state)) {
    return res.status(400).send('Invalid state');
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code);

  // Store tokens (in session or return to client)
  // Redirect to success page or return tokens
});
```

#### `GET /oauth/start`
Initiates OAuth flow, returns auth URL.

```typescript
app.get('/oauth/start', (req, res) => {
  const state = generateRandomState();
  storeState(state); // For CSRF verification

  const authUrl = buildAuthUrl({
    clientId: process.env.OAUTH_CLIENT_ID,
    redirectUri: `${process.env.SERVER_URL}/oauth/callback`,
    scope: 'read:schedule read:members read:requests',
    state
  });

  res.json({ authUrl, state });
});
```

### Modified OncallsClient

```typescript
export class OncallsClient {
  // NEW: Create client from OAuth tokens
  static fromOAuthTokens(
    baseUrl: string,
    accessToken: string,
    refreshToken: string,
    userInfo: UserInfo
  ): OncallsClient {
    const client = new OncallsClient({ baseUrl });
    client.tokenManager.setTokens(accessToken, refreshToken);
    client._userContext = userInfo;
    return client;
  }

  // Existing methods remain, but authenticate() becomes private
  // Public auth goes through OAuth
}
```

### Environment Variables

```bash
# OAuth Configuration
OAUTH_CLIENT_ID=mcp-server-oncalls
OAUTH_CLIENT_SECRET=your-secret-here
OAUTH_AUTHORIZE_URL=https://v3.oncalls.com/oauth/authorize
OAUTH_TOKEN_URL=https://v3.oncalls.com/oauth/token
SERVER_URL=https://mcp.oncalls.com
```

### Auth Middleware Update

```typescript
// OLD: Header-based auth
const authMiddleware = async (req, res, next) => {
  const username = req.headers['x-oncalls-username'];
  const password = req.headers['x-oncalls-password'];
  // ... create client with username/password
};

// NEW: OAuth token-based auth
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing OAuth token' });
  }

  const accessToken = authHeader.slice(7);

  // Validate token and get user info
  const userInfo = await validateToken(accessToken);
  if (!userInfo) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Create client from OAuth tokens
  req.oncallsClient = OncallsClient.fromOAuthTokens(
    process.env.ONCALLS_BASE_URL,
    accessToken,
    userInfo.refreshToken,
    userInfo
  );

  next();
};
```

---

## Part 3: Implementation Plan

### Phase 1: OnCalls Backend (1 day)
1. [ ] Create `oauth_clients` table
2. [ ] Create `oauth_authorization_codes` table
3. [ ] Implement `GET /oauth/authorize` endpoint
4. [ ] Implement `POST /oauth/token` endpoint
5. [ ] Create MCP server client credentials
6. [ ] Test OAuth flow manually

### Phase 2: MCP Server Updates (0.5 day)
1. [ ] Add `/oauth/start` endpoint
2. [ ] Add `/oauth/callback` endpoint
3. [ ] Update `OncallsClient` for OAuth tokens
4. [ ] Update auth middleware
5. [ ] Add environment variables
6. [ ] Remove old header-based auth

### Phase 3: Testing & Deployment (0.5 day)
1. [ ] Test full OAuth flow end-to-end
2. [ ] Test token refresh
3. [ ] Test error cases
4. [ ] Deploy to Railway
5. [ ] Update documentation

---

## Security Considerations

1. **State Parameter**: Always use random state for CSRF protection
2. **PKCE** (Optional): Consider adding PKCE for extra security
3. **Token Storage**: Store tokens securely, never in localStorage
4. **Token Expiry**: Access tokens expire in 1 hour, refresh as needed
5. **Scope Validation**: Validate scopes on each API call
6. **Redirect URI Validation**: Strictly validate redirect URIs

---

## Testing Checklist

- [ ] User can initiate OAuth flow
- [ ] Authorization page shows correct scopes
- [ ] Successful authorization redirects with code
- [ ] Code exchange returns valid tokens
- [ ] Access token works for API calls
- [ ] Token refresh works when expired
- [ ] Invalid tokens return 401
- [ ] Denied authorization handles gracefully
- [ ] CSRF protection (state) works

---

## Questions to Resolve

1. **Token storage on MCP side**: Session-based? Database? Per-request?
2. **Multiple groups**: How to handle users in multiple OnCalls groups?
3. **Token revocation**: Do we need a revocation endpoint?
4. **Client credentials**: Who manages the MCP server client ID/secret?

---

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [MCP Authentication Spec](https://modelcontextprotocol.io/docs/concepts/authentication)
- [Anthropic MCP Directory Requirements](https://docs.google.com/forms/d/e/1FAIpQLSeafJF2NDI7oYx1r8o0ycivCSVLNq92Mpc1FPxMKSw1CzDkqA/viewform)
