/**
 * Tool: list-pending-requests (Admin only)
 * Get pending requests awaiting approval
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { OncallsClient } from '../../auth/index.js';

export const listPendingRequestsSchema = z.object({
  requestType: z.string().optional().describe('Filter by request type name'),
});

export const listPendingRequestsDefinition = {
  name: 'list-pending-requests',
  description:
    '[ADMIN ONLY] View all pending shift requests awaiting approval. ' +
    'Shows who submitted each request, dates, and reasons. ' +
    'Use this to review and then approve or decline requests.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      requestType: {
        type: 'string',
        description: 'Optional: Filter to specific request type (e.g., "Day Off", "Switch")',
      },
    },
  },
};

// The get_all_requests endpoint returns monthRequest array
interface MonthRequestItem {
  DocID: number;
  IsApproved: boolean;
  isrejected: boolean;
  ReqDate: string;
  ReqID: number;
  abb_type: string;
  lname: string;
  pager: string;
  req_type: string;
  reqtypeid: number;
}

interface AllRequestsResponse {
  monthRequest: MonthRequestItem[];
}

export async function listPendingRequests(
  client: OncallsClient,
  args: z.infer<typeof listPendingRequestsSchema>
) {
  // Check admin permission
  if (!client.userContext.isAdmin) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Admin access required. Only administrators can view pending requests.'
    );
  }

  const { requestType } = args;

  // Use get_all_requests with docid=0 to get all group requests
  const response = await client.get<AllRequestsResponse>('/get_all_requests', {
    docid: 0,
    groupid: client.userContext.groupId,
    start_date: '2020-01-01',
    end_date: '2030-12-31',
  });

  // Filter to pending requests (not approved and not rejected)
  let requests = (response.monthRequest || []).filter(
    (r) => !r.IsApproved && !r.isrejected
  );

  // Filter by type if specified
  if (requestType) {
    requests = requests.filter((r) =>
      r.req_type.toLowerCase().includes(requestType.toLowerCase())
    );
  }

  const formattedRequests = requests.map((r) => ({
    id: r.ReqID,
    physician: r.lname,
    type: r.req_type,
    typeAbbr: r.abb_type,
    date: r.ReqDate,
  }));

  // Sort by date
  formattedRequests.sort((a, b) => a.date.localeCompare(b.date));

  return {
    pendingRequests: formattedRequests,
    totalPending: formattedRequests.length,
    message:
      formattedRequests.length > 0
        ? `${formattedRequests.length} pending request(s) awaiting your approval.`
        : 'No pending requests at this time.',
  };
}
