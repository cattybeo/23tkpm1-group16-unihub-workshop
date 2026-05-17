import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Check, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'
import { LoginFormSchema, firstZodMessage } from '../lib/auth-validation'
import hcmusLogo from '../../../img/hcmus-logo.png'

export default function LoginPage() {
  const { loginWithMssv, loading: authLoading, profile, session } = useAuth()
  const navigate = useNavigate()
  const submittedRef = useRef(false)

  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const normalizedAccount = account.trim()

  useEffect(() => {
    const resetTransientSubmitState = () => {
      submittedRef.current = false
      setLoading(false)
      setSuccess(false)
    }

    window.addEventListener('pageshow', resetTransientSubmitState)
    return () => window.removeEventListener('pageshow', resetTransientSubmitState)
  }, [])

  useEffect(() => {
    // Chỉ auto-redirect nếu user vừa submit form (submittedRef = true)
    // Không redirect khi user chủ động vào /login để đăng xuất hoặc đổi tài khoản
    if (!submittedRef.current) return
    if (authLoading || !session) return
    if (!profile) return
    navigate(profile?.must_change_password ? '/change-password' : '/', { replace: true })
  }, [authLoading, navigate, profile?.must_change_password, session])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const parsed = LoginFormSchema.safeParse({ account: account, password })
    if (!parsed.success) {
      setError(firstZodMessage(parsed.error))
      return
    }

    setLoading(true)
    submittedRef.current = true

    try {
      const { profile: loginProfile, error: loginErr } = await loginWithMssv(parsed.data.account, parsed.data.password)

      if (loginErr) {
        submittedRef.current = false
        setError(loginErr)
        return
      }

      setSuccess(true)
      navigate(loginProfile?.must_change_password === true ? '/change-password' : '/', { replace: true })
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
              <div className="mb-[34px]">
                <img src={hcmusLogo} alt="HCMUS" className="mx-auto mt-[14px] h-[150px] w-auto object-contain" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-[16px]" noValidate>
                <div>
                  <label htmlFor="account" className="mb-[7px] block text-[14px] font-semibold text-[#3A3A3C]">
                    Tài khoản
                  </label>
                  <input
                    id="account"
                    type="text"
                    value={account}
                    onChange={e => setAccount(e.target.value)}
                    placeholder="MSSV hoặc email tài khoản"
                    required
                    autoFocus
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                    className="h-[52px] w-full rounded-[14px] border border-[#D1D1D6] bg-white px-[16px] text-[16px] font-medium text-[#1C1C1E] outline-none transition focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/10"
                  />
                </div>

                <div>
                  <div className="mb-[7px]">
                    <label htmlFor="password" className="block text-[14px] font-semibold text-[#3A3A3C]">
                      Mật khẩu
                    </label>
                  </div>

                  <div className="relative">
                    <input
                      id="password"
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

                <div className="flex min-h-[44px] items-center justify-between gap-[12px]">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-[10px] text-[14px] font-semibold text-[#3A3A3C]">
                    <span className="relative flex h-[22px] w-[22px] items-center justify-center">
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={e => setRememberDevice(e.target.checked)}
                        className="peer h-[22px] w-[22px] appearance-none rounded-[7px] border border-[#C7C7CC] transition checked:border-[#007AFF] checked:bg-[#007AFF] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                      />
                      <Check className="pointer-events-none absolute h-[14px] w-[14px] text-white opacity-0 transition peer-checked:opacity-100" aria-hidden="true" />
                    </span>
                    Ghi nhớ thiết bị này
                  </label>
                  <button
                    type="button"
                    className="min-h-[44px] shrink-0 rounded-[10px] px-[4px] text-[13px] font-semibold text-[#007AFF] transition hover:text-[#006DEB] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                  >
                    Quên mật khẩu?
                  </button>
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

                {success && (
                  <div
                    className="flex items-center gap-[10px] rounded-[14px] border border-[#CDEFD8] bg-[#F0FFF4] p-[12px] text-[14px] font-semibold text-[#1E7A3A]"
                    role="status"
                    aria-live="polite"
                  >
                    <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
                    Đăng nhập thành công, đang chuyển hướng...
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !normalizedAccount || !password}
                  className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#007AFF] text-[17px] font-semibold text-white transition hover:bg-[#006DEB] hover:shadow-[0_8px_22px_rgba(0,122,255,0.28)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-[21px] w-[21px] animate-spin" aria-label="Đang đăng nhập" /> : 'Đăng nhập'}
                </button>


                <div className="flex items-center gap-[16px] py-[2px]" aria-hidden="true">
                  <div className="h-px flex-1 bg-[#E5E5EA]" />
                  <span className="text-[12px] font-bold text-[#8E8E93]">HOẶC</span>
                  <div className="h-px flex-1 bg-[#E5E5EA]" />
                </div>

                <button
                  type="button"
                  className="flex h-[52px] w-full items-center justify-center gap-[10px] rounded-[14px] border border-[#D1D1D6] bg-white text-[16px] font-semibold text-[#1C1C1E] transition hover:bg-[#F2F2F7] active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                >
                  <span className="flex h-[28px] w-[28px] items-center justify-center overflow-hidden rounded-[8px] bg-white">
                    <img src={hcmusLogo} alt="" className="h-[26px] w-[26px] object-contain" />
                  </span>
                  Đăng nhập với Student Email
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
