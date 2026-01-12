# Anthropic MCP Directory Submission Guide

## Pre-Submission Checklist Status

### ❌ Policy Compliance (BLOCKERS)
- [ ] Read MCP Directory Review Guidelines
- [ ] Server complies with 30+ policy requirements
- [x] Does NOT enable cross-service automation
- [x] Does NOT transfer money/crypto/financial transactions
- [ ] Server is in GA or will be by publication

### ❌ Technical Requirements (BLOCKERS)
- [ ] **OAuth 2.0 fully implemented** ← MAJOR BLOCKER - Currently using username/password headers
- [ ] Safety annotations (readOnlyHint, destructiveHint) on all tools
- [x] HTTPS only (mcp.oncalls.com)
- [x] CORS properly configured
- [ ] Claude.ai/Claude Code IPs allowlisted (need to verify)

### ❌ Documentation Requirements (BLOCKERS)
- [x] Server documentation published (README.md on GitHub)
- [ ] Setup instructions, tool descriptions, troubleshooting ← Need to expand
- [ ] **Privacy policy published** ← BLOCKER - Need URL like oncalls.com/privacy
- [ ] **Terms of service published** ← BLOCKER - Need URL like oncalls.com/terms

### ✅ Testing Requirements
- [x] Test account with sample data ready (Stetzer/0900 on v3.oncalls.com)
- [x] Test credentials valid 30+ days
- [x] All tools functional and tested

---

## Form Responses (Draft)

### Company Information
| Field | Value |
|-------|-------|
| Company/Organization | OnCalls |
| Company URL | https://oncalls.com |
| Primary Contact Name | Jacob Mirza |
| Primary Contact Email | (your email) |
| Primary Contact Role | (your role) |
| Anthropic Contact | (if you have one) |

### Server Details
| Field | Value |
|-------|-------|
| MCP Server Name | mcp-server-oncalls |
| Server URL Type | Universal |
| Server URL | https://mcp.oncalls.com/sse |
| Tagline (55 chars max) | Physician on-call scheduling for healthcare |
| Description (50-100 words) | MCP server for OnCalls physician on-call scheduling system. Query who's on call, view your shifts, check pending requests, look up physician contact information, and manage schedules. Designed for medical groups, hospitals, and healthcare organizations using OnCalls for on-call coordination. Supports both individual physician queries and administrative operations for schedule managers. |

### Use Cases (minimum 3)
**Use Case 1: Check On-Call Schedule**
- Example prompt: "Who is on call for OB-GYN today?"
- What it does: Returns the physician currently assigned to the specified shift type

**Use Case 2: View Personal Schedule**
- Example prompt: "What's my on-call schedule this month?"
- What it does: Shows all shifts assigned to the authenticated user for the specified date range

**Use Case 3: Look Up Colleague Contact**
- Example prompt: "What's Dr. Smith's pager number?"
- What it does: Returns contact information (phone, pager, email) for the specified physician

**Use Case 4: Review Pending Requests (Admin)**
- Example prompt: "Show me pending time-off requests"
- What it does: Lists all shift requests awaiting approval (admin only)

### Connection Requirements
| Field | Value |
|-------|-------|
| Authentication Type | OAuth 2.0 (NEEDS IMPLEMENTATION) |
| Read/Write | Read-only (all current tools) |
| Third-party connections | OnCalls API (v3.oncalls.com) |
| Web access | No external web access |

### Tools List
```
1. get-oncall-schedule - View who's on call for a date
2. get-my-schedule - View your own shifts
3. get-my-requests - View your submitted requests
4. get-physician-contact - Look up physician contact info
5. get-shift-types - List available shift types
6. list-members - List group members (admin)
7. list-pending-requests - View pending requests (admin)
8. list-pending-volunteers - View pending volunteers (admin)
```

### Tool Safety Annotations (NEEDS IMPLEMENTATION)
All tools should have:
```json
{
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false
  }
}
```

### Documentation & Support
| Field | Value |
|-------|-------|
| Documentation URL | https://github.com/jacobmr/mcp-server-oncalls#readme |
| Privacy Policy URL | ❌ NEEDED: https://oncalls.com/privacy |
| Terms of Service URL | ❌ NEEDED: https://oncalls.com/terms |
| Support Channel | https://github.com/jacobmr/mcp-server-oncalls/issues |

### Technical Details
| Field | Value |
|-------|-------|
| Transport | SSE (Server-Sent Events) |
| GA Date | (current or future date) |
| Logo | ❌ NEEDED: SVG, 1:1 aspect ratio |

---

## BLOCKERS TO RESOLVE BEFORE SUBMISSION

### 1. OAuth 2.0 Implementation (MAJOR)
Current auth: Username/password via headers
Required: Full OAuth 2.0 flow

**OnCalls backend needs:**
- `GET /oauth/authorize` - Authorization page
- `POST /oauth/token` - Token exchange endpoint
- `POST /oauth/token` (refresh) - Token refresh
- Client ID/Secret management
- Scope definitions (read:schedule, read:members, admin:requests)

**MCP server needs:**
- OAuth callback handler
- Token storage/refresh logic
- Remove header-based auth

**Estimated work:** 1-2 days

### 2. Safety Annotations
Add to all 8 tool definitions in `/src/tools/`:
```typescript
annotations: {
  readOnlyHint: true,
  destructiveHint: false
}
```
**Estimated work:** 1 hour

### 3. Privacy Policy
Create and publish at: https://oncalls.com/privacy
Must cover:
- What data is collected
- How data is used
- Third-party sharing
- Data retention
- User rights

### 4. Terms of Service
Create and publish at: https://oncalls.com/terms
Must cover:
- Acceptable use
- Service limitations
- Liability
- Termination

### 5. Server Logo
- Format: SVG
- Aspect ratio: 1:1 (square)
- Host publicly and provide URL

---

## Resources

| Resource | URL |
|----------|-----|
| GitHub Repo | https://github.com/jacobmr/mcp-server-oncalls |
| npm Package | https://www.npmjs.com/package/mcp-server-oncalls |
| Remote Server | https://mcp.oncalls.com |
| Health Check | https://mcp.oncalls.com/health |
| Railway Dashboard | https://railway.app (your project) |
| Test Staging | https://v3.oncalls.com |
| Test Credentials | Username: Stetzer, Password: 0900 |
| Anthropic Form | https://docs.google.com/forms/d/e/1FAIpQLSeafJF2NDI7oYx1r8o0ycivCSVLNq92Mpc1FPxMKSw1CzDkqA/viewform |

---

## Alternative: Community MCP Registry

If OAuth is too much work right now, you can submit to the community registry instead:

```bash
cd /Users/jmr/dev/mcp-server-oncalls
./mcp-publisher login github
./mcp-publisher publish
```

This has fewer requirements and still gets visibility in the MCP ecosystem.

---

## Summary

**Ready now:**
- ✅ Working MCP server (local + remote)
- ✅ Published to npm
- ✅ Deployed to Railway
- ✅ Test account available
- ✅ Basic documentation

**Needed for Anthropic submission:**
- ❌ OAuth 2.0 (major work)
- ❌ Safety annotations (quick fix)
- ❌ Privacy policy (content needed)
- ❌ Terms of service (content needed)
- ❌ Logo SVG (design needed)
