import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Calendar, MapPin, Ticket,
  AlertCircle, CheckCircle2, Sparkles, FileText,
} from 'lucide-react';
import { CapacityIndicator } from '@/components/CapacityIndicator';
import { MarkdownSummary } from '@/components/MarkdownSummary';
import { api } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { useTickets } from '@/lib/tickets-context';
import { type WorkshopRow, workshopRowToDisplay } from '@/types/workshop';

interface RegistrationResult {
  registration_id: string;
  workshop_id: string;
  status: 'confirmed' | 'pending_payment';
  qr_token: string;
  qr_image: string;
  fee_vnd: number;
}

interface MyRegistration {
  id: string;
  workshop_id: string;
  status: 'confirmed' | 'pending_payment' | 'checked_in' | 'cancelled' | 'expired' | string;
}

const ERROR_MESSAGES: Record<string, string> = {
  SEATS_SOLD_OUT: 'Workshop đã hết chỗ.',
  ALREADY_REGISTERED: 'Bạn đã đăng ký workshop này rồi.',
  PAYMENT_UNAVAILABLE: 'Cổng thanh toán tạm thời không khả dụng. Chỗ ngồi đã được giữ 15 phút.',
  PAYMENT_FAILED: 'Thanh toán thất bại (thẻ bị từ chối). Chỗ ngồi đã được giải phóng.',
  RESOURCE_NOT_FOUND: 'Workshop không tồn tại hoặc chưa được công bố.',
};

export function WorkshopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addTicket } = useTickets();

  const [workshop, setWorkshop] = useState<WorkshopRow | null>(null);
  const [loadingWs, setLoadingWs] = useState(true);
  const [wsError, setWsError] = useState<string | null>(null);
  const [existingRegistration, setExistingRegistration] = useState<MyRegistration | null>(null);

  const [isRegistering, setIsRegistering] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoadingWs(true);
    setWsError(null);
    setExistingRegistration(null);
    api.get<WorkshopRow>(`/workshops/${id}`)
      .then(setWorkshop)
      .catch(() => setWsError('Không tìm thấy workshop.'))
      .finally(() => setLoadingWs(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    api.get<MyRegistration[]>('/registrations/me')
      .then(rows => {
        if (cancelled) return;
        const activeRegistration = rows.find(row =>
          row.workshop_id === id && !['cancelled', 'expired'].includes(row.status),
        );
        setExistingRegistration(activeRegistration ?? null);
      })
      .catch(() => {
        if (!cancelled) setExistingRegistration(null);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`workshop-detail-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'workshops', filter: `id=eq.${id}` },
        payload => {
          const next = payload.new as Partial<WorkshopRow> & { id: string };
          setWorkshop(prev => (prev ? { ...prev, ...next } : prev));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    setPaymentStatus('idle');
    setErrorMsg('');
  }, [id]);

  useEffect(() => {
    if (!isMapModalOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMapModalOpen(false);
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isMapModalOpen]);

  const handleRegister = async () => {
    if (!workshop) return;
    setIsRegistering(true);
    setPaymentStatus('processing');
    setErrorMsg('');

    const regKey = crypto.randomUUID();

    try {
      const reg = await api.post<RegistrationResult>(
        '/registrations',
        { workshop_id: workshop.id },
        { 'Idempotency-Key': regKey },
      );

      let qrImage = reg.qr_image;

      if (reg.status === 'pending_payment') {
        navigate('/payment', {
          state: {
            amount: reg.fee_vnd,
            orderId: `TXN-${reg.registration_id.slice(0, 8).toUpperCase()}`,
            registrationId: reg.registration_id,
            qrToken: reg.qr_token,
            workshop: workshopRowToDisplay(workshop),
            returnUrl: `/workshop/${workshop.id}`,
            successReturnUrl: '/tickets',
          },
        });
        return;
      }

      const display = workshopRowToDisplay(workshop);
      addTicket({
        id: reg.qr_token,
        registration_id: reg.registration_id,
        workshop: display,
        status: 'upcoming',
        qr_image: qrImage,
      });
      setExistingRegistration({
        id: reg.registration_id,
        workshop_id: reg.workshop_id,
        status: reg.status,
      });

      setPaymentStatus('success');
      setTimeout(() => {
        navigate('/tickets');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 1500);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const msg = ERROR_MESSAGES[e.code ?? ''] ?? e.message ?? 'Có lỗi xảy ra. Vui lòng thử lại.';
      setErrorMsg(msg);
      setPaymentStatus('error');
    } finally {
      setIsRegistering(false);
    }
  };

  if (loadingWs) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (wsError || !workshop) {
    return (
      <div className="max-w-[1000px] mx-auto px-[20px] py-[80px] text-center">
        <p className="text-[17px] text-[#FF3B30]">{wsError ?? 'Không tìm thấy workshop.'}</p>
        <button onClick={() => navigate('/')} className="mt-[16px] text-[#007AFF] font-semibold">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const display = workshopRowToDisplay(workshop);
  const hasConfirmedRegistration =
    existingRegistration?.status === 'confirmed' || existingRegistration?.status === 'checked_in';

  const registerButton = () => {
    if (hasConfirmedRegistration) {
      return (
        <div className="space-y-[12px]">
          <button
            type="button"
            disabled
            className="w-full bg-[#E5E5EA] text-[#8E8E93] text-[17px] font-semibold py-[14px] rounded-[14px] cursor-not-allowed"
          >
            {display.isFree ? 'Đã đăng ký' : 'Đã thanh toán'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/tickets', { state: { openRegistrationId: existingRegistration?.id } })}
            className="w-full bg-[#007AFF]/10 text-[#007AFF] text-[17px] font-semibold py-[14px] rounded-[14px] hover:bg-[#007AFF]/15 active:scale-[0.98] transition-all"
          >
            Xem vé của tôi
          </button>
        </div>
      );
    }

    if (workshop.seats_remaining <= 0) {
      return (
        <button disabled className="w-full bg-[#E5E5EA] text-[#8E8E93] text-[17px] font-semibold py-[14px] rounded-[14px] cursor-not-allowed">
          Đã hết chỗ
        </button>
      );
    }
    if (paymentStatus === 'success') {
      return (
        <div className="w-full flex items-center justify-center gap-[8px] bg-[#34C759] text-white text-[17px] font-semibold py-[14px] rounded-[14px]">
          <CheckCircle2 className="w-[20px] h-[20px]" /> Đã lấy vé
        </div>
      );
    }
    return (
      <button
        onClick={handleRegister}
        disabled={isRegistering}
        className={`w-full text-[17px] font-semibold py-[14px] rounded-[14px] flex items-center justify-center transition-all ${
          isRegistering
            ? 'bg-[#E5E5EA] text-[#8E8E93] cursor-wait'
            : 'bg-[#007AFF] text-white hover:bg-[#006DEB] shadow-[0_4px_12px_rgba(0,122,255,0.3)] active:scale-[0.98]'
        }`}
      >
        {isRegistering
          ? 'Đang xử lý...'
          : display.isFree
            ? 'Nhận vé miễn phí'
            : `Thanh toán ${display.price.toLocaleString('vi-VN')}đ`}
      </button>
    );
  };

  return (
    <div className="max-w-[1000px] mx-auto px-[20px] md:px-[40px] py-[32px] pb-[120px] lg:pb-[40px] animate-in slide-in-from-right-8 duration-500">

      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center text-[17px] font-medium text-[#007AFF] hover:opacity-80 mb-[24px] transition-opacity w-fit -ml-[8px] px-[8px] py-[4px]"
      >
        <ChevronLeft className="w-[20px] h-[20px] mr-[2px]" /> Trở lại danh sách
      </button>

      {/* Hero image */}
      <div className="w-full h-[250px] md:h-[360px] rounded-[24px] overflow-hidden mb-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] bg-[#F2F2F7]">
        {display.image ? (
          <img src={display.image} alt={display.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#C7C7CC] text-[14px]">Không có ảnh</div>
        )}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[32px]">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-[32px]">

          {/* Title + Speaker */}
          <div>
            <h1 className="text-[32px] md:text-[40px] font-bold leading-tight text-[#1C1C1E] tracking-tight mb-[10px]">
              {display.title}
            </h1>
            <p className="text-[18px] text-[#8E8E93] font-medium">{display.speaker}</p>
          </div>

          {/* Info chips */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-[12px]">
            <div className="flex items-center gap-[14px] bg-white rounded-[16px] px-[16px] py-[14px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex-1 min-w-[200px]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <Calendar className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[#1C1C1E] leading-tight">{display.time}</p>
                <p className="text-[13px] text-[#8E8E93] mt-[2px]">{display.day}</p>
              </div>
            </div>

            <div className="flex items-center gap-[14px] bg-white rounded-[16px] px-[16px] py-[14px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex-1 min-w-[160px]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <MapPin className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[#1C1C1E] leading-tight">{display.room}</p>
                {display.room_map_url ? (
                  <button
                    type="button"
                    onClick={() => setIsMapModalOpen(true)}
                    className="block text-left text-[13px] text-[#007AFF] mt-[2px] hover:underline"
                  >
                    Xem sơ đồ phòng
                  </button>
                ) : (
                  <p className="text-[13px] text-[#8E8E93] mt-[2px]">Chưa có bản đồ</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-[14px] bg-white rounded-[16px] px-[16px] py-[14px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex-1 min-w-[140px]">
              <div className={`w-[40px] h-[40px] rounded-[12px] flex items-center justify-center shrink-0 ${display.isFree ? 'bg-[#34C759]/10' : 'bg-[#5E5CE6]/10'}`}>
                <Ticket className={`w-[20px] h-[20px] ${display.isFree ? 'text-[#34C759]' : 'text-[#5E5CE6]'}`} />
              </div>
              <div>
                <p className={`text-[15px] font-semibold leading-tight ${display.isFree ? 'text-[#34C759]' : 'text-[#5E5CE6]'}`}>
                  {display.isFree ? 'Miễn phí tham dự' : `${display.price.toLocaleString('vi-VN')} VNĐ`}
                </p>
                <p className="text-[13px] text-[#8E8E93] mt-[2px]">Giá vé</p>
              </div>
            </div>
          </div>

          {/* AI Summary — always shown */}
          <div>
            <div className="flex items-center gap-[8px] mb-[16px]">
              <Sparkles className="w-[20px] h-[20px] text-[#5E5CE6]" />
              <h2 className="text-[20px] font-bold text-[#1C1C1E] tracking-tight">Nội dung tóm tắt AI</h2>
            </div>

            {display.aiSummary ? (
              <div className="bg-gradient-to-br from-[#F0F0FF] to-[#F8F8FF] border border-[#5E5CE6]/20 rounded-[20px] p-[24px]">
                <MarkdownSummary content={display.aiSummary} />
              </div>
            ) : (
              <div className="bg-[#F2F2F7] rounded-[20px] p-[32px] flex flex-col items-center gap-[10px] text-center">
                <div className="w-[48px] h-[48px] rounded-full bg-[#E5E5EA] flex items-center justify-center">
                  <FileText className="w-[24px] h-[24px] text-[#C7C7CC]" />
                </div>
                <p className="text-[16px] font-semibold text-[#3A3A3C]">Không có nội dung</p>
                <p className="text-[13px] text-[#8E8E93] max-w-[280px] leading-relaxed">
                  Organizer chưa tải lên tài liệu PDF cho workshop này.
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Right column — Desktop sidebar only */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="sticky top-[80px] bg-white rounded-[24px] p-[24px] shadow-[0_8px_40px_rgba(0,0,0,0.08)]">
            <h3 className="text-[18px] font-bold text-[#1C1C1E] mb-[16px]">Trạng thái chỗ ngồi</h3>
            <CapacityIndicator capacity={display.capacity} booked={display.booked} />

            <div className="h-[1px] bg-[#F2F2F7] my-[20px]" />

            {paymentStatus === 'error' && (
              <div className="mb-[16px] p-[14px] bg-[#FF3B30]/10 rounded-[12px] flex items-start gap-[10px]">
                <AlertCircle className="w-[18px] h-[18px] text-[#FF3B30] shrink-0 mt-[1px]" />
                <p className="text-[13px] text-[#FF3B30] font-medium leading-tight">{errorMsg}</p>
              </div>
            )}

            {registerButton()}

            <p className="text-[13px] text-[#8E8E93] text-center mt-[16px]">
              Yêu cầu xác thực thẻ sinh viên khi check-in.
            </p>
          </div>
        </div>

      </div>

      {/* Mobile bottom action bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E5E5EA] px-[20px] pt-[16px] pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {paymentStatus === 'error' && (
          <div className="mb-[12px] p-[12px] bg-[#FF3B30]/10 rounded-[12px] flex items-start gap-[10px]">
            <AlertCircle className="w-[16px] h-[16px] text-[#FF3B30] shrink-0 mt-[1px]" />
            <p className="text-[13px] text-[#FF3B30] font-medium leading-tight">{errorMsg}</p>
          </div>
        )}
        {registerButton()}
      </div>

      {isMapModalOpen && display.room_map_url && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 px-[16px] py-[24px] flex items-center justify-center"
          onClick={() => setIsMapModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-[900px] bg-white rounded-[20px] shadow-[0_12px_36px_rgba(0,0,0,0.2)] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Sơ đồ phòng"
          >
            <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-[#F2F2F7]">
              <p className="text-[16px] font-semibold text-[#1C1C1E]">Sơ đồ phòng</p>
              <button
                type="button"
                onClick={() => setIsMapModalOpen(false)}
                className="h-[36px] px-[14px] rounded-[10px] bg-[#F2F2F7] text-[13px] font-semibold text-[#1C1C1E] hover:bg-[#E5E5EA] transition-colors"
              >
                Đóng
              </button>
            </div>
            <div className="bg-[#F2F2F7] h-[75vh] overflow-hidden">
              <img src={display.room_map_url} alt="Sơ đồ phòng" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
