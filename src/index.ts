#!/usr/bin/env node
/**
 * OnCalls MCP Server
 *
 * MCP server for the OnCalls physician on-call scheduling system.
 * Enables AI assistants to query schedules, submit requests, and manage on-call operations.
 *
 * Environment variables:
 *   ONCALLS_USERNAME - OnCalls login username
 *   ONCALLS_PASSWORD - OnCalls login password
 *   ONCALLS_API_URL  - OnCalls API base URL (e.g., https://oncalls.com/api)
 */

import { runServer } from './server.js';

// Validate required environment variables
const requiredEnvVars = ['ONCALLS_USERNAME', 'ONCALLS_PASSWORD', 'ONCALLS_API_URL'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

if (missingVars.length > 0) {
  console.error('Error: Missing required environment variables:');
  missingVars.forEach((v) => console.error(`  - ${v}`));
  console.error('\nPlease set these variables in your MCP client configuration.');
  console.error('Example for Claude Desktop:');
  console.error(`
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
`);
  process.exit(1);
}

// Run the server
runServer({
  oncallsApiUrl: process.env.ONCALLS_API_URL!,
  oncallsUsername: process.env.ONCALLS_USERNAME!,
  oncallsPassword: process.env.ONCALLS_PASSWORD!,
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
