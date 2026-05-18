import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useTickets } from '@/lib/tickets-context';
import type { Workshop } from '@/types/workshop';

type PaymentMethodId = 'apple_pay' | 'momo' | 'vnpay';
type GatewayStatus = 'idle' | 'processing' | 'success' | 'failed' | 'timeout';

interface PaymentRouteState {
  amount?: number;
  orderId?: string;
  registrationId?: string;
  qrToken?: string;
  returnUrl?: string;
  successReturnUrl?: string;
  workshop?: Workshop;
}

interface PaymentResult {
  payment_id: string;
  status: 'paid' | 'failed';
  gateway_ref: string | null;
  qr_token: string;
  qr_image: string;
}

interface PaymentMethodProps {
  id: PaymentMethodId;
  title: string;
  subtitle: string;
  icon?: ReactNode;
  isApple?: boolean;
  selectedMethod: PaymentMethodId;
  onSelect: (id: PaymentMethodId) => void;
}

function PaymentMethod({
  id,
  title,
  subtitle,
  icon,
  isApple = false,
  selectedMethod,
  onSelect,
}: PaymentMethodProps) {
  const isSelected = selectedMethod === id;

  return (
    <label
      className={`relative flex items-center p-[16px] rounded-[16px] border-[2px] cursor-pointer transition-all ${
        isSelected ? 'border-[#007AFF] bg-[#007AFF]/5' : 'border-[#E5E5EA] bg-white hover:border-[#C7C7CC]'
      }`}
    >
      <input
        type="radio"
        name="payment_method"
        className="hidden"
        checked={isSelected}
        onChange={() => onSelect(id)}
      />
      <div className="flex-1 flex items-center gap-[16px]">
        {isApple ? (
          <div className="w-[40px] h-[40px] bg-black text-white rounded-[8px] flex items-center justify-center">
            <svg viewBox="0 0 384 512" className="w-[20px] h-[20px] fill-current" aria-hidden="true">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.3 48.6-.6 88.5-85 101.9-111.4-45.5-22.1-61.2-66.2-61-113.6zM245.9 83.2c16.2-19.7 27.2-47.4 24.3-75.2-24.3 1-52.2 16.2-68.5 35.9-14.5 17.3-27.2 46.1-23.7 73.5 27.2 2 51.7-14.5 67.9-34.2z" />
            </svg>
          </div>
        ) : (
          <div className="w-[40px] h-[40px] bg-[#F2F2F7] text-[#1C1C1E] rounded-[8px] flex items-center justify-center">
            {icon}
          </div>
        )}
        <div>
          <h4 className="text-[15px] font-semibold text-[#1C1C1E]">{title}</h4>
          <p className="text-[13px] text-[#8E8E93]">{subtitle}</p>
        </div>
      </div>
      <div
        className={`w-[20px] h-[20px] rounded-full border-[2px] flex items-center justify-center transition-colors ${
          isSelected ? 'border-[#007AFF] bg-[#007AFF]' : 'border-[#C7C7CC]'
        }`}
      >
        {isSelected && <div className="w-[8px] h-[8px] bg-white rounded-full" />}
      </div>
    </label>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

export function PaymentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addTicket } = useTickets();
  const routeState = (location.state ?? {}) as Partial<PaymentRouteState>;

  const amount = routeState.amount ?? 50000;
  const orderId = routeState.orderId ?? 'TXN-8A9F2B';
  const returnUrl = routeState.returnUrl ?? '/';
  const successReturnUrl = routeState.successReturnUrl ?? '/tickets';

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>('apple_pay');
  const [status, setStatus] = useState<GatewayStatus>('idle');
  const [paymentKey, setPaymentKey] = useState<string>(orderId);

  const handlePayment = async () => {
    if (status !== 'idle') return;

    setStatus('processing');
    const nextPaymentKey = crypto.randomUUID();
    setPaymentKey(nextPaymentKey);

    if (!routeState.registrationId) {
      await wait(1500);
      setStatus('success');
      return;
    }

    try {
      const [payment] = await Promise.all([
        api.post<PaymentResult>(
          '/payments',
          { registration_id: routeState.registrationId },
          { 'Idempotency-Key': nextPaymentKey },
        ),
        wait(1500),
      ]);

      if (routeState.workshop) {
        addTicket({
          id: payment.qr_token,
          registration_id: routeState.registrationId,
          workshop: routeState.workshop,
          status: 'upcoming',
          qr_image: payment.qr_image,
        });
      }

      setStatus('success');
    } catch (err) {
      const e = err as { code?: string };
      setStatus(e.code === 'PAYMENT_UNAVAILABLE' ? 'timeout' : 'failed');
    }
  };

  useEffect(() => {
    if (status !== 'success' && status !== 'failed' && status !== 'timeout') return;

    const timer = window.setTimeout(() => {
      navigate(status === 'success' ? successReturnUrl : returnUrl, { replace: true });
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [navigate, returnUrl, status, successReturnUrl]);

  return (
    <div
      className="min-h-screen bg-[#F2F2F7] flex flex-col justify-center items-center p-[20px] font-sans"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
    >
      <div className="w-full max-w-[480px] mb-[24px] flex items-center justify-center gap-[8px] text-[#8E8E93]">
        <ShieldCheck className="w-[16px] h-[16px] text-[#34C759]" />
        <span className="text-[13px] font-medium tracking-wide uppercase">Cổng thanh toán Mock up</span>
      </div>

      <div className="w-full max-w-[480px] bg-white rounded-[24px] shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden animate-in zoom-in-95 duration-300">
        {status !== 'idle' ? (
          <div className="p-[40px] flex flex-col items-center text-center">
            {status === 'processing' && (
              <>
                <Loader2 className="w-[48px] h-[48px] text-[#007AFF] animate-spin mb-[24px]" />
                <h2 className="text-[20px] font-bold text-[#1C1C1E] mb-[8px]">Đang xử lý giao dịch</h2>
                <p className="text-[15px] text-[#8E8E93]">Vui lòng không đóng trình duyệt lúc này...</p>
                <div className="mt-[24px] px-[12px] py-[6px] bg-[#F2F2F7] rounded-[8px] font-mono text-[12px] text-[#8E8E93]">
                  Idempotency-Key: {paymentKey}
                </div>
              </>
            )}

            {status === 'success' && (
              <div className="animate-in slide-in-from-bottom-4">
                <CheckCircle2 className="w-[64px] h-[64px] text-[#34C759] mx-auto mb-[24px]" />
                <h2 className="text-[24px] font-bold text-[#1C1C1E] mb-[8px]">Thanh toán thành công</h2>
                <p className="text-[15px] text-[#8E8E93] mb-[24px]">Đang chuyển hướng về UniHub...</p>
              </div>
            )}

            {status === 'timeout' && (
              <div className="animate-in slide-in-from-bottom-4">
                <AlertTriangle className="w-[64px] h-[64px] text-[#FF9500] mx-auto mb-[24px]" />
                <h2 className="text-[24px] font-bold text-[#1C1C1E] mb-[8px]">Kết nối gián đoạn</h2>
                <p className="text-[15px] text-[#8E8E93] mb-[24px]">
                  Không nhận được phản hồi từ ngân hàng. Giao dịch của bạn đang ở trạng thái <b>Pending</b>. Hệ thống
                  sẽ tự động đối soát.
                </p>
                <p className="font-mono text-[13px] font-bold text-[#1C1C1E] p-[12px] bg-[#FF9500]/10 rounded-[12px]">
                  Mã tham chiếu: {orderId}
                </p>
              </div>
            )}

            {status === 'failed' && (
              <div className="animate-in slide-in-from-bottom-4">
                <XCircle className="w-[64px] h-[64px] text-[#FF3B30] mx-auto mb-[24px]" />
                <h2 className="text-[24px] font-bold text-[#1C1C1E] mb-[8px]">Giao dịch thất bại</h2>
                <p className="text-[15px] text-[#8E8E93] mb-[24px]">Thẻ của bạn bị từ chối hoặc sai thông tin xác thực.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="p-[24px] md:p-[32px] border-b border-[#F2F2F7] bg-[#FAFAFC]">
              <p className="text-[15px] font-medium text-[#8E8E93] mb-[4px]">Tổng thanh toán</p>
              <h1 className="text-[40px] font-bold text-[#1C1C1E] tracking-tight leading-none mb-[16px]">
                {amount.toLocaleString('vi-VN')}đ
              </h1>
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-[#8E8E93] font-medium">Mã đơn hàng:</span>
                <span className="font-mono font-semibold text-[#1C1C1E]">{orderId}</span>
              </div>
            </div>

            <div className="p-[24px] md:p-[32px]">
              <h3 className="text-[17px] font-bold text-[#1C1C1E] mb-[16px]">Phương thức thanh toán</h3>
              <div className="space-y-[12px] mb-[32px]">
                <PaymentMethod
                  id="apple_pay"
                  title="Apple Pay"
                  subtitle="Thanh toán qua thẻ tín dụng lưu trên thiết bị"
                  isApple
                  selectedMethod={selectedMethod}
                  onSelect={setSelectedMethod}
                />
                <PaymentMethod
                  id="momo"
                  title="Ví điện tử MoMo"
                  subtitle="Quét mã QR qua ứng dụng MoMo"
                  icon={<Smartphone className="w-[20px] h-[20px] text-[#A50064]" />}
                  selectedMethod={selectedMethod}
                  onSelect={setSelectedMethod}
                />
                <PaymentMethod
                  id="vnpay"
                  title="Thẻ ATM / VNPay"
                  subtitle="Chuyển hướng đến cổng VNPay"
                  icon={<CreditCard className="w-[20px] h-[20px] text-[#005BAA]" />}
                  selectedMethod={selectedMethod}
                  onSelect={setSelectedMethod}
                />
              </div>

              <button
                type="button"
                onClick={handlePayment}
                className={`w-full h-[56px] rounded-[16px] text-[17px] font-semibold text-white transition-all active:scale-[0.98] ${
                  selectedMethod === 'apple_pay'
                    ? 'bg-black hover:bg-[#1C1C1E]'
                    : 'bg-[#007AFF] hover:bg-[#006DEB] shadow-[0_4px_12px_rgba(0,122,255,0.3)]'
                }`}
              >
                Thanh toán {amount.toLocaleString('vi-VN')}đ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
