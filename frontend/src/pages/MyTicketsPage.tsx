import { useNavigate } from 'react-router-dom';
import { Ticket as TicketIcon, QrCode } from 'lucide-react';
import { useTickets } from '@/lib/tickets-context';

export function MyTicketsPage() {
  const navigate = useNavigate();
  const { myTickets } = useTickets();

  return (
    <div className="max-w-[800px] mx-auto px-[20px] md:px-[40px] py-[40px] animate-in fade-in duration-500 pb-[100px]">
      <h1 className="text-[34px] font-bold text-[#1C1C1E] mb-[32px] tracking-tight">Vé đã lưu</h1>

      {myTickets.length === 0 ? (
        <div className="text-center py-[80px]">
          <div className="w-[80px] h-[80px] bg-[#F2F2F7] rounded-[24px] flex items-center justify-center mx-auto mb-[20px]">
            <TicketIcon className="w-[40px] h-[40px] text-[#C7C7CC]" />
          </div>
          <p className="text-[17px] font-medium text-[#1C1C1E] mb-[8px]">Chưa có vé nào</p>
          <p className="text-[15px] text-[#8E8E93] mb-[24px]">Các vé workshop bạn đăng ký sẽ xuất hiện ở đây.</p>
          <button
            onClick={() => navigate('/')}
            className="text-[17px] font-semibold text-[#007AFF] bg-[#007AFF]/10 px-[20px] py-[10px] rounded-full"
          >
            Tìm workshop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[24px]">
          {myTickets.map((ticket) => (
            <div key={ticket.id} className="bg-white rounded-[24px] p-[24px] flex flex-col md:flex-row items-center gap-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-[12px] mb-[12px]">
                  <span className="text-[#34C759] text-[13px] font-bold tracking-wide uppercase">Sắp diễn ra</span>
                  <span className="w-[4px] h-[4px] rounded-full bg-[#E5E5EA]"></span>
                  <span className="text-[13px] text-[#8E8E93] font-mono">{ticket.id}</span>
                </div>
                <h3 className="text-[22px] font-bold text-[#1C1C1E] leading-tight mb-[16px] tracking-tight">{ticket.workshop.title}</h3>

                <div className="bg-[#F2F2F7] rounded-[16px] p-[16px] flex flex-col sm:flex-row gap-[16px] sm:gap-[32px]">
                  <div>
                    <p className="text-[13px] text-[#8E8E93] mb-[2px] font-medium">Thời gian</p>
                    <p className="text-[15px] font-semibold text-[#1C1C1E]">{ticket.workshop.time}</p>
                    <p className="text-[13px] text-[#8E8E93]">{ticket.workshop.day}</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-[#8E8E93] mb-[2px] font-medium">Địa điểm</p>
                    <p className="text-[15px] font-semibold text-[#1C1C1E]">{ticket.workshop.room}</p>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-auto flex flex-col items-center justify-center shrink-0 bg-[#F2F2F7] p-[24px] rounded-[20px]">
                <div className="bg-white p-[12px] rounded-[16px] shadow-sm mb-[12px]">
                  <QrCode className="w-[120px] h-[120px] text-[#1C1C1E]" />
                </div>
                <p className="text-[13px] font-medium text-[#8E8E93]">Quét để Check-in</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
