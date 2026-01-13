/**
 * Tool: get-my-schedule
 * Get the authenticated user's own schedule
 */

import { z } from 'zod';
import type { OncallsClient } from '../../auth/index.js';
import { startOfMonth, endOfMonth } from '../../utils/index.js';

export const getMyScheduleSchema = z.object({
  startDate: z
    .string()
    .optional()
    .describe('Start date in YYYY-MM-DD format. Defaults to start of current month.'),
  endDate: z
    .string()
    .optional()
    .describe('End date in YYYY-MM-DD format. Defaults to end of current month.'),
});

export const getMyScheduleDefinition = {
  name: 'get-my-schedule',
  description:
    'Get your own on-call schedule for a date range. ' +
    'Shows all shifts you are assigned to. ' +
    'Use this to answer questions like "What is my schedule this month?" or "When am I on call next week?"',
  inputSchema: {
    type: 'object' as const,
    properties: {
      startDate: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format. Defaults to start of current month.',
      },
      endDate: {
        type: 'string',
        description: 'End date in YYYY-MM-DD format. Defaults to end of current month.',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
};

// The month_schedule API returns lname as an object: { "1": ["Name"] }
interface LnameMap {
  [index: string]: string[];
}

interface ShiftOnDate {
  callabr: string;
  id: number;
  index: number | null;
  lname: LnameMap;
  lnameFull?: LnameMap;
  maxsize: number;
  special: boolean;
}

interface DateShiftEntry {
  date: string;
  shifts: ShiftOnDate[];
  specialDay: boolean;
}

interface MonthScheduleResponse {
  data: {
    date_shifts: DateShiftEntry[];
    month_lnames: Array<{ dates: string; id: number; lname: string }>;
    user_group: string;
  };
  message: string;
}

export async function getMySchedule(
  client: OncallsClient,
  args: z.infer<typeof getMyScheduleSchema>
) {
  const { startDate = startOfMonth(), endDate = endOfMonth() } = args;

  // Calculate weeks between dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const weeks = Math.ceil(diffDays / 7);

  const response = await client.get<MonthScheduleResponse>('/month_schedule', {
    date: startDate,
    groupId: client.userContext.groupId,
    docId: client.userContext.docId,
    weeks: weeks,
    viewreq: 'false',
    cluster: '0',
  });

  const dateShifts = response.data?.date_shifts || [];
  const userName = `${client.userContext.firstName} ${client.userContext.lastName}`;
  const userLastName = client.userContext.lastName.toLowerCase();

  // Helper to extract all names from lname object format {"1": ["Name"]}
  const extractNames = (lnameMap: LnameMap): string[] => {
    const names: string[] = [];
    for (const key in lnameMap) {
      const arr = lnameMap[key];
      if (Array.isArray(arr)) {
        names.push(...arr);
      }
    }
    return names;
  };

  // Filter to only shifts assigned to the current user
  const myShifts: Array<{ date: string; shift: string; shiftAbbr: string }> = [];

  for (const entry of dateShifts) {
    if (entry.date < startDate || entry.date > endDate) continue;

    for (const shift of entry.shifts || []) {
      // Extract all assigned names from lname/lnameFull
      const assignedNames = extractNames(shift.lnameFull || shift.lname || {});

      // Check if current user is assigned to this shift
      const isAssigned = assignedNames.some((name) => name.toLowerCase().includes(userLastName));

      if (isAssigned) {
        myShifts.push({
          date: entry.date,
          shift: shift.callabr,
          shiftAbbr: shift.callabr,
        });
      }
    }
  }

  // Sort by date
  myShifts.sort((a, b) => a.date.localeCompare(b.date));

  return {
    user: userName,
    startDate,
    endDate,
    groupName: response.data?.user_group || 'Unknown',
    shifts: myShifts,
    totalShifts: myShifts.length,
  };
}
