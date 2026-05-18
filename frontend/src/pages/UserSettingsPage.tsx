import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  LogOut,
  Receipt,
  RefreshCw,
  User,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

type SettingsTab = 'general' | 'transactions';

type RegistrationStatus = 'confirmed' | 'pending_payment' | 'checked_in' | 'cancelled' | 'expired' | string;

interface WorkshopSummary {
  id: string;
  title: string;
  room: string;
  start_time: string;
  end_time: string;
  fee_vnd: number;
  speaker_name: string;
}

interface RegistrationHistoryItem {
  id: string;
  mssv: string;
  workshop_id: string;
  status: RegistrationStatus;
  qr_token: string | null;
  expires_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  workshops?: WorkshopSummary | null;
}

const roleLabels: Record<'student' | 'organizer' | 'staff', string> = {
  student: 'Sinh viên',
  organizer: 'Ban tổ chức',
  staff: 'Nhân sự check-in',
};

const statusCopy: Record<string, { label: string; tone: 'success' | 'warning' | 'muted' | 'danger' }> = {
  confirmed: { label: 'Thành công', tone: 'success' },
  checked_in: { label: 'Đã check-in', tone: 'success' },
  pending_payment: { label: 'Chờ thanh toán', tone: 'warning' },
  cancelled: { label: 'Đã huỷ', tone: 'danger' },
  expired: { label: 'Hết hạn', tone: 'muted' },
};

function formatDateTime(value: string | null) {
  if (!value) return 'Chưa có thời gian';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCurrency(value: number) {
  if (value === 0) return '0đ';
  return `${value.toLocaleString('vi-VN')}đ`;
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }

  return 'Không tải được lịch sử giao dịch. Vui lòng thử lại.';
}

function getInitials(name: string, fallback: string | null) {
  const normalizedName = name.trim();
  if (normalizedName) {
    return normalizedName
      .split(/\s+/)
      .slice(-2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  return fallback?.slice(-2).toUpperCase() ?? 'U';
}

function NavItem({
  id,
  icon: Icon,
  label,
  activeTab,
  onSelect,
}: {
  id: SettingsTab;
  icon: typeof User;
  label: string;
  activeTab: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
}) {
  const isActive = activeTab === id;

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`min-h-[44px] w-full flex items-center gap-[12px] px-[16px] py-[12px] rounded-[14px] transition-all duration-200 ${
        isActive
          ? 'bg-[#007AFF]/10 text-[#007AFF] font-semibold'
          : 'text-[#1C1C1E] hover:bg-[#F2F2F7] font-medium'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className="w-[20px] h-[20px]" aria-hidden="true" />
      <span className="text-[15px]">{label}</span>
      {isActive && <ChevronRight className="w-[16px] h-[16px] ml-auto opacity-50" aria-hidden="true" />}
    </button>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <label className="text-[13px] font-semibold text-[#6E6E73] uppercase tracking-wide">{label}</label>
      <input
        type="text"
        value={value}
        readOnly
        className="w-full h-[48px] px-[16px] rounded-[14px] text-[15px] font-medium bg-[#F2F2F7] text-[#6E6E73] cursor-not-allowed border border-transparent"
      />
    </div>
  );
}

function GeneralView({
  displayName,
  mssv,
  role,
  transactionCount,
  onBack,
}: {
  displayName: string;
  mssv: string;
  role: 'student' | 'organizer' | 'staff';
  transactionCount: number;
  onBack: () => void;
}) {
  const initials = getInitials(displayName, mssv);

  return (
    <div className="animate-in fade-in duration-500">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] flex items-center text-[17px] font-medium text-[#007AFF] hover:bg-[#007AFF]/10 mb-[16px] transition-colors w-fit -ml-[8px] px-[8px] py-[6px] rounded-[10px]"
      >
        <ChevronLeft className="w-[20px] h-[20px] mr-[2px]" aria-hidden="true" />
        Quay lại trang chủ
      </button>

      <div className="mb-[28px]">
        <h1 className="text-[30px] md:text-[34px] font-bold text-[#1C1C1E] tracking-tight mb-[8px]">
          Cài đặt tài khoản
        </h1>
        <p className="text-[15px] md:text-[17px] text-[#6E6E73] font-medium">
          Dữ liệu định danh được đồng bộ từ hồ sơ UniHub.
        </p>
      </div>

      <section className="bg-white rounded-[24px] p-[24px] md:p-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-[20px] mb-[32px] pb-[32px] border-b border-[#F2F2F7]">
          <div className="w-[80px] h-[80px] rounded-[20px] bg-gradient-to-tr from-[#007AFF] to-[#5AC8FA] text-white flex items-center justify-center text-[30px] font-bold shadow-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-tight truncate">{displayName}</h2>
            <p className="text-[15px] text-[#6E6E73] font-medium mb-[10px]">MSSV: {mssv}</p>
            <div className="flex items-center gap-[8px] flex-wrap">
              <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[8px] bg-[#007AFF]/10 text-[#007AFF] text-[13px] font-semibold">
                <User className="w-[14px] h-[14px]" aria-hidden="true" />
                {roleLabels[role]}
              </span>
              <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[8px] bg-[#34C759]/10 text-[#1E8E3E] text-[13px] font-semibold">
                <CheckCircle2 className="w-[14px] h-[14px]" aria-hidden="true" />
                {transactionCount} lượt đăng ký
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
          <ReadOnlyField label="Họ và tên" value={displayName} />
          <ReadOnlyField label="Mã số sinh viên" value={mssv} />
          <ReadOnlyField label="Vai trò" value={roleLabels[role]} />
          <ReadOnlyField label="Trạng thái mật khẩu" value="Đã kích hoạt" />
        </div>
      </section>
    </div>
  );
}

function TransactionIcon({ status, amount }: { status: string; amount: number }) {
  const isSuccess = status === 'confirmed' || status === 'checked_in';
  const isPending = status === 'pending_payment';

  if (isPending) {
    return (
      <div className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center bg-[#FF9500]/10 shrink-0">
        <CreditCard className="w-[20px] h-[20px] text-[#B26A00]" aria-hidden="true" />
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center bg-[#34C759]/10 shrink-0">
        <Receipt className={`w-[20px] h-[20px] ${amount === 0 ? 'text-[#007AFF]' : 'text-[#1E8E3E]'}`} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center bg-[#FF3B30]/10 shrink-0">
      <AlertCircle className="w-[20px] h-[20px] text-[#C5221F]" aria-hidden="true" />
    </div>
  );
}

function TransactionsView({
  items,
  loading,
  error,
  onRetry,
  onBack,
}: {
  items: RegistrationHistoryItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="animate-in fade-in duration-500">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] flex items-center text-[17px] font-medium text-[#007AFF] hover:bg-[#007AFF]/10 mb-[16px] transition-colors w-fit -ml-[8px] px-[8px] py-[6px] rounded-[10px]"
      >
        <ChevronLeft className="w-[20px] h-[20px] mr-[2px]" aria-hidden="true" />
        Quay lại trang chủ
      </button>

      <div className="mb-[28px]">
        <h1 className="text-[30px] md:text-[34px] font-bold text-[#1C1C1E] tracking-tight mb-[8px]">
          Lịch sử giao dịch
        </h1>
        <p className="text-[15px] md:text-[17px] text-[#6E6E73] font-medium">
          Tổng hợp các lượt đăng ký workshop và trạng thái thanh toán hiện có.
        </p>
      </div>

      <section className="bg-white rounded-[24px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        {loading && (
          <div className="min-h-[260px] flex flex-col items-center justify-center gap-[12px] px-[24px] text-center">
            <Loader2 className="w-[28px] h-[28px] text-[#007AFF] animate-spin" aria-hidden="true" />
            <p className="text-[15px] font-semibold text-[#1C1C1E]">Đang tải lịch sử giao dịch</p>
          </div>
        )}

        {!loading && error && (
          <div className="min-h-[260px] flex flex-col items-center justify-center gap-[16px] px-[24px] text-center">
            <div className="w-[56px] h-[56px] rounded-[18px] bg-[#FF3B30]/10 flex items-center justify-center">
              <AlertCircle className="w-[28px] h-[28px] text-[#C5221F]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[17px] font-semibold text-[#1C1C1E] mb-[6px]">Không tải được dữ liệu</p>
              <p className="text-[15px] text-[#6E6E73] max-w-[360px]">{error}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[44px] inline-flex items-center gap-[8px] px-[18px] rounded-[14px] bg-[#007AFF] text-white text-[15px] font-semibold hover:bg-[#006DEB] active:scale-[0.98] transition-all"
            >
              <RefreshCw className="w-[17px] h-[17px]" aria-hidden="true" />
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="min-h-[260px] flex flex-col items-center justify-center gap-[12px] px-[24px] text-center">
            <div className="w-[64px] h-[64px] rounded-[20px] bg-[#F2F2F7] flex items-center justify-center">
              <Receipt className="w-[30px] h-[30px] text-[#8E8E93]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[17px] font-semibold text-[#1C1C1E] mb-[6px]">Chưa có giao dịch nào</p>
              <p className="text-[15px] text-[#6E6E73] max-w-[360px]">
                Các lượt đăng ký workshop của bạn sẽ xuất hiện tại đây.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="divide-y divide-[#F2F2F7]">
            {items.map((item) => {
              const workshop = item.workshops;
              const amount = workshop?.fee_vnd ?? 0;
              const status = statusCopy[item.status] ?? { label: item.status, tone: 'muted' as const };
              const statusClass =
                status.tone === 'success'
                  ? 'text-[#1E8E3E]'
                  : status.tone === 'warning'
                  ? 'text-[#B26A00]'
                  : status.tone === 'danger'
                  ? 'text-[#C5221F]'
                  : 'text-[#6E6E73]';

              return (
                <article
                  key={item.id}
                  className="p-[20px] md:p-[24px] hover:bg-[#F9F9FB] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-[16px]"
                >
                  <div className="flex items-start gap-[16px] min-w-0">
                    <TransactionIcon status={item.status} amount={amount} />
                    <div className="min-w-0">
                      <h2 className="text-[16px] font-semibold text-[#1C1C1E] line-clamp-2 mb-[6px]">
                        {workshop?.title ?? 'Workshop không còn tồn tại'}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-[13px] text-[#6E6E73] font-medium">
                        <span>{formatDateTime(item.created_at)}</span>
                        <span aria-hidden="true">-</span>
                        <span>{amount === 0 ? 'System Grant' : 'Mock Payment'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center gap-[4px] pl-[58px] md:pl-0">
                    <span className={`text-[17px] font-bold tracking-tight ${status.tone === 'danger' ? 'text-[#6E6E73] line-through' : 'text-[#1C1C1E]'}`}>
                      {formatCurrency(amount)}
                    </span>
                    <span className={`text-[12px] font-bold uppercase tracking-wide ${statusClass}`}>{status.label}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function UserSettingsPage() {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [items, setItems] = useState<RegistrationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (profile?.role !== 'student' || !profile.mssv) {
        setItems([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await api.get<RegistrationHistoryItem[]>('/registrations/me');
        if (!active) return;
        setItems(data);
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [profile?.mssv, profile?.role, reloadKey]);

  const displayName = profile?.display_name ?? 'Người dùng UniHub';
  const mssv = profile?.mssv ?? 'Chưa liên kết';
  const role = profile?.role ?? 'student';
  const confirmedCount = useMemo(
    () => items.filter((item) => item.status === 'confirmed' || item.status === 'checked_in').length,
    [items],
  );

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="max-w-[1100px] mx-auto px-[20px] md:px-[32px] py-[32px] md:py-[40px] flex flex-col lg:flex-row gap-[28px] lg:gap-[40px] pb-[110px] md:pb-[48px]">
      <aside className="w-full lg:w-[260px] shrink-0">
        <div className="lg:sticky lg:top-[92px]">
          <nav className="bg-white lg:bg-transparent rounded-[18px] lg:rounded-none p-[6px] lg:p-0 shadow-[0_8px_30px_rgba(0,0,0,0.04)] lg:shadow-none flex lg:flex-col gap-[4px]">
            <NavItem id="general" icon={User} label="Thông tin" activeTab={activeTab} onSelect={setActiveTab} />
            <NavItem id="transactions" icon={CreditCard} label="Giao dịch" activeTab={activeTab} onSelect={setActiveTab} />
          </nav>

          <div className="hidden lg:block my-[12px] h-[1px] bg-[#E5E5EA] mx-[16px]" />
          <button
            type="button"
            onClick={handleLogout}
            className="hidden lg:flex min-h-[44px] w-full items-center gap-[12px] px-[16px] py-[12px] rounded-[14px] text-[#C5221F] hover:bg-[#FF3B30]/10 font-medium transition-colors"
          >
            <LogOut className="w-[20px] h-[20px]" aria-hidden="true" />
            <span className="text-[15px]">Đăng xuất</span>
          </button>
        </div>
      </aside>

      <section className="flex-1 min-w-0">
        {activeTab === 'general' && (
          <GeneralView
            displayName={displayName}
            mssv={mssv}
            role={role}
            transactionCount={confirmedCount}
            onBack={() => navigate('/')}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView
            items={items}
            loading={loading}
            error={error}
            onRetry={() => setReloadKey((value) => value + 1)}
            onBack={() => navigate('/')}
          />
        )}
      </section>
    </main>
  );
}
