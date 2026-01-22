# OnCalls MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with access to OnCalls scheduling data. Works with Claude Desktop, Claude Code, and any MCP-compatible client.

## Features

- **Schedule Management** - View on-call schedules, current assignments, and upcoming shifts
- **Member Information** - Access team member details and contact information
- **Request Handling** - View and manage shift change requests, coverage requests
- **Admin Tools** - Approve/deny requests, manage schedules (admin users only)
- **OAuth 2.0 Authentication** - Secure access via standard OAuth flow with PKCE

## Quick Start

### Claude Desktop (Recommended)

1. Open Claude Desktop
2. Go to **Settings** → **Connectors**
3. Click **Add Connector**
4. Enter URL: `https://mcp.oncalls.com/sse`
5. Click **Connect**
6. Log in with your OnCalls credentials when prompted

That's it! Claude will now have access to your OnCalls data.

### Claude Code CLI

**Option 1: Native OAuth (recommended)**
```bash
claude mcp add oncalls https://mcp.oncalls.com/sse
```
Claude Code will open a browser for authentication on first use.

**Option 2: Using mcp-remote bridge**
```bash
claude mcp add oncalls -- npx -y mcp-remote https://mcp.oncalls.com/sse
```

**Option 3: For headless/SSH environments**
```bash
# Using username/password authentication
claude mcp add oncalls -- npx -y mcp-remote "https://mcp.oncalls.com/sse?username=YOUR_USER&password=YOUR_PASS"
```

### Manual Configuration (claude_desktop_config.json)

For advanced users who prefer manual configuration:

```json
{
  "mcpServers": {
    "oncalls": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.oncalls.com/sse"]
    }
  }
}
```

## Available Tools

### For All Users

| Tool | Description |
|------|-------------|
| `get_current_schedule` | Get the current on-call schedule |
| `get_my_shifts` | View your upcoming shifts |
| `get_team_members` | List team members and contact info |
| `get_pending_requests` | View pending shift change requests |
| `submit_shift_change` | Request a shift change |
| `submit_coverage_request` | Request coverage for a shift |

### For Admin Users

| Tool | Description |
|------|-------------|
| `approve_request` | Approve a pending request |
| `deny_request` | Deny a pending request |
| `update_schedule` | Modify the on-call schedule |
| `manage_members` | Add/edit/remove team members |

## Authentication

The server supports multiple authentication methods:

### OAuth 2.0 (Recommended)

Used automatically by Claude Desktop and Claude Code. The OAuth flow:
1. Client discovers OAuth metadata via `/.well-known/oauth-protected-resource`
2. Registers dynamically via RFC 7591 DCR
3. Redirects to OnCalls login page
4. User authenticates and grants access
5. Tokens are issued and managed automatically

### Legacy Authentication

For programmatic access or testing:

**Query Parameters:**
```
https://mcp.oncalls.com/sse?username=USER&password=PASS
```

**HTTP Headers:**
```
X-OnCalls-Username: your-username
X-OnCalls-Password: your-password
```

**Bearer Token (base64):**
```
Authorization: Bearer base64(username:password)
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/mcp` | Streamable HTTP transport (Protocol 2025-11-25) |
| `/sse` | SSE transport (Protocol 2024-11-05) |
| `/message` | Message endpoint for SSE transport |
| `/health` | Health check |
| `/.well-known/oauth-protected-resource` | OAuth discovery |

## Self-Hosting

### Prerequisites

- Node.js 18+
- Access to an OnCalls v3 instance with OAuth enabled

### Environment Variables

```bash
# Required
ONCALLS_BASE_URL=https://your-oncalls-instance.com

# OAuth Configuration (for remote server)
MCP_SERVER_URL=https://your-mcp-server.com
MCP_OAUTH_CLIENT_ID=your-client-id
MCP_OAUTH_CLIENT_SECRET=your-client-secret
MCP_OAUTH_AUTHORIZE_URL=https://your-oncalls-instance.com/oauth/authorize
MCP_OAUTH_TOKEN_URL=https://your-oncalls-instance.com/oauth/token
```

### Running Locally (stdio mode)

```bash
npm install
npm run build

# Set credentials via environment
export ONCALLS_BASE_URL=https://your-oncalls-instance.com
export ONCALLS_USERNAME=your-username
export ONCALLS_PASSWORD=your-password

npm start
```

### Running as Remote Server

```bash
npm install
npm run build
npm run start:remote
```

The server will start on port 3001 (or `$PORT`).

### Docker

```bash
docker build -t mcp-server-oncalls .
docker run -p 3001:3001 \
  -e ONCALLS_BASE_URL=https://your-instance.com \
  -e MCP_SERVER_URL=https://your-mcp-server.com \
  mcp-server-oncalls
```

## OAuth Server Requirements

If self-hosting, your OnCalls instance must support:

1. **OAuth 2.0 Authorization Code flow with PKCE**
2. **Dynamic Client Registration (RFC 7591)** - Required for Claude Desktop/Code
3. **Public client support** (`token_endpoint_auth_method: "none"`)
4. **Authorization Server Metadata** at `/.well-known/oauth-authorization-server`

See [docs/OAUTH_IMPLEMENTATION_GUIDE.md](./docs/OAUTH_IMPLEMENTATION_GUIDE.md) for complete implementation details.

## Troubleshooting

### "Server disconnected" error

- Ensure you're using the latest version of Claude Desktop/Code
- Try removing and re-adding the server
- Check that your OnCalls credentials are valid

### OAuth flow shows blank page

Your OnCalls instance may be missing Dynamic Client Registration. See the [OAuth Implementation Guide](./docs/OAUTH_IMPLEMENTATION_GUIDE.md).

### "Missing sessionId" error

This typically means the transport negotiation failed. The server supports both Streamable HTTP and SSE transports - ensure your client is compatible.

### Connection works with mcp-remote but not native OAuth

This indicates an OAuth configuration issue on the authorization server. Check:
- `registration_endpoint` is present in OAuth metadata
- `token_endpoint_auth_methods_supported` includes `"none"`
- PKCE (S256) is supported

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Documentation

- [OAuth Implementation Guide](./docs/OAUTH_IMPLEMENTATION_GUIDE.md) - Comprehensive guide for implementing OAuth with MCP servers
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [Claude MCP Documentation](https://docs.claude.com/en/docs/claude-code/mcp)

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines before submitting PRs.
