/**
 * Tool: get-physician-contact
 * Get contact information for a physician
 */

import { z } from 'zod';
import type { OncallsClient } from '../../auth/index.js';

export const getPhysicianContactSchema = z.object({
  physicianName: z
    .string()
    .describe('Name of the physician to look up (e.g., "Dr. Smith" or "Smith")'),
});

export const getPhysicianContactDefinition = {
  name: 'get-physician-contact',
  description:
    'Get contact information (phone, pager, email) for a physician in your group. ' +
    'Use this to answer questions like "What is Dr. Smith\'s phone number?" or "How do I reach the on-call physician?"',
  inputSchema: {
    type: 'object' as const,
    properties: {
      physicianName: {
        type: 'string',
        description: 'Name of the physician to look up. Can be full name or last name only.',
      },
    },
    required: ['physicianName'],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
};

interface MemberItem {
  Admin: boolean;
  fname: string;
  lname: string;
  Login: string;
  email: string;
  HomePhone?: string;
  pager?: string;
  docid: number;
  GroupId: number;
  ViewReqs: boolean;
  isdoc: boolean;
}

interface MembersResponse {
  status: boolean;
  message: string;
  data: MemberItem[];
}

export async function getPhysicianContact(
  client: OncallsClient,
  args: z.infer<typeof getPhysicianContactSchema>
) {
  const { physicianName } = args;

  const response = await client.get<MembersResponse>('/members', {
    groupId: client.userContext.groupId,
  });

  const members = response.data || [];
  const searchName = physicianName.toLowerCase().replace(/^dr\.?\s*/i, '');

  // Find matching physician
  const matches = members.filter((m) => {
    const fullName = `${m.fname} ${m.lname}`.toLowerCase();
    const lastName = m.lname.toLowerCase();
    return fullName.includes(searchName) || lastName === searchName;
  });

  if (matches.length === 0) {
    return {
      found: false,
      message: `No physician found matching "${physicianName}" in your group.`,
      suggestion: 'Try using just the last name, or check spelling.',
    };
  }

  if (matches.length > 1) {
    return {
      found: true,
      multipleMatches: true,
      message: `Multiple physicians found matching "${physicianName}". Please be more specific.`,
      matches: matches.map((m) => ({
        name: `${m.fname} ${m.lname}`,
        email: m.email,
      })),
    };
  }

  const physician = matches[0];
  return {
    found: true,
    physician: {
      name: `${physician.fname} ${physician.lname}`,
      email: physician.email,
      phone: physician.HomePhone || null,
      pager: physician.pager || null,
      isAdmin: physician.Admin,
    },
  };
}
