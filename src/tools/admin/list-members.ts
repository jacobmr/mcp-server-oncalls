/**
 * Tool: list-members (Admin only)
 * Get all members in the group
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { OncallsClient } from '../../auth/index.js';
import type { Member } from '../../types/index.js';

export const listMembersSchema = z.object({
  includeContact: z
    .boolean()
    .optional()
    .describe('Include contact information (phone, email). Defaults to false.'),
});

export const listMembersDefinition = {
  name: 'list-members',
  description:
    '[ADMIN ONLY] Get a list of all physicians and staff in your medical group. ' +
    'Shows names, roles, and optionally contact information. ' +
    'Use this to see who is in your group or look up member details.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      includeContact: {
        type: 'boolean',
        description: 'Include contact information (phone, email). Defaults to false for privacy.',
      },
    },
  },
};

interface MembersResponse {
  members?: Member[];
  data?: Member[];
}

export async function listMembers(
  client: OncallsClient,
  args: z.infer<typeof listMembersSchema>
) {
  // Check admin permission
  if (!client.userContext.isAdmin) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Admin access required. Only administrators can view the full member list.'
    );
  }

  const { includeContact = false } = args;

  const response = await client.get<MembersResponse>('/members', {
    groupId: client.userContext.groupId,
  });

  const members = response.members || response.data || [];

  const formattedMembers = members.map((m) => {
    const base = {
      id: m.docid,
      name: `${m.fname} ${m.lname}`,
      username: m.Login,
      isAdmin: m.Admin,
      isPhysician: m.isdoc,
    };

    if (includeContact) {
      return {
        ...base,
        email: m.email,
        phone: m.HomePhone,
        pager: m.pager,
      };
    }

    return base;
  });

  // Sort by name
  formattedMembers.sort((a, b) => a.name.localeCompare(b.name));

  const physicians = formattedMembers.filter((m) => m.isPhysician);
  const admins = formattedMembers.filter((m) => m.isAdmin);

  return {
    groupId: client.userContext.groupId,
    members: formattedMembers,
    totalMembers: formattedMembers.length,
    totalPhysicians: physicians.length,
    totalAdmins: admins.length,
  };
}
