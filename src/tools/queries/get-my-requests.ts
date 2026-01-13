/**
 * Tool: get-my-requests
 * Get the user's submitted requests
 */

import { z } from 'zod';
import type { OncallsClient } from '../../auth/index.js';

export const getMyRequestsSchema = z.object({
  status: z
    .enum(['pending', 'approved', 'rejected', 'all'])
    .optional()
    .describe('Filter by request status. Defaults to "all".'),
});

export const getMyRequestsDefinition = {
  name: 'get-my-requests',
  description:
    'Get your submitted shift requests (day off, switch requests, etc.). ' +
    'Shows request status, dates, and details. ' +
    'Use this to check on pending requests or see request history.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['pending', 'approved', 'rejected', 'all'],
        description: 'Filter by status. Defaults to showing all requests.',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
};

// The get_all_requests API returns monthRequest array
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

export async function getMyRequests(
  client: OncallsClient,
  args: z.infer<typeof getMyRequestsSchema>
) {
  const { status = 'all' } = args;

  const response = await client.get<AllRequestsResponse>('/get_all_requests', {
    docid: client.userContext.docId,
    groupid: client.userContext.groupId,
    start_date: '2020-01-01',
    end_date: '2030-12-31',
  });

  let requests = (response.monthRequest || []).filter((r) => r.DocID === client.userContext.docId);

  // Filter by status if specified
  if (status === 'pending') {
    requests = requests.filter((r) => !r.IsApproved && !r.isrejected);
  } else if (status === 'approved') {
    requests = requests.filter((r) => r.IsApproved);
  } else if (status === 'rejected') {
    requests = requests.filter((r) => r.isrejected);
  }

  const formattedRequests = requests.map((r) => ({
    id: r.ReqID,
    type: r.req_type,
    typeAbbr: r.abb_type,
    date: r.ReqDate,
    status: r.IsApproved ? 'approved' : r.isrejected ? 'rejected' : 'pending',
  }));

  // Sort by date descending
  formattedRequests.sort((a, b) => b.date.localeCompare(a.date));

  return {
    user: `${client.userContext.firstName} ${client.userContext.lastName}`,
    filter: status,
    requests: formattedRequests,
    totalRequests: formattedRequests.length,
  };
}
