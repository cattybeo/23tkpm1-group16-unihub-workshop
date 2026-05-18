import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar, ChevronRight, Clock3, MapPin, QrCode, Ticket as TicketIcon, X } from 'lucide-react';
import { useTickets } from '@/lib/tickets-context';
import type { Ticket } from '@/types/workshop';

const STATUS_META: Record<Ticket['status'], { label: string; className: string }> = {
  upcoming: { label: 'Sắp diễn ra', className: 'text-[#007AFF] bg-[#007AFF]/10' },
  ongoing: { label: 'Đang diễn ra', className: 'text-[#34C759] bg-[#34C759]/10' },
  completed: { label: 'Đã kết thúc', className: 'text-[#8E8E93] bg-[#8E8E93]/10' },
  cancelled: { label: 'Đã huỷ', className: 'text-[#FF3B30] bg-[#FF3B30]/10' },
};

function TicketQr({ ticket, size = 'large' }: { ticket: Ticket; size?: 'small' | 'large' }) {
  const qrClassName = size === 'large' ? 'w-[176px] h-[176px]' : 'w-[38px] h-[38px]';

  return ticket.qr_image ? (
    <img src={ticket.qr_image} alt="QR code" className={qrClassName} />
  ) : (
    <QrCode className={`${qrClassName} text-[#1C1C1E]`} />
  );
}

interface TicketDetailModalProps {
  ticket: Ticket;
  onClose: () => void;
}

function TicketDetailModal({ ticket, onClose }: TicketDetailModalProps) {
  const status = STATUS_META[ticket.status];

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 px-[14px] py-[18px] sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="w-full max-w-lg max-h-[calc(100vh-36px)] overflow-y-auto rounded-[22px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.22)] animate-in slide-in-from-bottom-4 duration-200"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết vé"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#F2F2F7] bg-white px-[18px] py-[14px]">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#8E8E93]">Chi tiết vé</p>
            <p className="mt-[2px] font-mono text-[13px] font-semibold text-[#1C1C1E]">
              {(ticket.registration_id ?? ticket.id).slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-[44px] w-[44px] rounded-full bg-[#F2F2F7] text-[#1C1C1E] flex items-center justify-center hover:bg-[#E5E5EA] transition-colors"
            aria-label="Đóng chi tiết vé"
          >
            <X className="h-[20px] w-[20px]" />
          </button>
        </div>

        <div className="p-[18px]">
          <span className={`inline-flex rounded-full px-[12px] py-[7px] text-[13px] font-bold uppercase ${status.className}`}>
            {status.label}
          </span>
          <h2 className="mt-[12px] text-[22px] font-bold leading-tight tracking-tight text-[#1C1C1E]">
            {ticket.workshop.title}
          </h2>
          <p className="mt-[6px] text-[15px] font-medium text-[#8E8E93]">{ticket.workshop.speaker}</p>

          <div className="mt-[18px] grid grid-cols-1 gap-[10px] sm:grid-cols-2">
            <div className="rounded-[16px] bg-[#F2F2F7] p-[14px]">
              <div className="mb-[10px] flex items-center gap-[8px] text-[#8E8E93]">
                <Clock3 className="h-[18px] w-[18px]" />
                <p className="text-[13px] font-bold uppercase tracking-wide">Thời gian</p>
              </div>
              <p className="text-[17px] font-bold text-[#1C1C1E]">{ticket.workshop.time}</p>
              <p className="mt-[2px] text-[14px] font-medium text-[#8E8E93]">{ticket.workshop.day}</p>
            </div>
            <div className="rounded-[16px] bg-[#F2F2F7] p-[14px]">
              <div className="mb-[10px] flex items-center gap-[8px] text-[#8E8E93]">
                <MapPin className="h-[18px] w-[18px]" />
                <p className="text-[13px] font-bold uppercase tracking-wide">Địa điểm</p>
              </div>
              <p className="text-[17px] font-bold text-[#1C1C1E]">{ticket.workshop.room}</p>
            </div>
          </div>

          <div className="mt-[18px] rounded-[20px] bg-[#F2F2F7] p-[20px] text-center">
            <div className="mx-auto mb-[12px] w-fit rounded-[18px] bg-white p-[14px] shadow-sm">
              <TicketQr ticket={ticket} />
            </div>
            <p className="text-[15px] font-bold text-[#1C1C1E]">Quét để Check-in</p>
            <p className="mt-[4px] text-[13px] font-medium text-[#8E8E93]">
              Xuất trình mã này cho nhân viên tại phòng workshop.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function MyTicketsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { myTickets, loadTickets } = useTickets();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const routeState = (location.state ?? {}) as { openRegistrationId?: string };

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!routeState.openRegistrationId || selectedTicket) return;
    const ticket = myTickets.find(item => item.registration_id === routeState.openRegistrationId);
    if (!ticket) return;
    setSelectedTicket(ticket);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, myTickets, navigate, routeState.openRegistrationId, selectedTicket]);

  return (
    <div className="mx-auto w-full max-w-3xl px-[18px] py-[34px] animate-in fade-in duration-500 pb-[110px]">
      <div className="mb-[22px]">
        <h1 className="text-[32px] font-bold text-[#1C1C1E] tracking-tight">Vé đã lưu</h1>
        <p className="mt-[6px] text-[15px] font-medium text-[#8E8E93]">
          Chọn một vé để xem QR check-in và thông tin chi tiết.
        </p>
      </div>

      {myTickets.length === 0 ? (
        <div className="rounded-[24px] bg-white px-[20px] py-[64px] text-center shadow-[0_6px_22px_rgba(0,0,0,0.05)]">
          <div className="w-[80px] h-[80px] bg-[#F2F2F7] rounded-[24px] flex items-center justify-center mx-auto mb-[20px]">
            <TicketIcon className="w-[40px] h-[40px] text-[#C7C7CC]" />
          </div>
          <p className="text-[17px] font-medium text-[#1C1C1E] mb-[8px]">Chưa có vé nào</p>
          <p className="text-[15px] text-[#8E8E93] mb-[24px]">Các vé workshop bạn đăng ký sẽ xuất hiện ở đây.</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-[17px] font-semibold text-[#007AFF] bg-[#007AFF]/10 px-[20px] py-[10px] rounded-full"
          >
            Tìm workshop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[12px]">
          {myTickets.map(ticket => {
            const status = STATUS_META[ticket.status];
            return (
              <button
                key={ticket.registration_id ?? ticket.id}
                type="button"
                onClick={() => setSelectedTicket(ticket)}
                className="group w-full overflow-hidden rounded-[18px] bg-white text-left shadow-[0_4px_18px_rgba(0,0,0,0.045)] transition-all hover:-translate-y-[1px] hover:shadow-[0_10px_26px_rgba(0,0,0,0.075)] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                aria-label={`Mở chi tiết vé ${ticket.workshop.title}`}
              >
                <div className="flex items-stretch">
                  <div className={`w-[5px] shrink-0 ${
                    ticket.status === 'ongoing'
                      ? 'bg-[#34C759]'
                      : ticket.status === 'upcoming'
                        ? 'bg-[#007AFF]'
                        : ticket.status === 'cancelled'
                          ? 'bg-[#FF3B30]'
                          : 'bg-[#C7C7CC]'
                  }`} />

                  <div className="hidden w-[72px] shrink-0 items-center justify-center bg-[#F8F8FA] sm:flex">
                    <TicketQr ticket={ticket} size="small" />
                  </div>

                  <div className="min-w-0 flex-1 px-[14px] py-[14px] sm:px-[16px]">
                    <div className="mb-[8px] flex flex-wrap items-center gap-[8px]">
                      <span className={`rounded-full px-[10px] py-[5px] text-[12px] font-bold uppercase ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="font-mono text-[12px] font-semibold text-[#8E8E93]">
                        {(ticket.registration_id ?? ticket.id).slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <h2 className="line-clamp-2 text-[17px] font-bold leading-tight tracking-tight text-[#1C1C1E] sm:line-clamp-1">
                      {ticket.workshop.title}
                    </h2>
                    <div className="mt-[9px] grid grid-cols-1 gap-[5px] text-[13px] font-semibold text-[#8E8E93] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.8fr)]">
                      <span className="flex min-w-0 items-center gap-[6px]">
                        <Calendar className="h-[16px] w-[16px] shrink-0" />
                        <span className="truncate">{ticket.workshop.day}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-[6px]">
                        <Clock3 className="h-[16px] w-[16px] shrink-0" />
                        <span className="truncate">{ticket.workshop.time}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-[6px]">
                        <MapPin className="h-[16px] w-[16px] shrink-0" />
                        <span className="truncate">{ticket.workshop.room}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex w-[44px] shrink-0 items-center justify-center">
                    <ChevronRight className="h-[21px] w-[21px] text-[#C7C7CC] transition-transform group-hover:translate-x-[2px]" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedTicket && (
        <TicketDetailModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      )}
    </div>
  );
}
