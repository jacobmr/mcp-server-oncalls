# Complete Guide to Implementing OAuth for MCP Servers with Claude Desktop

> A comprehensive, battle-tested guide to implementing OAuth 2.0 authentication for Model Context Protocol (MCP) servers that work seamlessly with Claude Desktop's native UI.

**Author:** OnCalls Team
**Last Updated:** January 2026
**MCP Spec Version:** 2025-06-18

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Transport Layer Requirements](#transport-layer-requirements)
4. [OAuth Discovery Endpoints](#oauth-discovery-endpoints)
5. [Authorization Server Implementation](#authorization-server-implementation)
6. [Dynamic Client Registration (DCR)](#dynamic-client-registration-dcr)
7. [Token Endpoint Requirements](#token-endpoint-requirements)
8. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
9. [Testing Checklist](#testing-checklist)
10. [Reference Implementation](#reference-implementation)

---

## Overview

This guide documents the complete requirements for implementing an OAuth-authenticated MCP server that works with Claude Desktop's native "Add Connector" UI. The official MCP documentation covers the basics but omits critical implementation details that we discovered through extensive testing.

### What This Guide Covers

- Remote MCP server deployment (not local stdio)
- OAuth 2.0 Authorization Code flow with PKCE
- Claude Desktop native UI integration (not `mcp-remote` bridge)
- Dynamic Client Registration (RFC 7591)

### Key Insight

**Claude Desktop routes OAuth through `claude.ai`'s backend.** When you add a remote MCP server via the UI, Claude.ai acts as the OAuth client on your behalf. This has significant implications:

1. Claude.ai must be able to register itself dynamically with your authorization server
2. Claude.ai is a "public client" and cannot use pre-shared secrets
3. Your authorization server must support PKCE for security

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Desktop │────▶│    claude.ai    │────▶│  Your MCP Server│
│     (User)      │     │  (OAuth Client) │     │  (Resource)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                        │
                                │                        │
                                ▼                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │  Your OAuth/    │◀────│ Protected       │
                        │  Auth Server    │     │ Resource Meta   │
                        └─────────────────┘     └─────────────────┘
```

### Components

1. **MCP Server** - Your server implementing MCP protocol (tools, resources, prompts)
2. **Authorization Server** - OAuth 2.0 server (can be same or separate from MCP server)
3. **Claude.ai Backend** - Acts as OAuth client, handles token storage
4. **Claude Desktop** - User interface, communicates with claude.ai

---

## Transport Layer Requirements

Your MCP server must support HTTP-based transports. Claude.ai uses the newer **Streamable HTTP** transport by default.

### Required: Streamable HTTP Transport (Protocol 2025-11-25)

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Single endpoint handles GET, POST, DELETE
app.all('/mcp', authMiddleware, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
    // New session initialization
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        activeTransports.set(newSessionId, transport);
      },
    });

    const mcpServer = createMcpServer(authenticatedClient);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else if (sessionId && activeTransports.has(sessionId)) {
    // Existing session
    const transport = activeTransports.get(sessionId);
    await transport.handleRequest(req, res, req.body);
  }
});
```

### Recommended: Also Support SSE Transport (Protocol 2024-11-05)

For backwards compatibility with `mcp-remote` and other clients:

```typescript
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// SSE endpoint for establishing connection
app.get('/sse', authMiddleware, async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  activeTransports.set(transport.sessionId, transport);

  const mcpServer = createMcpServer(authenticatedClient);
  await mcpServer.connect(transport);
});

// Message endpoint for SSE transport
app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = activeTransports.get(sessionId);
  await transport.handlePostMessage(req, res, req.body);
});
```

### Critical: Support Both on `/sse` Endpoint

Some clients (like `mcp-remote`) use "http-first" strategy - they POST to `/sse` expecting Streamable HTTP, and fall back to SSE GET if that fails. Your `/sse` endpoint should handle both:

```typescript
app.post('/sse', authMiddleware, async (req, res) => {
  const sessionId = req.query.sessionId;

  if (!sessionId) {
    // No sessionId in query = Streamable HTTP request
    // Handle as Streamable HTTP initialization
    if (isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({...});
      // ... create session
      await transport.handleRequest(req, res, req.body);
    }
  } else {
    // sessionId in query = SSE transport message
    const transport = activeTransports.get(sessionId);
    await transport.handlePostMessage(req, res, req.body);
  }
});
```

---

## OAuth Discovery Endpoints

### 1. Protected Resource Metadata (RFC 9728)

**Endpoint:** `/.well-known/oauth-protected-resource`

This is the entry point for OAuth discovery. When your MCP server returns a 401, the `WWW-Authenticate` header points to this endpoint.

```typescript
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: 'https://your-mcp-server.com',
    authorization_servers: ['https://your-auth-server.com'],  // Array of issuer URLs
    scopes_supported: ['read:data', 'write:data'],
    bearer_methods_supported: ['header'],
  });
});
```

**Critical Details:**
- `authorization_servers` must be an **array of strings** (issuer URLs), not objects
- The issuer URL should NOT include paths - just the base URL
- Claude.ai will fetch `{issuer}/.well-known/oauth-authorization-server`

### 2. 401 Response with WWW-Authenticate Header

When an unauthenticated request hits your MCP endpoint:

```typescript
app.get('/sse', (req, res, next) => {
  if (!isAuthenticated(req)) {
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="https://your-mcp-server.com/.well-known/oauth-protected-resource"`
    );
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Authentication required'
    });
    return;
  }
  next();
});
```

### 3. Handle Path Variations

Some clients append the resource path to the metadata URL. Handle these variations:

```typescript
// Primary endpoint
app.get('/.well-known/oauth-protected-resource', protectedResourceHandler);

// Some clients append /sse or /mcp
app.get('/.well-known/oauth-protected-resource/sse', protectedResourceHandler);
app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceHandler);
```

---

## Authorization Server Implementation

### Authorization Server Metadata (RFC 8414)

**Endpoint:** `/.well-known/oauth-authorization-server`

```typescript
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: 'https://your-auth-server.com',
    authorization_endpoint: 'https://your-auth-server.com/oauth/authorize',
    token_endpoint: 'https://your-auth-server.com/oauth/token',
    registration_endpoint: 'https://your-auth-server.com/oauth/register',  // REQUIRED
    revocation_endpoint: 'https://your-auth-server.com/oauth/revoke',
    scopes_supported: ['read:data', 'write:data'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],  // MUST include 'none'
    code_challenge_methods_supported: ['S256'],  // PKCE required
  });
});
```

**Critical Fields:**

| Field | Requirement | Why |
|-------|-------------|-----|
| `registration_endpoint` | **REQUIRED** | Claude.ai uses DCR to register itself |
| `token_endpoint_auth_methods_supported` | Must include `'none'` | Claude.ai is a public client |
| `code_challenge_methods_supported` | Must include `'S256'` | PKCE is required for public clients |

---

## Dynamic Client Registration (DCR)

**This is the most commonly missed requirement.** Claude.ai mandates DCR support (RFC 7591).

### Registration Endpoint

**Endpoint:** `POST /oauth/register`

```typescript
app.post('/oauth/register', express.json(), async (req, res) => {
  const {
    redirect_uris,
    client_name,
    token_endpoint_auth_method = 'none',
    grant_types = ['authorization_code', 'refresh_token'],
    response_types = ['code'],
  } = req.body;

  // Validate redirect_uris
  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({
      error: 'invalid_redirect_uri',
      error_description: 'redirect_uris is required'
    });
  }

  // Generate client credentials
  const clientId = crypto.randomUUID();

  // Store the client (database, in-memory, etc.)
  await storeClient({
    client_id: clientId,
    client_name,
    redirect_uris,
    token_endpoint_auth_method,
    grant_types,
    response_types,
    created_at: new Date(),
  });

  // Return registration response
  res.status(201).json({
    client_id: clientId,
    client_name,
    redirect_uris,
    token_endpoint_auth_method,
    grant_types,
    response_types,
  });
});
```

### What Claude.ai Sends

When Claude.ai registers, it sends something like:

```json
{
  "redirect_uris": ["https://claude.ai/oauth/callback"],
  "client_name": "Claude",
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

### Client Storage Considerations

- DCR creates a new client record for each registration
- Consider implementing client deduplication by `redirect_uris` to prevent unbounded growth
- Clients registered via DCR should be marked as "public" (no secret validation)

---

## Token Endpoint Requirements

### Support Public Clients (No Secret)

Claude.ai registers with `token_endpoint_auth_method: 'none'`. Your token endpoint must accept requests without `client_secret` when:

1. The client was registered as a public client, AND
2. A valid PKCE `code_verifier` is provided

```typescript
app.post('/oauth/token', async (req, res) => {
  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = req.body;

  const client = await getClient(client_id);

  if (client.token_endpoint_auth_method === 'none') {
    // Public client - validate PKCE instead of secret
    if (!code_verifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'code_verifier required for public clients'
      });
    }
    // Validate code_verifier against stored code_challenge
    const authCode = await getAuthorizationCode(code);
    if (!validatePKCE(code_verifier, authCode.code_challenge, authCode.code_challenge_method)) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid code_verifier'
      });
    }
  } else {
    // Confidential client - validate secret
    if (!client.verifySecret(client_secret)) {
      return res.status(401).json({ error: 'invalid_client' });
    }
  }

  // Issue tokens...
});
```

### PKCE Validation

```typescript
function validatePKCE(verifier: string, challenge: string, method: string): boolean {
  if (method === 'S256') {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    const computed = base64url(hash);
    return computed === challenge;
  } else if (method === 'plain') {
    return verifier === challenge;
  }
  return false;
}
```

---

## Common Pitfalls and Solutions

### Pitfall 1: Missing DCR Support

**Symptom:** OAuth flow starts, browser opens, then immediately shows blank page (`about:blank`)

**Solution:** Implement `/oauth/register` endpoint and add `registration_endpoint` to authorization server metadata.

---

### Pitfall 2: Token Endpoint Requires Secret

**Symptom:** OAuth flow completes login, but fails silently after redirect

**Solution:** Add `'none'` to `token_endpoint_auth_methods_supported` and update token endpoint to accept public clients with PKCE.

---

### Pitfall 3: Wrong Transport Strategy

**Symptom:** `mcp-remote` shows "stream is not readable" error

**Solution:** Support Streamable HTTP transport on your SSE endpoint. When clients POST without `sessionId`, treat it as Streamable HTTP initialization.

---

### Pitfall 4: Session ID Mismatch

**Symptom:** "Session not found" or "Missing sessionId" errors

**Solution:**
- For SSE transport: use the transport's internal `sessionId` property as the map key
- For Streamable HTTP: use `mcp-session-id` header for session lookup

```typescript
// SSE - use transport's sessionId
const transport = new SSEServerTransport('/message', res);
activeTransports.set(transport.sessionId, transport);  // Not your own ID

// Streamable HTTP - use header
const sessionId = req.headers['mcp-session-id'];
```

---

### Pitfall 5: Authorization Servers as Objects

**Symptom:** OAuth discovery fails silently

**Solution:** `authorization_servers` in protected resource metadata must be an array of **strings** (issuer URLs), not objects:

```javascript
// WRONG
authorization_servers: [{ issuer: 'https://auth.example.com', ... }]

// CORRECT
authorization_servers: ['https://auth.example.com']
```

---

### Pitfall 6: Localhost Redirect URIs

**Symptom:** OAuth works for your test client but not Claude Desktop

**Solution:** Claude Desktop uses `mcp-remote` which creates localhost callbacks with dynamic ports. Your authorization server should allow any `localhost` or `127.0.0.1` redirect URI for system/MCP clients:

```typescript
function isRedirectUriValid(uri: string, client: Client): boolean {
  // Exact match
  if (client.redirect_uris.includes(uri)) return true;

  // For MCP clients, allow any localhost
  if (client.is_mcp_client) {
    const parsed = new URL(uri);
    if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return true;
    }
  }

  return false;
}
```

---

## Testing Checklist

Before deploying, verify each of these:

### Discovery Endpoints

- [ ] `GET /.well-known/oauth-protected-resource` returns valid JSON
- [ ] `GET /.well-known/oauth-authorization-server` returns valid JSON with `registration_endpoint`
- [ ] 401 response includes `WWW-Authenticate` header with `resource_metadata` URL

### Dynamic Client Registration

- [ ] `POST /oauth/register` accepts registration without authentication
- [ ] Returns `client_id` in response
- [ ] Stores client for later use

### Authorization Flow

- [ ] `/oauth/authorize` accepts requests with PKCE (`code_challenge`, `code_challenge_method`)
- [ ] Shows login/consent UI
- [ ] Redirects to `redirect_uri` with `code` and `state`

### Token Exchange

- [ ] `/oauth/token` accepts requests without `client_secret` for public clients
- [ ] Validates `code_verifier` against stored `code_challenge`
- [ ] Returns `access_token` and `refresh_token`

### MCP Transport

- [ ] GET `/sse` establishes SSE connection (with auth)
- [ ] POST `/sse` handles both Streamable HTTP and SSE messages
- [ ] POST `/mcp` handles Streamable HTTP (if separate endpoint)
- [ ] Session management works correctly

### End-to-End

- [ ] Works with `mcp-remote` bridge
- [ ] Works with Claude Desktop native UI (Settings > Connectors)

---

## Reference Implementation

### MCP Server (TypeScript/Express)

See the complete implementation at: [mcp-server-oncalls](https://github.com/jacobmr/mcp-server-oncalls)

Key files:
- `src/remote-server.ts` - Full remote server with OAuth support
- Transport handling for both SSE and Streamable HTTP
- OAuth discovery endpoints
- Authentication middleware

### Authorization Server (Python/Flask)

Key endpoints needed:
- `/.well-known/oauth-authorization-server` - Metadata
- `/oauth/register` - Dynamic Client Registration
- `/oauth/authorize` - Authorization endpoint
- `/oauth/token` - Token endpoint (supports public clients)
- `/oauth/revoke` - Token revocation

### Database Schema

```sql
-- OAuth Clients (including DCR-registered)
CREATE TABLE oauth_clients (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(64) UNIQUE NOT NULL,
  client_secret_hash VARCHAR(255),  -- NULL for public clients
  client_name VARCHAR(255) NOT NULL,
  redirect_uris TEXT NOT NULL,  -- JSON array
  token_endpoint_auth_method VARCHAR(20) DEFAULT 'none',
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Authorization Codes (with PKCE)
CREATE TABLE oauth_authorization_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  user_id INTEGER NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope VARCHAR(500),
  code_challenge VARCHAR(128),  -- PKCE
  code_challenge_method VARCHAR(10),  -- 'S256' or 'plain'
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP
);

-- Tokens
CREATE TABLE oauth_tokens (
  id SERIAL PRIMARY KEY,
  access_token VARCHAR(500) NOT NULL,
  refresh_token VARCHAR(128),
  client_id VARCHAR(64) NOT NULL,
  user_id INTEGER NOT NULL,
  scope VARCHAR(500),
  access_token_expires_at TIMESTAMP NOT NULL,
  refresh_token_expires_at TIMESTAMP,
  revoked_at TIMESTAMP
);
```

---

## Summary

Implementing OAuth for MCP servers with Claude Desktop requires:

1. **Transport Layer**
   - Support Streamable HTTP (required)
   - Support SSE (recommended for compatibility)
   - Handle "http-first" strategy on SSE endpoint

2. **OAuth Discovery**
   - Protected Resource Metadata at `/.well-known/oauth-protected-resource`
   - Authorization Server Metadata at `/.well-known/oauth-authorization-server`
   - Proper 401 response with `WWW-Authenticate` header

3. **Authorization Server**
   - Dynamic Client Registration endpoint (`/oauth/register`)
   - Support for public clients (`token_endpoint_auth_method: 'none'`)
   - PKCE support (S256)
   - Flexible localhost redirect URI handling

4. **Token Endpoint**
   - Accept requests without `client_secret` for public clients
   - Validate PKCE `code_verifier` instead

Following this guide will ensure your MCP server works seamlessly with Claude Desktop's native connector UI.

---

## Resources

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [RFC 7591 - Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 8414 - Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 9728 - Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [Claude Help Center - Remote MCP Servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
- [Aaron Parecki - OAuth in MCP](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol)
