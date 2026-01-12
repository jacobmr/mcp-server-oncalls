/**
 * Tool: get-shift-types
 * Get available shift types for the user's group
 */

import { z } from 'zod';
import type { OncallsClient } from '../../auth/index.js';

export const getShiftTypesSchema = z.object({});

export const getShiftTypesDefinition = {
  name: 'get-shift-types',
  description:
    'Get a list of all shift types available in your medical group. ' +
    'Shows shift names, abbreviations, and colors. ' +
    'Use this to understand what shifts are available when volunteering or viewing schedules.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

interface ShiftLegendItem {
  id: number;
  callfull: string;
  callabr: string;
  sortorder?: number;
}

interface ShiftLegendResponse {
  status: boolean;
  message: string;
  data: ShiftLegendItem[];
}

export async function getShiftTypes(
  client: OncallsClient,
  _args: z.infer<typeof getShiftTypesSchema>
) {
  const response = await client.get<ShiftLegendResponse>('/shiftLegend', {
    groupId: client.userContext.groupId,
  });

  const shifts = response.data || [];

  const shiftTypes = shifts.map((s) => ({
    id: s.id,
    name: s.callfull,
    abbreviation: s.callabr,
    sortOrder: s.sortorder,
  }));

  return {
    groupId: client.userContext.groupId,
    shiftTypes,
    totalTypes: shiftTypes.length,
  };
}
