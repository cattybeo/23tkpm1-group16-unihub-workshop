export type StaffWorkshopState = 'ongoing' | 'upcoming' | 'ended';

export interface StaffWorkshop {
  id: string;
  title: string;
  room: string;
  startTime: string;
  endTime: string;
  capacity: number;
  registered: number;
}

export type StaffStudentStatus = 'confirmed' | 'pending_payment' | 'checked_in' | 'queued';

export interface StaffStudent {
  registration_id: string;
  mssv: string;
  name: string;
  status: StaffStudentStatus;
  qr_token: string | null;
}

export type OfflineCheckInStatus = 'pending' | 'synced' | 'failed';

export interface OfflineCheckInRecord {
  client_id: string;
  qr_token: string;
  workshop_id: string;
  scanned_at: string;
  status: OfflineCheckInStatus;
}

export interface StaffRosterCache {
  workshop_id: string;
  fetched_at: string;
  students: StaffStudent[];
}

export interface StaffWorkshopCache {
  date_key: string;
  fetched_at: string;
  workshops: StaffWorkshop[];
}

export type ScanFeedback =
  | { status: 'idle' }
  | { status: 'success'; title: string; message: string; token: string }
  | { status: 'queued'; title: string; message: string; token: string }
  | { status: 'error'; title: string; message: string };

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';
