import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import hcmusLogo from '../../../img/hcmus-logo.png'

function getEmployeeHomeRoute(role: 'student' | 'organizer' | 'staff'): string {
  if (role === 'organizer') return '/admin'
  return '/staff'
}

export default function StaffLoginPage() {
  const { loginWithAccount, logout, loading: authLoading, profile, session } = useAuth()
  const navigate = useNavigate()
  const submittedRef = useRef(false)

  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const normalizedAccount = account.trim()

  useEffect(() => {
    const resetTransientSubmitState = () => {
      submittedRef.current = false
      setLoading(false)
    }

    window.addEventListener('pageshow', resetTransientSubmitState)
    return () => window.removeEventListener('pageshow', resetTransientSubmitState)
  }, [])

  useEffect(() => {
    if (!submittedRef.current) return
    if (authLoading || !session) return
    if (!profile) return
    if (profile.role === 'student') return
    navigate(getEmployeeHomeRoute(profile.role), { replace: true })
  }, [authLoading, navigate, profile, session])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    setLoading(true)
    submittedRef.current = true

    try {
      const { profile: loginProfile, error: loginErr } = await loginWithAccount(account, password, {
        loginType: 'staff',
      })

      if (loginErr) {
        submittedRef.current = false
        setError(loginErr)
        return
      }

      if (!loginProfile || loginProfile.role === 'student') {
        await logout()
        submittedRef.current = false
        setError('Tài khoản này không có quyền nhân viên hoặc ban tổ chức.')
        return
      }

      navigate(getEmployeeHomeRoute(loginProfile.role), { replace: true })
    } catch {
      submittedRef.current = false
      setError('Không thể kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const isSubmitting = loading || authLoading

  return (
    <main className="overflow-hidden bg-[#F2F2F7] px-[16px] pb-[28px] pt-[32px] text-[#1C1C1E] sm:px-[24px] lg:px-[32px]">
      <div className="mx-auto flex w-full max-w-[460px] flex-col">
        <section className="flex items-start pb-[12px]">
          <div className="w-full">
            <div className="rounded-[22px] border border-white bg-white p-[22px] shadow-[0_18px_60px_rgba(0,0,0,0.08)] sm:p-[28px] md:p-[32px]">
              <div className="mb-[24px]">
                <img src={hcmusLogo} alt="HCMUS" className="mx-auto mt-[14px] h-[120px] w-auto object-contain" />
                <h1 className="mt-[12px] text-center text-[20px] font-semibold text-[#1C1C1E]">Đăng nhập tài khoản nhân viên</h1>
              </div>

              <form onSubmit={handleSubmit} className="space-y-[16px]" noValidate>
                <div>
                  <label htmlFor="staff-account" className="mb-[7px] block text-[14px] font-semibold text-[#3A3A3C]">
                    Tài khoản
                  </label>
                  <input
                    id="staff-account"
                    type="text"
                    value={account}
                    onChange={e => setAccount(e.target.value)}
                    placeholder="Nhập tài khoản nhân viên"
                    required
                    autoFocus
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                    className="h-[52px] w-full rounded-[14px] border border-[#D1D1D6] bg-white px-[16px] text-[16px] font-medium text-[#1C1C1E] outline-none transition focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/10"
                  />
                </div>

                <div>
                  <label htmlFor="staff-password" className="mb-[7px] block text-[14px] font-semibold text-[#3A3A3C]">
                    Mật khẩu
                  </label>
                  <div className="relative">
                    <input
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu"
                      required
                      autoComplete="current-password"
                      className="h-[52px] w-full rounded-[14px] border border-[#D1D1D6] bg-white pl-[16px] pr-[52px] text-[16px] font-medium text-[#1C1C1E] outline-none transition focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      className="absolute right-[6px] top-[4px] flex h-[44px] w-[44px] items-center justify-center rounded-[12px] text-[#8E8E93] transition hover:bg-[#F2F2F7] hover:text-[#1C1C1E] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="h-[20px] w-[20px]" /> : <Eye className="h-[20px] w-[20px]" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    className="flex items-start gap-[10px] rounded-[14px] border border-[#FFD6D2] bg-[#FFF2F0] p-[12px] text-[14px] font-medium leading-6 text-[#B42318]"
                    role="alert"
                    aria-live="polite"
                  >
                    <AlertCircle className="mt-[2px] h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !normalizedAccount || !password}
                  className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#007AFF] text-[17px] font-semibold text-white transition hover:bg-[#006DEB] hover:shadow-[0_8px_22px_rgba(0,122,255,0.28)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-[21px] w-[21px] animate-spin" aria-label="Đang đăng nhập" /> : 'Đăng nhập'}
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="flex h-[52px] w-full items-center justify-center rounded-[14px] border border-[#D1D1D6] bg-white text-[16px] font-semibold text-[#1C1C1E] transition hover:bg-[#F2F2F7] active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                >
                  Quay trở lại
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
