/**
 * OnCalls API Types
 * Types matching the OnCalls Flask API responses
 */

export interface UserContext {
  docId: number;
  groupId: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
  viewReqs: boolean;
}

export interface LoginResponse {
  status: string;
  message?: string;
  access_token: string;
  refresh_token: string;
  user: {
    docid: number;
    groupid: number;
    Login: string;
    fname: string;
    lname: string;
    email: string;
    Admin: boolean;
    ViewReqs: boolean;
  };
}

export interface RefreshResponse {
  access_token: string;
}

export interface Shift {
  id: number;
  name: string;
  shortName: string;
  color: string;
  groupId: number;
}

export interface Member {
  docid: number;
  fname: string;
  lname: string;
  Login: string;
  email: string;
  HomePhone: string | null;
  pager: string | null;
  Admin: boolean;
  isdoc: boolean;
  GroupId: number;
}

export interface ScheduleEntry {
  date: string;
  shiftId: number;
  shiftName: string;
  docId: number;
  firstName: string;
  lastName: string;
  phone?: string;
  pager?: string;
}

export interface DayScheduleResponse {
  date: string;
  shifts: ScheduleEntry[];
}

export interface MonthScheduleResponse {
  startDate: string;
  endDate: string;
  schedule: Record<string, ScheduleEntry[]>;
}

export interface Request {
  id: number;
  DocID: number;
  doctorName: string;
  ReqTypeID: number;
  reqTypeName: string;
  StartDate: string;
  EndDate: string;
  Reason: string | null;
  Status: 'pending' | 'approved' | 'rejected';
  CreatedAt: string;
}

export interface RequestType {
  ReqTypeID: number;
  name: string;
  GroupId: number;
  deleted: boolean;
}

export interface Volunteer {
  id: number;
  docId: number;
  doctorName: string;
  date: string;
  shiftId: number;
  shiftName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface ShiftReport {
  startDate: string;
  endDate: string;
  totalShifts: number;
  coverageByShift: Record<string, number>;
  coverageByDoctor: Record<string, number>;
}

export interface VolunteerReport {
  startDate: string;
  endDate: string;
  totalVolunteers: number;
  approvedCount: number;
  pendingCount: number;
  byDoctor: Record<string, number>;
}

export interface ApiError {
  status: string;
  message: string;
  code?: string;
}
