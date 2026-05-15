import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ChevronLeft, Calendar, MapPin, Ticket, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MOCK_WORKSHOPS } from '@/lib/mock-data';
import { useTickets } from '@/lib/tickets-context';
import { CapacityIndicator } from '@/components/CapacityIndicator';

export function WorkshopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addTicket } = useTickets();
  const [isRegistering, setIsRegistering] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  const workshop = MOCK_WORKSHOPS.find((ws) => ws.id === id);

  useEffect(() => {
    setPaymentStatus('idle');
  }, [id]);

  if (!workshop) {
    return <Navigate to="/" replace />;
  }

  const handleRegister = async () => {
    setIsRegistering(true);
    setPaymentStatus('processing');

    setTimeout(() => {
      if (!workshop.isFree && Math.random() < 0.2) {
        setPaymentStatus('error');
        setIsRegistering(false);
        return;
      }

      const newTicket = {
        id: `TKT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        workshop: workshop,
        status: 'upcoming' as const
      };
      addTicket(newTicket);
      setPaymentStatus('success');
      setIsRegistering(false);

      setTimeout(() => {
        navigate('/tickets');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 1500);
    }, 2000);
  };

  return (
    <div className="max-w-[1000px] mx-auto px-[20px] md:px-[40px] py-[32px] animate-in slide-in-from-right-8 duration-500 pb-[120px] md:pb-[40px]">
      <button
        onClick={() => navigate('/')}
        className="flex items-center text-[17px] font-medium text-[#007AFF] hover:opacity-80 mb-[24px] transition-opacity w-fit -ml-[8px] px-[8px] py-[4px]"
      >
        <ChevronLeft className="w-[20px] h-[20px] mr-[2px]" /> Trở lại danh sách
      </button>

      <div className="w-full h-[250px] md:h-[350px] rounded-[24px] overflow-hidden mb-[32px] relative shadow-[0_8px_30px_rgba(0,0,0,0.06)] bg-[#F2F2F7]">
        <img src={workshop.image} alt={workshop.title} className="w-full h-full object-cover" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[32px]">
        <div className="lg:col-span-2">
          <h1 className="text-[32px] md:text-[40px] font-bold leading-tight text-[#1C1C1E] tracking-tight mb-[12px]">
            {workshop.title}
          </h1>
          <p className="text-[20px] text-[#8E8E93] mb-[32px] font-medium">{workshop.speaker}</p>

          <div className="bg-white rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] mb-[40px] overflow-hidden">
            <div className="flex items-center gap-[16px] p-[20px] border-b border-[#F2F2F7]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <Calendar className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div className="flex-1">
                <p className="text-[17px] font-semibold text-[#1C1C1E]">{workshop.time}</p>
                <p className="text-[15px] text-[#8E8E93]">{workshop.day}</p>
              </div>
            </div>
            <div className="flex items-center gap-[16px] p-[20px] border-b border-[#F2F2F7]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <MapPin className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div className="flex-1">
                <p className="text-[17px] font-semibold text-[#1C1C1E]">{workshop.room}</p>
                <p className="text-[15px] text-[#007AFF] cursor-pointer">Xem bản đồ HCMUS</p>
              </div>
            </div>
            <div className="flex items-center gap-[16px] p-[20px]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <Ticket className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div className="flex-1">
                <p className={`text-[17px] font-semibold ${workshop.isFree ? 'text-[#34C759]' : 'text-[#5E5CE6]'}`}>
                  {workshop.isFree ? 'Miễn phí tham dự' : `${workshop.price.toLocaleString('vi-VN')} VNĐ`}
                </p>
                <p className="text-[15px] text-[#8E8E93]">Giá vé</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-[22px] font-bold text-[#1C1C1E] mb-[16px] tracking-tight">AI Tóm tắt nội dung</h2>
            <div className="p-[24px] bg-[#F2F2F7] rounded-[20px]">
              <p className="text-[17px] text-[#3A3A3C] leading-relaxed">
                {workshop.aiSummary}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-[80px] bg-white rounded-[24px] p-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] md:shadow-[0_16px_40px_rgba(0,0,0,0.08)] z-40 fixed md:relative bottom-0 left-0 right-0 md:bottom-auto rounded-b-none md:rounded-b-[24px] pb-safe">
            <div className="hidden md:block mb-[24px]">
              <h3 className="text-[20px] font-bold text-[#1C1C1E] mb-[16px]">Trạng thái chỗ ngồi</h3>
              <CapacityIndicator capacity={workshop.capacity} booked={workshop.booked} />
            </div>

            {paymentStatus === 'error' && (
              <div className="mb-[20px] p-[16px] bg-[#FF3B30]/10 rounded-[14px] flex items-start gap-[12px]">
                <AlertCircle className="w-[20px] h-[20px] text-[#FF3B30] shrink-0" />
                <p className="text-[14px] text-[#FF3B30] font-medium leading-tight">
                  Không thể kết nối cổng thanh toán. Hệ thống đang quá tải.
                </p>
              </div>
            )}

            {workshop.booked >= workshop.capacity ? (
              <button disabled className="w-full bg-[#E5E5EA] text-[#8E8E93] text-[17px] font-semibold py-[14px] rounded-[14px] cursor-not-allowed">
                Đã hết chỗ
              </button>
            ) : paymentStatus === 'success' ? (
              <div className="w-full flex items-center justify-center gap-[8px] bg-[#34C759] text-white text-[17px] font-semibold py-[14px] rounded-[14px]">
                <CheckCircle2 className="w-[20px] h-[20px]" /> Đã lấy vé
              </div>
            ) : (
              <button
                onClick={handleRegister}
                disabled={isRegistering}
                className={`w-full text-[17px] font-semibold py-[14px] rounded-[14px] flex items-center justify-center transition-all ${isRegistering ? 'bg-[#E5E5EA] text-[#8E8E93] cursor-wait' : 'bg-[#007AFF] text-white hover:bg-[#006DEB] shadow-[0_4px_12px_rgba(0,122,255,0.3)] active:scale-[0.98]'}`}
              >
                {isRegistering ? (
                  'Đang xử lý giao dịch...'
                ) : (
                  workshop.isFree ? 'Nhận vé miễn phí' : `Thanh toán qua Apple Pay`
                )}
              </button>
            )}
            <p className="text-[13px] text-[#8E8E93] text-center mt-[16px] font-medium hidden md:block">
              Yêu cầu xác thực thẻ sinh viên khi check-in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
