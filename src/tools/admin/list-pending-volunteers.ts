/**
 * Tool: list-pending-volunteers (Admin only)
 * Get pending volunteers awaiting approval
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { OncallsClient } from '../../auth/index.js';

export const listPendingVolunteersSchema = z.object({});

export const listPendingVolunteersDefinition = {
  name: 'list-pending-volunteers',
  description:
    '[ADMIN ONLY] View all pending volunteer submissions awaiting approval. ' +
    'Shows who volunteered for which shifts and dates. ' +
    'Note: This feature may not be available on all OnCalls deployments.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
};

interface VolunteerItem {
  id: number;
  docId?: number;
  doctorName?: string;
  lname?: string;
  date: string;
  shiftId?: number;
  shiftName?: string;
  status?: string;
  createdAt?: string;
}

interface PendingVolunteersResponse {
  volunteers?: VolunteerItem[];
  data?: VolunteerItem[];
  pending?: VolunteerItem[];
}

export async function listPendingVolunteers(
  client: OncallsClient,
  _args: z.infer<typeof listPendingVolunteersSchema>
) {
  // Check admin permission
  if (!client.userContext.isAdmin) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Admin access required. Only administrators can view pending volunteers.'
    );
  }

  try {
    const response = await client.get<PendingVolunteersResponse>('/get_pending_vols', {
      gid: client.userContext.groupId,
      pending: 1,
    });

    const volunteers = response.volunteers || response.data || response.pending || [];

    const formattedVolunteers = volunteers.map((v) => ({
      id: v.id,
      physician: v.doctorName || v.lname || 'Unknown',
      date: v.date,
      shift: v.shiftName || 'Unknown',
      submittedAt: v.createdAt,
    }));

    // Sort by date
    formattedVolunteers.sort((a, b) => a.date.localeCompare(b.date));

    return {
      pendingVolunteers: formattedVolunteers,
      totalPending: formattedVolunteers.length,
      message:
        formattedVolunteers.length > 0
          ? `${formattedVolunteers.length} pending volunteer(s) awaiting your approval.`
          : 'No pending volunteers at this time.',
    };
  } catch (error) {
    // This endpoint may not be available on all OnCalls deployments
    return {
      pendingVolunteers: [],
      totalPending: 0,
      message: 'Volunteer management feature not available on this OnCalls deployment.',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
