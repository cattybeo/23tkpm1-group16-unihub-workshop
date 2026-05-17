import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

const EMAIL_DOMAIN = 'students.unihub.internal'

export function mssvToEmail(mssv: string) {
  return `${mssv.trim()}@${EMAIL_DOMAIN}`
}

function resolveEmail(account: string): string {
  return account.includes('@') ? account.trim() : `${account.trim()}@${EMAIL_DOMAIN}`
}

interface Profile {
  id: string
  role: 'student' | 'organizer' | 'staff'
  mssv: string | null
  display_name: string
  must_change_password: boolean
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  loginWithMssv: (mssv: string, password: string) => Promise<{ profile: Profile | null; error: string | null }>
  logout: () => Promise<void>
  completePasswordChange: (newPassword: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    loading: true,
  })

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, mssv, display_name, must_change_password')
      .eq('id', userId)
      .maybeSingle()

    if (error || !data) return null
    return data as Profile | null
  }, [])

  const applySession = useCallback(async (session: Session | null) => {
    const profile = session ? await loadProfile(session.user.id) : null
    if (session && !profile) {
      setState({ session: null, user: null, profile: null, loading: false })
      await supabase.auth.signOut()
      return
    }

    setState({ session, user: session?.user ?? null, profile, loading: false })
  }, [loadProfile])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return
      await applySession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (!active) return
        void applySession(session)
      }, 0)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [applySession])

  async function loginWithMssv(mssv: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolveEmail(mssv),
      password,
    })

    if (error || !data.session) {
      const msg = error?.message ?? ''
      const vietnameseError =
        msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid credentials')
          ? 'Tài khoản hoặc mật khẩu không đúng.'
          : msg.toLowerCase().includes('email not confirmed')
          ? 'Tài khoản chưa được xác nhận.'
          : msg.toLowerCase().includes('too many requests')
          ? 'Quá nhiều lần thử. Vui lòng thử lại sau.'
          : msg || 'Đăng nhập thất bại.'
      return { profile: null, error: vietnameseError }
    }

    const profile = await loadProfile(data.session.user.id)
    if (!profile) {
      await supabase.auth.signOut()
      setState({ session: null, user: null, profile: null, loading: false })
      return { profile: null, error: 'Không tìm thấy hồ sơ tài khoản. Vui lòng liên hệ ban tổ chức.' }
    }

    setState({ session: data.session, user: data.session.user, profile, loading: false })

    return { profile, error: null }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  async function completePasswordChange(newPassword: string) {
    const { error: authErr } = await supabase.auth.updateUser({ password: newPassword })
    if (authErr) return { error: authErr.message }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', state.user!.id)

    if (profileErr) return { error: profileErr.message }

    // Cập nhật local state
    setState(s => s.profile ? { ...s, profile: { ...s.profile, must_change_password: false } } : s)
    return { error: null }
  }

  return (
    <AuthContext.Provider value={{ ...state, loginWithMssv, logout, completePasswordChange }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
