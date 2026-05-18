import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type Ticket, workshopRowToDisplay } from '@/types/workshop';
import { api } from '@/lib/api-client';

interface RegistrationRow {
  id: string;
  mssv: string;
  workshop_id: string;
  status: string;
  qr_token: string | null;
  qr_image?: string;
  expires_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  workshops?: {
    id: string;
    title: string;
    room: string;
    start_time: string;
    end_time: string;
    fee_vnd: number;
    speaker_name: string;
  };
}

interface TicketsContextType {
  myTickets: Ticket[];
  addTicket: (ticket: Ticket) => void;
  loadTickets: () => Promise<void>;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

function getTicketStatus(registrationStatus: string, startTime: string, endTime: string): Ticket['status'] {
  if (registrationStatus === 'cancelled') return 'cancelled';

  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) return 'upcoming';
  if (now <= end) return 'ongoing';
  return 'completed';
}

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);

  const addTicket = (ticket: Ticket) => {
    setMyTickets((prev) => {
      const exists = prev.some(t => t.registration_id === ticket.registration_id);
      if (exists) return prev;
      return [ticket, ...prev];
    });
  };

  const loadTickets = useCallback(async () => {
    try {
      const rows = await api.get<RegistrationRow[]>('/registrations/me');
      const tickets: Ticket[] = rows
        .filter(r => r.status !== 'expired' && r.workshops)
        .map(r => {
          const ws = r.workshops!;
          const display = workshopRowToDisplay({
            id: ws.id,
            title: ws.title,
            description: null,
            speaker_name: ws.speaker_name,
            speaker_bio: null,
            room: ws.room,
            cover_image_url: null,
            room_map_url: null,
            start_time: ws.start_time,
            end_time: ws.end_time,
            capacity: 0,
            seats_remaining: 0,
            fee_vnd: ws.fee_vnd,
            pdf_url: null,
            summary_md: null,
            summary_generated_at: null,
            summary_status: 'idle',
            summary_attempts: 0,
            summary_error_code: null,
            summary_error_message: null,
            is_published: true,
            cancelled_at: null,
            created_at: '',
            updated_at: '',
          });
          return {
            id: r.qr_token ?? r.id,
            registration_id: r.id,
            workshop: display,
            status: getTicketStatus(r.status, ws.start_time, ws.end_time),
            qr_image: r.qr_image,
          };
        });
      setMyTickets(tickets);
    } catch {
      // silently ignore — tickets remain as-is (e.g. user not student)
    }
  }, []);

  return (
    <TicketsContext.Provider value={{ myTickets, addTicket, loadTickets }}>
      {children}
    </TicketsContext.Provider>
  );
}

export function useTickets() {
  const context = useContext(TicketsContext);
  if (context === undefined) {
    throw new Error('useTickets must be used within a TicketsProvider');
  }
  return context;
}
