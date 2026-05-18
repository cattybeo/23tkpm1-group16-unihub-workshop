import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, CreditCard, LogOut, ChevronRight, CheckCircle, Clock, Mail, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api-client'

interface WorkshopInfo {
  id: string
  title: string
  room: string
  start_time: string
  fee_vnd: number
}

interface Registration {
  id: string
  mssv: string
  workshop_id: string
  status: 'confirmed' | 'pending_payment'
  qr_token: string
  workshops: WorkshopInfo
}

type Tab = 'general' | 'payment'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

interface NavItemProps {
  id: Tab
  icon: React.ElementType
  label: string
  activeTab: Tab
  setActiveTab: (id: Tab) => void
}

function NavItem({ id, icon: Icon, label, activeTab, setActiveTab }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-[12px] px-[16px] py-[12px] rounded-[14px] transition-all duration-200 ${
        activeTab === id
          ? 'bg-[#007AFF]/10 text-[#007AFF] font-semibold'
          : 'text-[#1C1C1E] hover:bg-[#F2F2F7] font-medium'
      }`}
    >
      <Icon className="w-[20px] h-[20px]" />
      <span className="text-[15px]">{label}</span>
      {activeTab === id && <ChevronRight className="w-[16px] h-[16px] ml-auto opacity-50" />}
    </button>
  )
}

interface ReadonlyFieldProps {
  label: string
  value: string
}

function ReadonlyField({ label, value }: ReadonlyFieldProps) {
  return (
    <div className="flex flex-col gap-[8px]">
      <label className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wide">
        {label}
      </label>
      <div className="w-full h-[48px] px-[16px] rounded-[14px] text-[15px] font-medium bg-[#F2F2F7] text-[#8E8E93] flex items-center">
        {value}
      </div>
    </div>
  )
}

interface GeneralViewProps {
  displayName: string
  email: string
  mssv: string | null
  registrationCount: number
  emailDraft: string
  emailSaving: boolean
  emailMessage: { type: 'success' | 'error'; text: string } | null
  onEmailDraftChange: (value: string) => void
  onEmailSubmit: (event: FormEvent<HTMLFormElement>) => void
}

function GeneralView({
  displayName,
  email,
  mssv,
  registrationCount,
  emailDraft,
  emailSaving,
  emailMessage,
  onEmailDraftChange,
  onEmailSubmit,
}: GeneralViewProps) {
  const emailChanged = emailDraft.trim().toLowerCase() !== email.trim().toLowerCase()

  return (
    <div>
      <div className="mb-[32px]">
        <h2 className="text-[24px] font-bold text-[#1C1C1E] tracking-tight mb-[8px]">Thông tin sinh viên</h2>
        <p className="text-[15px] text-[#8E8E93] font-medium">Dữ liệu định danh được đồng bộ một chiều từ hệ thống nhà trường.</p>
      </div>

      <div className="bg-white rounded-[24px] p-[24px] md:p-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] mb-[24px]">
        <div className="flex items-center gap-[24px] mb-[32px] pb-[32px] border-b border-[#F2F2F7]">
          <div className="w-[80px] h-[80px] rounded-[20px] bg-gradient-to-tr from-[#007AFF] to-[#5AC8FA] text-white flex items-center justify-center text-[32px] font-bold shadow-sm">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-[20px] font-bold text-[#1C1C1E]">{displayName}</h3>
            {mssv && <p className="text-[15px] text-[#8E8E93] font-medium mb-[8px]">MSSV: {mssv}</p>}
            <span className="inline-flex items-center gap-[6px] px-[10px] py-[4px] rounded-[8px] bg-[#007AFF]/10 text-[#007AFF] text-[13px] font-semibold">
              {registrationCount} Workshop đã đăng ký
            </span>
          </div>
        </div>

        <div className="space-y-[24px]">
          <ReadonlyField label="Họ và Tên" value={displayName} />
          {mssv && <ReadonlyField label="Mã số sinh viên" value={mssv} />}
          <form onSubmit={onEmailSubmit} className="flex flex-col gap-[10px]">
            <label htmlFor="student-email" className="text-[13px] font-semibold text-[#8E8E93] uppercase tracking-wide">
              Email nhận thông báo
            </label>
            <div className="flex flex-col gap-[12px] sm:flex-row">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-[14px] top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-[#8E8E93]" />
                <input
                  id="student-email"
                  type="email"
                  value={emailDraft}
                  onChange={event => onEmailDraftChange(event.target.value)}
                  className="h-[48px] w-full rounded-[14px] border border-[#D1D1D6] bg-white pl-[44px] pr-[16px] text-[15px] font-medium text-[#1C1C1E] outline-none transition focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/10"
                  autoComplete="email"
                  spellCheck={false}
                />
              </div>
              <button
                type="submit"
                disabled={emailSaving || !emailChanged}
                className="flex h-[48px] min-w-[116px] items-center justify-center rounded-[14px] bg-[#007AFF] px-[16px] text-[15px] font-semibold text-white transition hover:bg-[#006DEB] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {emailSaving ? <Loader2 className="h-[19px] w-[19px] animate-spin" aria-label="Đang lưu" /> : 'Lưu email'}
              </button>
            </div>
            {emailMessage && (
              <div
                className={`flex items-start gap-[8px] rounded-[12px] px-[12px] py-[10px] text-[13px] font-semibold ${
                  emailMessage.type === 'success'
                    ? 'bg-[#EAF8EF] text-[#1E7A3A]'
                    : 'bg-[#FFF2F0] text-[#B42318]'
                }`}
                role={emailMessage.type === 'error' ? 'alert' : 'status'}
              >
                {emailMessage.type === 'error' && <AlertCircle className="mt-[1px] h-[16px] w-[16px] shrink-0" />}
                <span>{emailMessage.text}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

interface PaymentViewProps {
  registrations: Registration[]
  loading: boolean
}

function PaymentView({ registrations, loading }: PaymentViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-[60px]">
        <div className="w-8 h-8 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-[32px]">
        <h2 className="text-[24px] font-bold text-[#1C1C1E] tracking-tight mb-[8px]">Lịch sử đăng ký</h2>
        <p className="text-[15px] text-[#8E8E93] font-medium">Toàn bộ workshop bạn đã đăng ký.</p>
      </div>

      <div className="bg-white rounded-[24px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        {registrations.length === 0 ? (
          <div className="px-[16px] py-[48px] text-center text-[14px] text-[#8E8E93]">
            Chưa có đăng ký nào
          </div>
        ) : (
          <div className="divide-y divide-[#F2F2F7]">
            {registrations.map(reg => {
              const isPaid = reg.status === 'confirmed'
              const isFree = reg.workshops.fee_vnd === 0
              return (
                <div
                  key={reg.id}
                  className="p-[20px] md:p-[24px] hover:bg-[#F9F9FB] transition-colors flex flex-col md:flex-row md:items-center justify-between gap-[16px]"
                >
                  <div className="flex items-start gap-[16px]">
                    <div className={`w-[40px] h-[40px] rounded-[12px] flex items-center justify-center shrink-0 ${isPaid ? 'bg-[#34C759]/10' : 'bg-[#FF9500]/10'}`}>
                      {isPaid
                        ? <CheckCircle className="w-[20px] h-[20px] text-[#34C759]" />
                        : <Clock className="w-[20px] h-[20px] text-[#FF9500]" />
                      }
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-[#1C1C1E] line-clamp-1 mb-[4px]">
                        {reg.workshops.title}
                      </h3>
                      <div className="flex items-center gap-[8px] text-[13px] text-[#8E8E93] font-medium flex-wrap">
                        <span>{formatDate(reg.workshops.start_time)}</span>
                        {reg.workshops.room && (
                          <>
                            <span>•</span>
                            <span>{reg.workshops.room}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:flex-col md:items-end gap-[4px] pl-[56px] md:pl-0">
                    <span className="text-[17px] font-bold tracking-tight text-[#1C1C1E]">
                      {isFree ? 'Miễn phí' : `${reg.workshops.fee_vnd.toLocaleString('vi-VN')}đ`}
                    </span>
                    <span className={`text-[12px] font-bold uppercase tracking-wider ${isPaid ? 'text-[#34C759]' : 'text-[#FF9500]'}`}>
                      {isPaid ? 'Đã xác nhận' : 'Chờ thanh toán'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function AccountPage() {
  const { profile, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setEmailDraft(profile?.email ?? '')
  }, [profile?.email])

  useEffect(() => {
    if (activeTab !== 'payment') return
    setLoadingRegs(true)
    api.get<Registration[]>('/registrations/me')
      .then(data => setRegistrations(data))
      .catch(() => {})
      .finally(() => setLoadingRegs(false))
  }, [activeTab])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailMessage(null)

    const nextEmail = emailDraft.trim().toLowerCase()
    if (!nextEmail) {
      setEmailMessage({ type: 'error', text: 'Vui lòng nhập email.' })
      return
    }

    if (!EMAIL_PATTERN.test(nextEmail)) {
      setEmailMessage({ type: 'error', text: 'Email không đúng định dạng.' })
      return
    }

    setEmailSaving(true)
    const result = await updateProfile({ email: nextEmail })
    setEmailSaving(false)

    if (result.error || !result.profile) {
      const message = result.error?.includes('already') || result.error?.includes('registered')
        ? 'Email này đã được sử dụng bởi tài khoản khác.'
        : result.error ?? 'Không thể cập nhật email.'
      setEmailMessage({ type: 'error', text: message })
      return
    }

    setEmailDraft(result.profile.email ?? nextEmail)
    setEmailMessage({ type: 'success', text: 'Email đã được cập nhật.' })
  }

  const displayName = profile?.display_name ?? '—'
  const email = profile?.email ?? ''
  const mssv = profile?.mssv ?? null

  return (
    <div
      className="min-h-screen bg-[#F5F5F7] text-[#1C1C1E]"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
    >
      <main className="max-w-[1100px] mx-auto px-[20px] md:px-[32px] py-[40px] flex flex-col lg:flex-row gap-[40px]">
        <aside className="w-full lg:w-[260px] shrink-0">
          <div className="sticky top-[80px]">
            <nav className="flex flex-col gap-[4px]">
              <NavItem id="general" icon={User} label="Thông tin sinh viên" activeTab={activeTab} setActiveTab={setActiveTab} />
              <NavItem id="payment" icon={CreditCard} label="Lịch sử đăng ký" activeTab={activeTab} setActiveTab={setActiveTab} />
              <div className="my-[12px] h-[1px] bg-[#E5E5EA] mx-[16px]" />
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-[12px] px-[16px] py-[12px] rounded-[14px] text-[#FF3B30] hover:bg-[#FF3B30]/10 font-medium transition-colors"
              >
                <LogOut className="w-[20px] h-[20px]" />
                <span className="text-[15px]">Đăng xuất</span>
              </button>
            </nav>
          </div>
        </aside>

        <section className="flex-1 min-w-0">
          {activeTab === 'general' && (
            <GeneralView
              displayName={displayName}
              email={email}
              mssv={mssv}
              registrationCount={registrations.length}
              emailDraft={emailDraft}
              emailSaving={emailSaving}
              emailMessage={emailMessage}
              onEmailDraftChange={setEmailDraft}
              onEmailSubmit={handleEmailSubmit}
            />
          )}
          {activeTab === 'payment' && (
            <PaymentView registrations={registrations} loading={loadingRegs} />
          )}
        </section>
      </main>
    </div>
  )
}
