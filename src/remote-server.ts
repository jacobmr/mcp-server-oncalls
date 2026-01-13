/**
 * OnCalls Remote MCP Server
 * HTTP/SSE transport for remote deployment
 * Supports OAuth 2.0 authentication
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { OncallsClient } from './auth/index.js';
import { getToolsForUser, findTool } from './tools/index.js';
import { toMcpError } from './utils/index.js';

const SERVER_NAME = 'oncalls-remote';
const SERVER_VERSION = '1.8.0';

// OAuth Configuration
const OAUTH_CONFIG = {
  clientId: process.env.MCP_OAUTH_CLIENT_ID || 'mcp-server-oncalls',
  clientSecret: process.env.MCP_OAUTH_CLIENT_SECRET || '',
  authorizeUrl: process.env.MCP_OAUTH_AUTHORIZE_URL || 'https://v3.oncalls.com/oauth/authorize',
  tokenUrl: process.env.MCP_OAUTH_TOKEN_URL || 'https://v3.oncalls.com/oauth/token',
  redirectUri: process.env.MCP_OAUTH_REDIRECT_URI || 'https://mcp.oncalls.com/oauth/callback',
  scopes: 'read:schedule read:members read:requests read:profile admin:requests admin:members',
};

// Store active transports by session ID (both SSE and Streamable HTTP)
type TransportType = SSEServerTransport | StreamableHTTPServerTransport;
const activeTransports = new Map<string, TransportType>();

// Store authenticated clients by session ID (for Streamable HTTP which may need client across requests)
const authenticatedClients = new Map<string, OncallsClient>();

// Store OAuth states for CSRF protection (expire after 10 minutes)
const oauthStates = new Map<string, { createdAt: number; redirectAfterAuth?: string }>();

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000);

interface AuthenticatedRequest extends Request {
  oncallsClient?: OncallsClient;
  sessionId?: string;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Create an MCP server instance for a specific OnCalls client
 */
function createMcpServer(client: OncallsClient): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = getToolsForUser(client.userContext.isAdmin);
    console.log(
      `[${SERVER_NAME}] Listing ${tools.length} tools (admin: ${client.userContext.isAdmin})`
    );

    return {
      tools: tools.map((tool) => tool.definition),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.log(`[${SERVER_NAME}] Calling tool: ${name}`);

    const tool = findTool(name);
    if (!tool) {
      throw toMcpError(new Error(`Unknown tool: ${name}`));
    }

    // Check if user has access to admin tools
    if (tool.adminOnly && !client.userContext.isAdmin) {
      throw toMcpError(new Error('Admin access required for this tool'));
    }

    try {
      const result = await tool.handler(client, args || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`[${SERVER_NAME}] Tool error:`, error);
      throw toMcpError(error);
    }
  });

  return server;
}

/**
 * Authentication middleware
 * Supports:
 * 1. OAuth 2.0 Bearer token (JWT from OnCalls OAuth)
 * 2. Legacy: X-OnCalls-Username and X-OnCalls-Password headers
 * 3. Legacy: Bearer <base64(username:password)>
 */
async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const baseUrl = process.env.ONCALLS_BASE_URL;
    if (!baseUrl) {
      res.status(500).json({ error: 'Server not configured: ONCALLS_BASE_URL missing' });
      return;
    }

    const authHeader = req.headers.authorization;

    // Method 1: OAuth 2.0 Bearer token (check if it's a JWT)
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      // Check if it looks like a JWT (three base64 segments separated by dots)
      if (token.split('.').length === 3) {
        try {
          // Try OAuth authentication
          const client = await OncallsClient.fromOAuthTokens({
            baseUrl,
            accessToken: token,
            refreshToken: '', // Will be populated if refresh is needed
            clientId: OAUTH_CONFIG.clientId,
            clientSecret: OAUTH_CONFIG.clientSecret,
            tokenUrl: OAUTH_CONFIG.tokenUrl,
          });

          req.sessionId = `oauth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          req.oncallsClient = client;

          console.log(
            `[${SERVER_NAME}] OAuth authenticated: ${client.userContext.email} (session: ${req.sessionId})`
          );
          next();
          return;
        } catch (oauthError) {
          console.error(`[${SERVER_NAME}] OAuth auth failed, trying legacy auth:`, oauthError);
          // Fall through to try legacy auth
        }
      }

      // Try legacy base64(username:password) bearer token
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');
        if (username && password) {
          const client = new OncallsClient({ baseUrl, username, password });
          await client.authenticate();

          req.sessionId = `${username}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          req.oncallsClient = client;

          console.log(
            `[${SERVER_NAME}] Legacy auth (bearer): ${username} (session: ${req.sessionId})`
          );
          next();
          return;
        }
      } catch {
        // Invalid base64 or auth failed
      }
    }

    // Method 2: Custom headers (legacy)
    const headerUsername = req.headers['x-oncalls-username'] as string;
    const headerPassword = req.headers['x-oncalls-password'] as string;

    if (headerUsername && headerPassword) {
      const client = new OncallsClient({
        baseUrl,
        username: headerUsername,
        password: headerPassword,
      });
      await client.authenticate();

      req.sessionId = `${headerUsername}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      req.oncallsClient = client;

      console.log(
        `[${SERVER_NAME}] Legacy auth (headers): ${headerUsername} (session: ${req.sessionId})`
      );
      next();
      return;
    }

    // Method 3: Query params (for SSE connections where headers may be limited)
    if (req.query.username && req.query.password) {
      const username = req.query.username as string;
      const password = req.query.password as string;

      const client = new OncallsClient({ baseUrl, username, password });
      await client.authenticate();

      req.sessionId = `${username}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      req.oncallsClient = client;

      console.log(`[${SERVER_NAME}] Legacy auth (query): ${username} (session: ${req.sessionId})`);
      next();
      return;
    }

    // Method 4: OAuth access_token query param
    if (req.query.access_token) {
      const token = req.query.access_token as string;
      try {
        const client = await OncallsClient.fromOAuthTokens({
          baseUrl,
          accessToken: token,
          refreshToken: '',
          clientId: OAUTH_CONFIG.clientId,
          clientSecret: OAUTH_CONFIG.clientSecret,
          tokenUrl: OAUTH_CONFIG.tokenUrl,
        });

        req.sessionId = `oauth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        req.oncallsClient = client;

        console.log(
          `[${SERVER_NAME}] OAuth authenticated (query): ${client.userContext.email} (session: ${req.sessionId})`
        );
        next();
        return;
      } catch (error) {
        console.error(`[${SERVER_NAME}] OAuth query auth failed:`, error);
      }
    }

    // No valid authentication found - return 401 with MCP spec-compliant headers
    // Per MCP spec: WWW-Authenticate header must include resource_metadata URL
    const serverUrl = process.env.MCP_SERVER_URL || 'https://mcp.oncalls.com';
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${serverUrl}/.well-known/oauth-protected-resource", ` +
        `scope="${OAUTH_CONFIG.scopes}"`
    );
    res.status(401).json({
      error: 'unauthorized',
      error_description:
        'Authentication required. Discover OAuth configuration at resource_metadata URL.',
    });
  } catch (error) {
    console.error(`[${SERVER_NAME}] Auth error:`, error);
    const serverUrl = process.env.MCP_SERVER_URL || 'https://mcp.oncalls.com';
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${serverUrl}/.well-known/oauth-protected-resource", ` +
        `error="invalid_token", ` +
        `error_description="${error instanceof Error ? error.message : 'Authentication failed'}"`
    );
    res.status(401).json({
      error: 'invalid_token',
      error_description: error instanceof Error ? error.message : 'Authentication failed',
    });
  }
}

/**
 * Create and start the remote MCP server
 */
export async function startRemoteServer(port: number = 3001): Promise<void> {
  const app = express();

  // CORS configuration - allow Claude to connect
  app.use(
    cors({
      origin: true, // Allow all origins for MCP
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-OnCalls-Username', 'X-OnCalls-Password'],
    })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: SERVER_NAME,
      version: SERVER_VERSION,
    });
  });

  // Favicon - redirect to V3 stethoscope icon (prevents fallback to old V2 icon)
  app.get('/favicon.ico', (_req, res) => {
    res.redirect(301, 'https://v3.oncalls.com/stethoscope-favicon.png');
  });
  app.get('/favicon.png', (_req, res) => {
    res.redirect(301, 'https://v3.oncalls.com/stethoscope-favicon.png');
  });

  // ==================== OAuth Discovery Endpoints ====================

  /**
   * OAuth Protected Resource Metadata (RFC 9728)
   * This is the primary discovery endpoint per MCP spec
   * Clients discover this via WWW-Authenticate header's resource_metadata parameter
   *
   * Per RFC 9728: authorization_servers is an array of issuer URLs (strings)
   * Client fetches auth server metadata from each issuer's /.well-known/oauth-authorization-server
   *
   * Note: Also handle /sse suffix as some clients append the resource path
   */
  const protectedResourceHandler = (_req: Request, res: Response) => {
    const resourceUrl = process.env.MCP_SERVER_URL || 'https://mcp.oncalls.com';
    const authServerIssuer = OAUTH_CONFIG.authorizeUrl.replace('/oauth/authorize', '');

    res.json({
      resource: resourceUrl,
      authorization_servers: [authServerIssuer],
      scopes_supported: OAUTH_CONFIG.scopes.split(' '),
      bearer_methods_supported: ['header'],
    });
  };

  app.get('/.well-known/oauth-protected-resource', protectedResourceHandler);
  app.get('/.well-known/oauth-protected-resource/sse', protectedResourceHandler);

  /**
   * Authorization Server Metadata (RFC 8414)
   * This should be served by the auth server (v3.oncalls.com), but we proxy it for convenience
   */
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    const authServerIssuer = OAUTH_CONFIG.authorizeUrl.replace('/oauth/authorize', '');

    res.json({
      issuer: authServerIssuer,
      authorization_endpoint: OAUTH_CONFIG.authorizeUrl,
      token_endpoint: OAUTH_CONFIG.tokenUrl,
      scopes_supported: OAUTH_CONFIG.scopes.split(' '),
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
    });
  });

  // ==================== OAuth 2.0 Endpoints ====================

  /**
   * Start OAuth flow - returns authorization URL
   */
  app.get('/oauth/start', (req, res) => {
    // Generate CSRF state
    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, {
      createdAt: Date.now(),
      redirectAfterAuth: req.query.redirect as string | undefined,
    });

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: OAUTH_CONFIG.clientId,
      redirect_uri: OAUTH_CONFIG.redirectUri,
      response_type: 'code',
      scope: OAUTH_CONFIG.scopes,
      state,
    });

    const authUrl = `${OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;

    res.json({
      auth_url: authUrl,
      state,
      message: 'Redirect the user to auth_url to begin OAuth flow',
    });
  });

  /**
   * OAuth callback - exchanges code for tokens
   */
  app.get('/oauth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error(`[${SERVER_NAME}] OAuth error: ${error} - ${error_description}`);
      res.status(400).json({
        error: error as string,
        error_description: error_description as string,
      });
      return;
    }

    // Validate state for CSRF protection
    if (!state || !oauthStates.has(state as string)) {
      res.status(400).json({
        error: 'invalid_state',
        error_description: 'Invalid or expired state parameter',
      });
      return;
    }

    const stateData = oauthStates.get(state as string)!;
    oauthStates.delete(state as string);

    if (!code) {
      res.status(400).json({
        error: 'missing_code',
        error_description: 'Authorization code is required',
      });
      return;
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch(OAUTH_CONFIG.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: OAUTH_CONFIG.redirectUri,
          client_id: OAUTH_CONFIG.clientId,
          client_secret: OAUTH_CONFIG.clientSecret,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error(`[${SERVER_NAME}] Token exchange failed:`, errorData);
        res.status(400).json({
          error: 'token_exchange_failed',
          error_description: 'Failed to exchange authorization code for tokens',
        });
        return;
      }

      const tokens = (await tokenResponse.json()) as OAuthTokenResponse;

      console.log(`[${SERVER_NAME}] OAuth token exchange successful`);

      // Return tokens to the client
      res.json({
        success: true,
        access_token: tokens.access_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        message: 'Use the access_token as Bearer token for API requests',
      });
    } catch (error) {
      console.error(`[${SERVER_NAME}] OAuth callback error:`, error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to complete OAuth flow',
      });
    }
  });

  /**
   * Token refresh endpoint
   */
  app.post('/oauth/refresh', async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({
        error: 'missing_refresh_token',
        error_description: 'refresh_token is required',
      });
      return;
    }

    try {
      const tokenResponse = await fetch(OAUTH_CONFIG.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
          client_id: OAUTH_CONFIG.clientId,
          client_secret: OAUTH_CONFIG.clientSecret,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error(`[${SERVER_NAME}] Token refresh failed:`, errorData);
        res.status(400).json({
          error: 'refresh_failed',
          error_description: 'Failed to refresh token',
        });
        return;
      }

      const tokens = (await tokenResponse.json()) as OAuthTokenResponse;

      res.json({
        success: true,
        access_token: tokens.access_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        refresh_token: tokens.refresh_token || refresh_token,
        scope: tokens.scope,
      });
    } catch (error) {
      console.error(`[${SERVER_NAME}] Token refresh error:`, error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to refresh token',
      });
    }
  });

  // ==================== MCP Endpoints ====================

  /**
   * Streamable HTTP Transport endpoint (Protocol version 2025-11-25)
   * This is the preferred transport for newer clients like mcp-remote
   * Supports GET, POST, DELETE on a single endpoint
   */
  app.all('/mcp', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    console.log(`[${SERVER_NAME}] Received ${req.method} request to /mcp`);

    try {
      const client = req.oncallsClient!;

      // Check for existing session ID in header
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && activeTransports.has(sessionId)) {
        // Check if the transport is of the correct type
        const existingTransport = activeTransports.get(sessionId);
        if (existingTransport instanceof StreamableHTTPServerTransport) {
          transport = existingTransport;
        } else {
          // Transport exists but is not a StreamableHTTPServerTransport
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: Session exists but uses a different transport protocol',
            },
            id: null,
          });
          return;
        }
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        // New session initialization
        console.log(`[${SERVER_NAME}] Creating new Streamable HTTP session`);

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            console.log(`[${SERVER_NAME}] Streamable HTTP session initialized: ${newSessionId}`);
            activeTransports.set(newSessionId, transport!);
            authenticatedClients.set(newSessionId, client);
          },
        });

        // Set up cleanup handler
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) {
            console.log(`[${SERVER_NAME}] Streamable HTTP session closed: ${sid}`);
            activeTransports.delete(sid);
            authenticatedClients.delete(sid);
          }
        };

        // Create and connect MCP server
        const mcpServer = createMcpServer(client);
        await mcpServer.connect(transport);
      } else if (sessionId) {
        // Session ID provided but not found
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not found',
          },
          id: null,
        });
        return;
      } else {
        // No session ID and not an initialization request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or not an initialization request',
          },
          id: null,
        });
        return;
      }

      // Handle the request with the transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`[${SERVER_NAME}] Error handling /mcp request:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  /**
   * SSE Transport endpoint (Protocol version 2024-11-05 - deprecated but still supported)
   * Per MCP spec: returns 401 with WWW-Authenticate header if not authenticated
   * Client discovers OAuth via resource_metadata URL in the header
   */
  app.get('/sse', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const client = req.oncallsClient!;
    const userSessionId = req.sessionId!;

    console.log(`[${SERVER_NAME}] New SSE connection for user session: ${userSessionId}`);

    // Create MCP server for this client
    const mcpServer = createMcpServer(client);

    // Create SSE transport - it generates its own sessionId internally
    const transport = new SSEServerTransport('/message', res);

    // Access the transport's internal sessionId so we can key our Map correctly
    // The SDK exposes this via a property
    const transportSessionId = (transport as unknown as { sessionId: string }).sessionId;
    console.log(`[${SERVER_NAME}] Transport sessionId: ${transportSessionId}`);

    activeTransports.set(transportSessionId, transport);

    // Clean up on disconnect
    res.on('close', () => {
      console.log(`[${SERVER_NAME}] SSE connection closed: ${transportSessionId}`);
      activeTransports.delete(transportSessionId);
      mcpServer.close().catch(console.error);
    });

    // Connect MCP server to transport
    await mcpServer.connect(transport);
  });

  // Message endpoint for SSE transport MCP messages
  // SSEServerTransport sends the client a URL with ?sessionId=xxx, client POSTs to that URL
  app.post('/message', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      console.log(`[${SERVER_NAME}] POST /message missing sessionId`);
      res.status(400).json({ error: 'Missing sessionId parameter' });
      return;
    }

    const transport = activeTransports.get(sessionId);
    if (!transport) {
      console.log(`[${SERVER_NAME}] POST /message unknown sessionId: ${sessionId}`);
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Only SSEServerTransport uses /message endpoint
    if (!(transport instanceof SSEServerTransport)) {
      console.log(`[${SERVER_NAME}] POST /message: wrong transport type for session ${sessionId}`);
      res.status(400).json({ error: 'Session uses different transport protocol' });
      return;
    }

    console.log(`[${SERVER_NAME}] POST /message for session: ${sessionId}`);
    await transport.handlePostMessage(req, res, req.body);
  });

  // Handle POST to /sse - supports both:
  // 1. Streamable HTTP initialization (mcp-remote uses http-first strategy on /sse URL)
  // 2. SSE transport messages (legacy clients with sessionId)
  app.post('/sse', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const headerSessionId = req.headers['mcp-session-id'] as string | undefined;

    // Check if this is a Streamable HTTP request (no sessionId in query, may have header or init request)
    if (!sessionId) {
      // Handle as Streamable HTTP transport
      console.log(`[${SERVER_NAME}] POST /sse - treating as Streamable HTTP`);

      try {
        const client = req.oncallsClient!;
        let transport: StreamableHTTPServerTransport | undefined;

        if (headerSessionId && activeTransports.has(headerSessionId)) {
          const existingTransport = activeTransports.get(headerSessionId);
          if (existingTransport instanceof StreamableHTTPServerTransport) {
            transport = existingTransport;
          } else {
            res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Session uses different transport protocol' },
              id: null,
            });
            return;
          }
        } else if (!headerSessionId && isInitializeRequest(req.body)) {
          // New Streamable HTTP session on /sse endpoint
          console.log(`[${SERVER_NAME}] Creating new Streamable HTTP session on /sse`);

          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId: string) => {
              console.log(
                `[${SERVER_NAME}] Streamable HTTP session initialized (via /sse): ${newSessionId}`
              );
              activeTransports.set(newSessionId, transport!);
              authenticatedClients.set(newSessionId, client);
            },
          });

          transport.onclose = () => {
            const sid = transport!.sessionId;
            if (sid) {
              console.log(`[${SERVER_NAME}] Streamable HTTP session closed (via /sse): ${sid}`);
              activeTransports.delete(sid);
              authenticatedClients.delete(sid);
            }
          };

          const mcpServer = createMcpServer(client);
          await mcpServer.connect(transport);
        } else if (headerSessionId) {
          res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session not found' },
            id: null,
          });
          return;
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No session ID or initialization request',
            },
            id: null,
          });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(`[${SERVER_NAME}] Error handling Streamable HTTP on /sse:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
      return;
    }

    // Legacy SSE transport - sessionId provided in query
    const transport = activeTransports.get(sessionId);
    if (!transport) {
      console.log(`[${SERVER_NAME}] POST /sse unknown sessionId: ${sessionId}`);
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!(transport instanceof SSEServerTransport)) {
      console.log(`[${SERVER_NAME}] POST /sse: wrong transport type for session ${sessionId}`);
      res.status(400).json({ error: 'Session uses different transport protocol' });
      return;
    }

    console.log(`[${SERVER_NAME}] POST /sse for SSE session: ${sessionId}`);
    await transport.handlePostMessage(req, res, req.body);
  });

  // Info endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      description: 'OnCalls MCP Server - Remote',
      endpoints: {
        mcp: '/mcp (Streamable HTTP - recommended)',
        sse: '/sse (SSE - deprecated)',
        message: '/message (for SSE transport)',
        health: '/health',
        oauth: {
          start: '/oauth/start',
          callback: '/oauth/callback',
          refresh: '/oauth/refresh',
        },
      },
      transports: {
        streamableHttp: {
          description: 'Streamable HTTP transport (Protocol version 2025-11-25)',
          endpoint: '/mcp',
          methods: ['GET', 'POST', 'DELETE'],
        },
        sse: {
          description: 'SSE transport (Protocol version 2024-11-05 - deprecated)',
          sseEndpoint: '/sse',
          messageEndpoint: '/message',
        },
      },
      auth: {
        recommended: 'OAuth 2.0',
        oauth_start_url: '/oauth/start',
        legacy: {
          headers: ['X-OnCalls-Username', 'X-OnCalls-Password'],
          bearer: 'Base64 encoded username:password',
        },
      },
    });
  });

  // Start server
  app.listen(port, () => {
    console.log(`[${SERVER_NAME}] Remote MCP server v${SERVER_VERSION} running on port ${port}`);
    console.log(`[${SERVER_NAME}] Streamable HTTP endpoint: http://localhost:${port}/mcp`);
    console.log(`[${SERVER_NAME}] SSE endpoint (deprecated): http://localhost:${port}/sse`);
    console.log(`[${SERVER_NAME}] Health check: http://localhost:${port}/health`);
  });
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const port = parseInt(process.env.PORT || '3001', 10);
  startRemoteServer(port).catch((error) => {
    console.error('Failed to start remote server:', error);
    process.exit(1);
  });
}
