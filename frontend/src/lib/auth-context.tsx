import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, syncSupabaseAccessToken } from './supabase'
import { clearAuth, setAuth } from './auth-store'
import { api } from './api-client'

interface Profile {
  id: string
  email: string | null
  role: 'student' | 'organizer' | 'staff'
  mssv: string | null
  display_name: string
  phone: string | null
  must_change_password: boolean
}

interface LoginResponse {
  session: { access_token: string; expires_at: number | null }
  user: User
  profile: Profile
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  loginWithAccount: (
    account: string,
    password: string,
    options?: { loginType?: 'student' | 'staff' }
  ) => Promise<{ profile: Profile | null; error: string | null }>
  logout: () => Promise<void>
  completePasswordChange: (newPassword: string) => Promise<{ error: string | null }>
  updateProfile: (patch: { email?: string; display_name?: string; phone?: string | null }) => Promise<{ profile: Profile | null; error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  })

  useEffect(() => {
    let active = true
    ;(async () => {
      const refreshed = await api.refresh()
      if (!active) return
      if (!refreshed) {
        clearAuth()
        setState({ session: null, user: null, profile: null, loading: false })
        return
      }
      setState({
        session: { access_token: refreshed.access_token } as unknown as Session,
        user: refreshed.user,
        profile: refreshed.profile as Profile,
        loading: false,
      })
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    void syncSupabaseAccessToken(state.session?.access_token ?? null)
  }, [state.session?.access_token])

  async function loginWithAccount(
    account: string,
    password: string,
    options?: { loginType?: 'student' | 'staff' },
  ) {
    const loginType = options?.loginType ?? 'student'

    try {
      const data = await api.post<LoginResponse>('/auth/login', { account, password, login_type: loginType })
      setAuth(data.user, data.session.access_token)
      setState({
        session: { access_token: data.session.access_token } as unknown as Session,
        user: data.user,
        profile: data.profile,
        loading: false,
      })
      return { profile: data.profile, error: null }
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code ?? '').toUpperCase()
        : ''
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : ''

      if (code === 'FORBIDDEN_ROLE') {
        return { profile: null, error: 'Tài khoản này không có quyền nhân viên hoặc ban tổ chức.' }
      }

      if (code === 'INVALID_EMAIL' || code === 'INVALID_STUDENT_EMAIL') {
        return {
          profile: null,
          error: loginType === 'staff'
            ? 'Email tài khoản không đúng định dạng.'
            : 'Email đăng nhập không đúng định dạng.',
        }
      }

      const normalized = msg.toLowerCase()
      const vietnameseError =
        code === 'AUTH_LOGIN_FAILED' || normalized.includes('invalid login') || normalized.includes('invalid credentials')
          ? 'Tài khoản hoặc mật khẩu không đúng.'
          : normalized.includes('email not confirmed')
          ? 'Tài khoản chưa được xác nhận.'
          : normalized.includes('too many requests')
          ? 'Quá nhiều lần thử. Vui lòng thử lại sau.'
          : msg || 'Đăng nhập thất bại.'

      return { profile: null, error: vietnameseError }
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout', {})
    } catch {
      // logout phải success local dù network fail
    }
    clearAuth()
    setState({ session: null, user: null, profile: null, loading: false })
  }

  async function completePasswordChange(newPassword: string) {
    if (!state.user) return { error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' }

    const { error: authErr } = await supabase.auth.updateUser({ password: newPassword })
    if (authErr) return { error: authErr.message }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', state.user!.id)

    if (profileErr) return { error: profileErr.message }

    setState(s => s.profile ? { ...s, profile: { ...s.profile, must_change_password: false } } : s)
    return { error: null }
  }

  async function updateProfile(patch: { email?: string; display_name?: string; phone?: string | null }) {
    try {
      const profile = await api.patch<Profile>('/auth/me', patch)
      const refreshed = await api.refresh()
      const nextSession = refreshed
        ? ({ access_token: refreshed.access_token } as unknown as Session)
        : state.session
      const nextUser = refreshed?.user ?? state.user

      if (refreshed && nextUser) {
        setAuth(nextUser, refreshed.access_token)
      }

      setState(s => ({
        ...s,
        session: nextSession,
        user: nextUser,
        profile,
        loading: false,
      }))

      return { profile, error: null }
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : 'Cập nhật thông tin thất bại.'
      return { profile: null, error: msg }
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, loginWithAccount, logout, completePasswordChange, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
