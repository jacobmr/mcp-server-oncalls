/**
 * OnCalls Remote MCP Server
 * HTTP/SSE transport for remote deployment
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OncallsClient } from './auth/index.js';
import { getToolsForUser, findTool } from './tools/index.js';
import { toMcpError } from './utils/index.js';

const SERVER_NAME = 'oncalls-remote';
const SERVER_VERSION = '1.0.0';

// Store active transports by session ID
const activeTransports = new Map<string, SSEServerTransport>();

interface AuthenticatedRequest extends Request {
  oncallsClient?: OncallsClient;
  sessionId?: string;
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
    console.log(`[${SERVER_NAME}] Listing ${tools.length} tools (admin: ${client.userContext.isAdmin})`);

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
 * Expects either:
 * - X-OnCalls-Username and X-OnCalls-Password headers
 * - Or Authorization: Bearer <base64(username:password)>
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

    let username: string | undefined;
    let password: string | undefined;

    // Method 1: Custom headers
    const headerUsername = req.headers['x-oncalls-username'] as string;
    const headerPassword = req.headers['x-oncalls-password'] as string;

    if (headerUsername && headerPassword) {
      username = headerUsername;
      password = headerPassword;
    }

    // Method 2: Bearer token (base64 encoded username:password)
    const authHeader = req.headers.authorization;
    if (!username && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [user, pass] = decoded.split(':');
        if (user && pass) {
          username = user;
          password = pass;
        }
      } catch {
        // Invalid base64, ignore
      }
    }

    // Method 3: Query params (for SSE connections where headers may be limited)
    if (!username && req.query.username && req.query.password) {
      username = req.query.username as string;
      password = req.query.password as string;
    }

    if (!username || !password) {
      res.status(401).json({
        error: 'Authentication required',
        hint: 'Provide X-OnCalls-Username and X-OnCalls-Password headers, or Bearer token',
      });
      return;
    }

    // Create and authenticate OnCalls client
    const client = new OncallsClient({
      baseUrl,
      username,
      password,
    });

    await client.authenticate();

    // Generate session ID
    req.sessionId = `${username}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    req.oncallsClient = client;

    console.log(`[${SERVER_NAME}] Authenticated user: ${username} (session: ${req.sessionId})`);
    next();
  } catch (error) {
    console.error(`[${SERVER_NAME}] Auth error:`, error);
    res.status(401).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Create and start the remote MCP server
 */
export async function startRemoteServer(port: number = 3001): Promise<void> {
  const app = express();

  // CORS configuration - allow Claude to connect
  app.use(cors({
    origin: true, // Allow all origins for MCP
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-OnCalls-Username',
      'X-OnCalls-Password',
    ],
  }));

  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      server: SERVER_NAME,
      version: SERVER_VERSION,
    });
  });

  // SSE endpoint for MCP connections
  app.get('/sse', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const client = req.oncallsClient!;
    const sessionId = req.sessionId!;

    console.log(`[${SERVER_NAME}] New SSE connection: ${sessionId}`);

    // Create MCP server for this client
    const mcpServer = createMcpServer(client);

    // Create SSE transport
    const transport = new SSEServerTransport('/message', res);
    activeTransports.set(sessionId, transport);

    // Clean up on disconnect
    res.on('close', () => {
      console.log(`[${SERVER_NAME}] SSE connection closed: ${sessionId}`);
      activeTransports.delete(sessionId);
      mcpServer.close().catch(console.error);
    });

    // Connect MCP server to transport
    await mcpServer.connect(transport);
  });

  // Message endpoint for MCP messages
  app.post('/message', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = req.sessionId!;
    const transport = activeTransports.get(sessionId);

    if (!transport) {
      // No existing transport - this might be a new connection
      // Create a temporary server for this request
      const client = req.oncallsClient!;
      const mcpServer = createMcpServer(client);
      const tempTransport = new SSEServerTransport('/message', res);

      await mcpServer.connect(tempTransport);
      await tempTransport.handlePostMessage(req, res);
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  // Info endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      description: 'OnCalls MCP Server - Remote',
      endpoints: {
        sse: '/sse',
        message: '/message',
        health: '/health',
      },
      auth: {
        method: 'Headers or Bearer token',
        headers: ['X-OnCalls-Username', 'X-OnCalls-Password'],
        bearer: 'Base64 encoded username:password',
      },
    });
  });

  // Start server
  app.listen(port, () => {
    console.log(`[${SERVER_NAME}] Remote MCP server running on port ${port}`);
    console.log(`[${SERVER_NAME}] Health check: http://localhost:${port}/health`);
    console.log(`[${SERVER_NAME}] SSE endpoint: http://localhost:${port}/sse`);
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
