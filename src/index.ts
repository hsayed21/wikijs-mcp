#!/usr/bin/env node

/**
 * Wiki.js MCP Server
 *
 * Provides Model Context Protocol (MCP) tools for interacting with Wiki.js GraphQL API
 *
 * @author Markus Michalski
 * @license MIT
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

import { WikiJsClient } from './services/client.js';
import {
  getPageToolDefinition,
  handleGetPage,
  getTreeToolDefinition,
  handleGetTree,
  listPagesToolDefinition,
  handleListPages,
  searchPagesToolDefinition,
  handleSearchPages,
} from './tools/index.js';

const SERVER_VERSION = '2.0.1';

// Load environment variables from deployment directory
const envPath = join(homedir(), '.claude', 'mcp-servers', 'wikijs', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Fallback to CWD for development
  dotenv.config();
}

// Validate required environment variables
const WIKIJS_API_URL = process.env.WIKIJS_API_URL;
const WIKIJS_API_TOKEN =
  process.env.WIKIJS_API_TOKEN ?? process.env.WIKIJS_TOKEN ?? process.env.WIKIJS_API_KEY;

if (!WIKIJS_API_URL || !WIKIJS_API_TOKEN) {
  console.error('Error: Missing required environment variables');
  console.error('Please ensure WIKIJS_API_URL and WIKIJS_API_TOKEN are set in .env file');
  process.exit(1);
}

// Initialize Wiki.js client
const wikiClient = new WikiJsClient(WIKIJS_API_URL, WIKIJS_API_TOKEN);

// Create MCP server with modern API
const server = new McpServer({
  name: 'wikijs-mcp-server',
  version: SERVER_VERSION,
});

// Register tools using modern registerTool API
server.tool(
  getPageToolDefinition.name,
  getPageToolDefinition.description,
  getPageToolDefinition.inputSchema.shape,
  async (args) => handleGetPage(wikiClient, args)
);

server.tool(
  listPagesToolDefinition.name,
  listPagesToolDefinition.description,
  listPagesToolDefinition.inputSchema.shape,
  async (args) => handleListPages(wikiClient, args)
);

server.tool(
  getTreeToolDefinition.name,
  getTreeToolDefinition.description,
  getTreeToolDefinition.inputSchema.shape,
  async (args) => handleGetTree(wikiClient, args)
);

server.tool(
  searchPagesToolDefinition.name,
  searchPagesToolDefinition.description,
  searchPagesToolDefinition.inputSchema.shape,
  async (args) => handleSearchPages(wikiClient, args)
);

// Graceful shutdown handling
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`Received ${signal}, shutting down gracefully...`);
  try {
    await server.close();
    console.error('Wiki.js MCP Server shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Setup signal handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error: Error & { code?: string }) => {
  // Don't log EPIPE errors (broken pipe when client disconnects)
  if (error.code !== 'EPIPE') {
    console.error('Uncaught exception:', error);
  }
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const host = new URL(WIKIJS_API_URL!).hostname;
  console.error(`Wiki.js MCP Server v${SERVER_VERSION} running on stdio`);
  console.error(`Connected to: ${host}`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
