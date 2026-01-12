# mcp-server-oncalls

MCP (Model Context Protocol) server for the [OnCalls](https://oncalls.com) physician on-call scheduling system.

Enables AI assistants like Claude to query schedules, submit requests, and manage on-call operations through natural language.

## Features

- **Query on-call schedules** - "Who's on call today?"
- **View your schedule** - "What's my schedule this month?"
- **Find physician contacts** - "What's Dr. Smith's pager number?"
- **Submit requests** - "I need January 20th off" *(coming soon)*
- **Admin operations** - "Approve Dr. Smith's day off request" *(admin only)*

## Installation

```bash
npm install -g mcp-server-oncalls
```

Or use directly with npx:

```bash
npx mcp-server-oncalls
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "oncalls": {
      "command": "npx",
      "args": ["mcp-server-oncalls"],
      "env": {
        "ONCALLS_USERNAME": "your_username",
        "ONCALLS_PASSWORD": "your_password",
        "ONCALLS_API_URL": "https://oncalls.com/api"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ONCALLS_USERNAME` | Yes | Your OnCalls login username |
| `ONCALLS_PASSWORD` | Yes | Your OnCalls login password |
| `ONCALLS_API_URL` | Yes | OnCalls API URL (e.g., `https://oncalls.com/api`) |

## Available Tools

### For All Users

| Tool | Description |
|------|-------------|
| `get-oncall-schedule` | Get who's on call for a specific date |
| `get-my-schedule` | View your own on-call schedule |
| `get-physician-contact` | Look up a physician's contact info |
| `get-shift-types` | List available shift types in your group |
| `get-my-requests` | View your submitted requests |

### For Administrators

| Tool | Description |
|------|-------------|
| `list-pending-requests` | View requests awaiting approval |
| `list-pending-volunteers` | View volunteers awaiting approval |
| `list-members` | List all members in your group |

## Example Conversations

**Checking who's on call:**
```
You: Who's on call for OB-GYN today?

Claude: Today (January 12, 2026), Dr. Sarah Johnson is on call for OB-GYN.
- Phone: (555) 123-4567
- Pager: 5551234
```

**Viewing your schedule:**
```
You: What's my schedule next week?

Claude: Here's your schedule for January 13-19:
- Jan 14 (Tue): Night Shift
- Jan 17 (Fri): OB-GYN Call
```

**Admin reviewing requests:**
```
You: Show me pending requests

Claude: You have 3 pending requests:
1. Dr. Smith - Day Off - Jan 20
2. Dr. Chen - Switch - Jan 22
3. Dr. Patel - Day Off - Jan 25
```

## Development

```bash
# Clone the repository
git clone https://github.com/jmirza/mcp-server-oncalls.git
cd mcp-server-oncalls

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Development mode (watch)
npm run dev
```

### Testing with MCP Inspector

```bash
# Build first
npm run build

# Run with inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Security

- Credentials are passed via environment variables, never logged
- JWT tokens stored in memory only, never persisted
- All API communication over HTTPS
- Role-based access control enforced for admin tools

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

- **OnCalls Support**: [oncalls.com/contact](https://oncalls.com/contact)
- **MCP Issues**: [GitHub Issues](https://github.com/jmirza/mcp-server-oncalls/issues)
