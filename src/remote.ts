#!/usr/bin/env node
/**
 * OnCalls Remote MCP Server Entry Point
 *
 * Run this for remote/hosted deployment.
 * Provides HTTP/SSE transport for Claude to connect remotely.
 *
 * Environment variables:
 *   ONCALLS_BASE_URL - OnCalls API base URL (required)
 *   PORT - Server port (default: 3001)
 *
 * Users authenticate per-request with their own OnCalls credentials.
 */

import { startRemoteServer } from './remote-server.js';

// Validate required environment variables
if (!process.env.ONCALLS_BASE_URL) {
  console.error('Error: Missing required environment variable: ONCALLS_BASE_URL');
  console.error('');
  console.error('Example:');
  console.error('  ONCALLS_BASE_URL=https://v3.oncalls.com/api PORT=3001 npm run start:remote');
  process.exit(1);
}

const port = parseInt(process.env.PORT || '3001', 10);

console.log('Starting OnCalls Remote MCP Server...');
console.log(`  ONCALLS_BASE_URL: ${process.env.ONCALLS_BASE_URL}`);
console.log(`  PORT: ${port}`);
console.log('');

startRemoteServer(port).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
