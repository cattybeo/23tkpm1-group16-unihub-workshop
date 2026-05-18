export interface Workshop {
  id: string;
  title: string;
  speaker: string;
  day: string;
  time: string;
  room: string;
  capacity: number;
  booked: number;
  price: number;
  isFree: boolean;
  image: string;
  aiSummary: string;
  cover_image_url?: string;
  room_map_url?: string;
  start_time?: string;
  end_time?: string;
}

// Backend DB row shape (snake_case) returned by GET /api/v1/workshops
export interface WorkshopRow {
  id: string;
  title: string;
  description: string | null;
  speaker_name: string;
  speaker_bio: string | null;
  room: string;
  cover_image_url: string | null;
  room_map_url: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  seats_remaining: number;
  fee_vnd: number;
  pdf_url: string | null;
  summary_md: string | null;
  summary_generated_at: string | null;
  summary_status: 'idle' | 'processing' | 'completed' | 'failed' | null;
  summary_attempts: number | null;
  summary_error_code: string | null;
  summary_error_message: string | null;
  is_published: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export function workshopRowToDisplay(w: WorkshopRow): Workshop {
  const start = new Date(w.start_time);
  const end = new Date(w.end_time);
  const dayStr = start.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = `${start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  return {
    id: w.id,
    title: w.title,
    speaker: w.speaker_name,
    day: dayStr,
    time: timeStr,
    room: w.room,
    capacity: w.capacity,
    booked: w.capacity - w.seats_remaining,
    price: w.fee_vnd,
    isFree: w.fee_vnd === 0,
    image: w.cover_image_url ?? '',
    aiSummary: w.summary_md ?? '',
    cover_image_url: w.cover_image_url ?? undefined,
    room_map_url: w.room_map_url ?? undefined,
    start_time: w.start_time,
    end_time: w.end_time,
  };
}

export interface Ticket {
  id: string;
  registration_id?: string;
  workshop: Workshop;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  qr_image?: string;
}
