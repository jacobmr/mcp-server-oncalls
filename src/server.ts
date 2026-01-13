/**
 * OnCalls MCP Server
 * Main server implementation using MCP SDK
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { OncallsClient } from './auth/index.js';
import { getToolsForUser, findTool } from './tools/index.js';
import { toMcpError } from './utils/index.js';

const SERVER_NAME = 'oncalls';
const SERVER_VERSION = '1.1.0';

export interface ServerConfig {
  oncallsApiUrl: string;
  oncallsUsername: string;
  oncallsPassword: string;
}

/**
 * Create and configure the MCP server
 */
export async function createServer(config: ServerConfig): Promise<Server> {
  // Create OnCalls API client
  const client = new OncallsClient({
    baseUrl: config.oncallsApiUrl,
    username: config.oncallsUsername,
    password: config.oncallsPassword,
  });

  // Authenticate on startup
  console.error(`[${SERVER_NAME}] Authenticating with OnCalls API...`);
  await client.authenticate();
  console.error(`[${SERVER_NAME}] Authentication successful`);

  // Create MCP server
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
    console.error(
      `[${SERVER_NAME}] Listing ${tools.length} tools (admin: ${client.userContext.isAdmin})`
    );

    return {
      tools: tools.map((tool) => tool.definition),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[${SERVER_NAME}] Calling tool: ${name}`);

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
 * Run the MCP server with stdio transport
 */
export async function runServer(config: ServerConfig): Promise<void> {
  const server = await createServer(config);
  const transport = new StdioServerTransport();

  console.error(`[${SERVER_NAME}] Starting MCP server...`);
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server connected and ready`);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    await server.close();
    process.exit(0);
  });
}
