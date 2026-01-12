/**
 * Tools Index
 * Exports all MCP tools with their definitions, schemas, and handlers
 */

import type { OncallsClient } from '../auth/index.js';

// Query tools (all users)
import {
  getOncallSchedule,
  getOncallScheduleSchema,
  getOncallScheduleDefinition,
  getMySchedule,
  getMyScheduleSchema,
  getMyScheduleDefinition,
  getPhysicianContact,
  getPhysicianContactSchema,
  getPhysicianContactDefinition,
  getShiftTypes,
  getShiftTypesSchema,
  getShiftTypesDefinition,
  getMyRequests,
  getMyRequestsSchema,
  getMyRequestsDefinition,
} from './queries/index.js';

// Admin query tools
import {
  listPendingRequests,
  listPendingRequestsSchema,
  listPendingRequestsDefinition,
  listPendingVolunteers,
  listPendingVolunteersSchema,
  listPendingVolunteersDefinition,
  listMembers,
  listMembersSchema,
  listMembersDefinition,
} from './admin/index.js';

export interface Tool {
  name: string;
  definition: {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  schema: unknown;
  handler: (client: OncallsClient, args: unknown) => Promise<unknown>;
  adminOnly: boolean;
}

/**
 * All available tools (both user and admin)
 */
export const allTools: Tool[] = [
  // User query tools
  {
    name: 'get-oncall-schedule',
    definition: getOncallScheduleDefinition,
    schema: getOncallScheduleSchema,
    handler: getOncallSchedule,
    adminOnly: false,
  },
  {
    name: 'get-my-schedule',
    definition: getMyScheduleDefinition,
    schema: getMyScheduleSchema,
    handler: getMySchedule,
    adminOnly: false,
  },
  {
    name: 'get-physician-contact',
    definition: getPhysicianContactDefinition,
    schema: getPhysicianContactSchema,
    handler: getPhysicianContact,
    adminOnly: false,
  },
  {
    name: 'get-shift-types',
    definition: getShiftTypesDefinition,
    schema: getShiftTypesSchema,
    handler: getShiftTypes,
    adminOnly: false,
  },
  {
    name: 'get-my-requests',
    definition: getMyRequestsDefinition,
    schema: getMyRequestsSchema,
    handler: getMyRequests,
    adminOnly: false,
  },
  // Admin query tools
  {
    name: 'list-pending-requests',
    definition: listPendingRequestsDefinition,
    schema: listPendingRequestsSchema,
    handler: listPendingRequests,
    adminOnly: true,
  },
  {
    name: 'list-pending-volunteers',
    definition: listPendingVolunteersDefinition,
    schema: listPendingVolunteersSchema,
    handler: listPendingVolunteers,
    adminOnly: true,
  },
  {
    name: 'list-members',
    definition: listMembersDefinition,
    schema: listMembersSchema,
    handler: listMembers,
    adminOnly: true,
  },
];

/**
 * Get tools available for a user based on admin status
 */
export function getToolsForUser(isAdmin: boolean): Tool[] {
  if (isAdmin) {
    return allTools;
  }
  return allTools.filter((tool) => !tool.adminOnly);
}

/**
 * Find a tool by name
 */
export function findTool(name: string): Tool | undefined {
  return allTools.find((tool) => tool.name === name);
}
