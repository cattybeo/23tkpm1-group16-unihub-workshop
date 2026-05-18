import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

const ROLE_LABELS: Record<'student' | 'organizer' | 'staff', string> = {
  student: 'Sinh viên',
  organizer: 'Ban tổ chức',
  staff: 'Nhân sự check-in',
}

export function UserMenu() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  async function handleLogout() {
    setOpen(false)
    await logout()
    navigate('/login')
  }

  const initial = profile?.display_name?.charAt(0).toUpperCase() ?? 'U'
  const roleLabel = profile?.role ? ROLE_LABELS[profile.role] : ''

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Tài khoản"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(c => !c)}
        className="w-[32px] h-[32px] rounded-full bg-[#E5E5EA] hover:bg-[#D1D1D6] flex items-center justify-center text-[13px] font-semibold text-[#1C1C1E] transition-colors"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-[10px] w-[240px] bg-white border border-[#E5E5EA] rounded-[14px] shadow-[0_16px_45px_rgba(0,0,0,0.16)] overflow-hidden z-[70]"
        >
          <div className="px-[14px] py-[12px] border-b border-[#F2F2F7]">
            <p className="text-[15px] font-semibold text-[#1C1C1E] truncate">
              {profile?.display_name ?? '—'}
            </p>
            {roleLabel && (
              <span className="inline-block mt-[4px] px-[8px] py-[2px] rounded-[6px] bg-[#007AFF]/10 text-[#007AFF] text-[12px] font-semibold">
                {roleLabel}
              </span>
            )}
          </div>

          <div className="py-[6px]">
            <button
              role="menuitem"
              type="button"
              onClick={() => { navigate('/account'); setOpen(false) }}
              className="w-full flex items-center gap-[10px] px-[14px] py-[11px] text-[15px] font-medium text-[#1C1C1E] hover:bg-[#F2F2F7] transition-colors text-left"
            >
              <User className="w-[17px] h-[17px] text-[#8E8E93]" />
              Quản lý người dùng
            </button>

            <button
              role="menuitem"
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-[10px] px-[14px] py-[11px] text-[15px] font-medium text-[#FF3B30] hover:bg-[#FF3B30]/5 transition-colors text-left"
            >
              <LogOut className="w-[17px] h-[17px]" />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
