/**
 * Error Handling Utilities
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Create an MCP error from various error types
 */
export function toMcpError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes('Authentication failed') || error.message.includes('401')) {
      return new McpError(
        ErrorCode.InvalidRequest,
        'Authentication failed. Check your OnCalls credentials.'
      );
    }
    if (error.message.includes('403') || error.message.includes('permission')) {
      return new McpError(
        ErrorCode.InvalidRequest,
        'Permission denied. You may not have access to this resource.'
      );
    }
    if (error.message.includes('404') || error.message.includes('not found')) {
      return new McpError(ErrorCode.InvalidRequest, 'Resource not found.');
    }
    if (error.message.includes('Invalid date')) {
      return new McpError(ErrorCode.InvalidParams, error.message);
    }
    return new McpError(ErrorCode.InternalError, error.message);
  }

  return new McpError(ErrorCode.InternalError, 'An unexpected error occurred');
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return async (...args: A): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      throw toMcpError(error);
    }
  };
}
