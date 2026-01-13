# MCP Server OnCalls - Session State & Roadmap

**Last Updated:** 2026-01-12
**Session Summary:** Built and deployed MCP server for OnCalls physician scheduling system

---

## 🎯 Project Goal

Create an MCP (Model Context Protocol) server that allows Claude to interact with the OnCalls physician on-call scheduling system. Submit to Anthropic's MCP Registry.

---

## ✅ COMPLETED

### 1. Core MCP Server (Local - stdio)

- **Location:** `/Users/jmr/dev/mcp-server-oncalls/`
- **Entry point:** `src/index.ts` → `dist/index.js`
- **Transport:** stdio (for Claude Desktop local use)
- **Published to npm:** https://www.npmjs.com/package/mcp-server-oncalls

### 2. Remote MCP Server (SSE)

- **Entry point:** `src/remote.ts` → `dist/remote.js`
- **Transport:** HTTP/SSE
- **Deployed to Railway:** https://mcp.oncalls.com
- **Alternative URL:** https://mcp-server-oncalls-production.up.railway.app
- **Health check:** https://mcp.oncalls.com/health

### 3. Implemented Tools (8 total)

**User Tools (5):**
| Tool | File | Description |
|------|------|-------------|
| `get-oncall-schedule` | `src/tools/queries/get-oncall-schedule.ts` | Who's on call for a date |
| `get-my-schedule` | `src/tools/queries/get-my-schedule.ts` | User's own shifts |
| `get-my-requests` | `src/tools/queries/get-my-requests.ts` | User's submitted requests |
| `get-physician-contact` | `src/tools/queries/get-physician-contact.ts` | Look up contact info |
| `get-shift-types` | `src/tools/queries/get-shift-types.ts` | Available shift types |

**Admin Tools (3):**
| Tool | File | Description |
|------|------|-------------|
| `list-members` | `src/tools/admin/list-members.ts` | All group members |
| `list-pending-requests` | `src/tools/admin/list-pending-requests.ts` | Requests awaiting approval |
| `list-pending-volunteers` | `src/tools/admin/list-pending-volunteers.ts` | Volunteers awaiting approval |

### 4. Authentication

- **Current method:** Username/password via HTTP headers
- **Headers:** `X-OnCalls-Username`, `X-OnCalls-Password`
- **Alternative:** Bearer token (base64 encoded `username:password`)
- **OnCalls API:** JWT-based, tokens managed in `src/auth/token-manager.ts`

### 5. Deployment

- **Platform:** Railway
- **Environment variable:** `ONCALLS_BASE_URL=https://v3.oncalls.com/api`
- **Port:** 8080 (Railway default, server reads `process.env.PORT`)
- **Custom domain:** mcp.oncalls.com (configured in Railway)

---

## 📁 Key Files

```
/Users/jmr/dev/mcp-server-oncalls/
├── src/
│   ├── index.ts              # Local server entry (stdio)
│   ├── remote.ts             # Remote server entry (SSE)
│   ├── server.ts             # MCP server setup (local)
│   ├── remote-server.ts      # MCP server setup (remote/Express)
│   ├── auth/
│   │   ├── oncalls-client.ts # OnCalls API client
│   │   └── token-manager.ts  # JWT token handling
│   ├── tools/
│   │   ├── queries/          # User query tools
│   │   └── admin/            # Admin-only tools
│   └── types/
│       └── oncalls.ts        # TypeScript interfaces
├── dist/                     # Compiled output
├── package.json              # npm config
├── railway.toml              # Railway deployment config
├── Procfile                  # Railway start command
├── server.json               # MCP registry manifest
├── ANTHROPIC_SUBMISSION.md   # Form guide for Anthropic directory
└── README.md                 # Documentation
```

---

## 🔗 URLs & Resources

| Resource                | URL                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Remote MCP Server**   | https://mcp.oncalls.com                                                                             |
| **Health Check**        | https://mcp.oncalls.com/health                                                                      |
| **SSE Endpoint**        | https://mcp.oncalls.com/sse                                                                         |
| **npm Package**         | https://www.npmjs.com/package/mcp-server-oncalls                                                    |
| **GitHub Repo**         | https://github.com/jacobmr/mcp-server-oncalls                                                       |
| **Railway Dashboard**   | https://railway.app (project: mcp-server-oncalls)                                                   |
| **OnCalls Staging API** | https://v3.oncalls.com/api                                                                          |
| **Anthropic Form**      | https://docs.google.com/forms/d/e/1FAIpQLSeafJF2NDI7oYx1r8o0ycivCSVLNq92Mpc1FPxMKSw1CzDkqA/viewform |

---

## 🔑 Test Credentials

| Field                   | Value                      |
| ----------------------- | -------------------------- |
| **OnCalls Staging URL** | https://v3.oncalls.com/api |
| **Username**            | Stetzer                    |
| **Password**            | 0900                       |
| **User**                | Lee Stetzer                |
| **Group ID**            | 46                         |
| **Group Name**          | AMC Family Medicine        |
| **Is Admin**            | Yes                        |

---

## 🚧 REMAINING WORK

### For Anthropic Directory Submission (Blockers)

#### 1. OAuth 2.0 Implementation (MAJOR - 1-2 days)

**Current:** Username/password headers
**Required:** Full OAuth 2.0 flow

**OnCalls Backend Changes Needed:**

```
GET  /oauth/authorize    - Authorization page
POST /oauth/token        - Token exchange
POST /oauth/token        - Token refresh (grant_type=refresh_token)
```

**MCP Server Changes Needed:**

- Add OAuth callback handler
- Store/refresh OAuth tokens
- Remove header-based auth
- Update `src/remote-server.ts` auth middleware

#### 2. Safety Annotations (Quick - 1 hour)

Add to all tool definitions in `src/tools/`:

```typescript
annotations: {
  readOnlyHint: true,
  destructiveHint: false
}
```

Files to update:

- `src/tools/queries/get-oncall-schedule.ts`
- `src/tools/queries/get-my-schedule.ts`
- `src/tools/queries/get-my-requests.ts`
- `src/tools/queries/get-physician-contact.ts`
- `src/tools/queries/get-shift-types.ts`
- `src/tools/admin/list-members.ts`
- `src/tools/admin/list-pending-requests.ts`
- `src/tools/admin/list-pending-volunteers.ts`

#### 3. Privacy Policy

- Create content for privacy policy
- Publish at https://oncalls.com/privacy
- Add URL to submission form

#### 4. Terms of Service

- Create content for TOS
- Publish at https://oncalls.com/terms
- Add URL to submission form

#### 5. Logo

- Create SVG logo (1:1 aspect ratio)
- Host publicly
- Add URL to submission form

### Optional Improvements

#### Publish npm v1.1.0 with remote server

```bash
cd /Users/jmr/dev/mcp-server-oncalls
# Update version in package.json to 1.1.0
npm publish
```

#### Community MCP Registry (Alternative to Anthropic)

```bash
cd /Users/jmr/dev/mcp-server-oncalls
./mcp-publisher login github
./mcp-publisher publish
```

---

## 🗺️ ROADMAP

### Phase 1: Quick Wins (Today)

- [ ] Add safety annotations to all 8 tools
- [ ] Expand README with troubleshooting guide
- [ ] Publish npm v1.1.0

### Phase 2: Legal/Policy (This Week)

- [ ] Draft privacy policy
- [ ] Draft terms of service
- [ ] Publish both on oncalls.com
- [ ] Create logo SVG

### Phase 3: OAuth 2.0 (Next Sprint)

- [ ] Design OAuth flow for OnCalls
- [ ] Add `/oauth/authorize` endpoint to OnCalls Flask
- [ ] Add `/oauth/token` endpoint to OnCalls Flask
- [ ] Update MCP server to use OAuth
- [ ] Test full OAuth flow
- [ ] Deploy updated MCP server

### Phase 4: Submission

- [ ] Complete Anthropic form
- [ ] Submit for review
- [ ] Address any feedback

---

## 💻 Quick Commands

```bash
# Navigate to project
cd /Users/jmr/dev/mcp-server-oncalls

# Build
npm run build

# Run local server (requires env vars)
ONCALLS_USERNAME=Stetzer ONCALLS_PASSWORD=0900 ONCALLS_API_URL=https://v3.oncalls.com/api npm start

# Run remote server locally
ONCALLS_BASE_URL=https://v3.oncalls.com/api npm run start:remote

# Test health check
curl https://mcp.oncalls.com/health

# Test with auth
curl -H "X-OnCalls-Username: Stetzer" -H "X-OnCalls-Password: 0900" https://mcp.oncalls.com/sse

# Push to GitHub (auto-deploys to Railway)
git add -A && git commit -m "message" && git push
```

---

## 📝 Notes

1. **Railway auto-deploys** on push to main branch
2. **npm token** was used once and removed from config - need to re-login for future publishes
3. **OnCalls API quirks:**
   - Login returns `status: true` (boolean), not `"success"` (string)
   - `/month_schedule` returns `lname` as object `{"1": ["Name"]}` not string
   - `/get_all_requests` returns `monthRequest` array, uses `docid=0` for all users
   - `/get_pending_vols` endpoint returns 500 on staging (feature may not be enabled)

4. **MCP Publisher CLI** downloaded to project dir (in .gitignore):
   - `/Users/jmr/dev/mcp-server-oncalls/mcp-publisher`

---

## 🆘 Resume Prompt for New Session

```
I'm working on mcp-server-oncalls - an MCP server for OnCalls physician scheduling.

Current state:
- MCP server built and deployed to Railway at https://mcp.oncalls.com
- Published to npm as mcp-server-oncalls
- GitHub: https://github.com/jacobmr/mcp-server-oncalls
- 8 tools implemented (5 user, 3 admin)
- Uses username/password auth (NOT OAuth yet)

Blockers for Anthropic directory submission:
1. Need OAuth 2.0 (major work)
2. Need safety annotations on tools (quick)
3. Need privacy policy URL
4. Need terms of service URL
5. Need logo SVG

Project location: /Users/jmr/dev/mcp-server-oncalls
State doc: /Users/jmr/dev/mcp-server-oncalls/SESSION_STATE.md
Submission guide: /Users/jmr/dev/mcp-server-oncalls/ANTHROPIC_SUBMISSION.md

Test credentials: Stetzer/0900 on https://v3.oncalls.com/api
```
