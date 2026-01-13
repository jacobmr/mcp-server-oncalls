/**
 * Tool: get-oncall-schedule
 * Get the on-call schedule for a specific date
 */

import { z } from 'zod';
import type { OncallsClient } from '../../auth/index.js';
import { today } from '../../utils/index.js';

export const getOncallScheduleSchema = z.object({
  date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
  shiftType: z.string().optional().describe('Filter by shift type name (e.g., "OB-GYN", "Night")'),
});

export const getOncallScheduleDefinition = {
  name: 'get-oncall-schedule',
  description:
    'Get the on-call schedule showing which physicians are on call for a specific date. ' +
    'Returns physician names, shift types, and contact information. ' +
    'Use this to answer questions like "Who is on call today?" or "Who has the OB-GYN shift tonight?"',
  inputSchema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format. Defaults to today if not specified.',
      },
      shiftType: {
        type: 'string',
        description:
          'Optional: Filter results to a specific shift type (e.g., "OB-GYN", "Night Shift")',
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
};

interface ShiftData {
  id: number;
  callfull: string;
  callabr: string;
  lname?: string;
  index?: number | null;
}

interface ScheduleResponse {
  data: {
    shift_data: ShiftData[];
    group_name: string;
    day_lnames?: Array<{ id: number; lname: string; dates: string }>;
  };
  message: string;
}

export async function getOncallSchedule(
  client: OncallsClient,
  args: z.infer<typeof getOncallScheduleSchema>
) {
  const { date = today(), shiftType } = args;

  const response = await client.get<ScheduleResponse>('/day_schedule', {
    date,
    groupId: client.userContext.groupId,
    docId: client.userContext.docId,
  });

  const shifts = response.data?.shift_data || [];

  const filteredShifts = shiftType
    ? shifts.filter((s) => {
        const name = s.callfull || s.callabr || '';
        return name.toLowerCase().includes(shiftType.toLowerCase());
      })
    : shifts;

  const oncall = filteredShifts.map((s) => ({
    shift: s.callfull || s.callabr || 'Unknown',
    shiftAbbr: s.callabr || null,
    physician: s.lname || 'Unassigned',
  }));

  return {
    date,
    groupName: response.data?.group_name || 'Unknown',
    groupId: client.userContext.groupId,
    oncall,
    totalShifts: oncall.length,
  };
}
