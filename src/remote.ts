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

const port = parseInt(process.env.PORT || '3001', 10);

console.log('========================================');
console.log('OnCalls Remote MCP Server Starting...');
console.log('========================================');
console.log(`  PORT: ${port}`);
console.log(`  ONCALLS_BASE_URL: ${process.env.ONCALLS_BASE_URL || '(NOT SET)'}`);
console.log('');

// Warn but don't exit if ONCALLS_BASE_URL is missing - let healthcheck pass
// Auth will fail at runtime if not set
if (!process.env.ONCALLS_BASE_URL) {
  console.warn('WARNING: ONCALLS_BASE_URL not set. Auth will fail until configured.');
}

startRemoteServer(port).catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
