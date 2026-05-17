import { useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotifications } from '@/lib/notifications-context'

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, loading } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Thông báo"
        onClick={() => setOpen(current => !current)}
        className="relative w-[32px] h-[32px] rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] transition-colors"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-[4px] -right-[4px] min-w-[18px] h-[18px] px-[5px] rounded-full bg-[#FF3B30] text-white text-[11px] leading-[18px] font-bold text-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-[10px] w-[320px] max-w-[calc(100vw-32px)] bg-white border border-[#E5E5EA] rounded-[14px] shadow-[0_16px_45px_rgba(0,0,0,0.16)] overflow-hidden z-[70]">
          <div className="px-[14px] py-[12px] border-b border-[#F2F2F7] flex items-center justify-between">
            <p className="text-[15px] font-semibold text-[#1C1C1E]">Thông báo</p>
            {loading && <span className="text-[12px] text-[#8E8E93]">Đang tải</span>}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-[16px] py-[28px] text-center text-[14px] text-[#8E8E93]">
                Chưa có thông báo
              </div>
            ) : (
              notifications.map(notification => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    if (notification.read_at === null) {
                      void markRead(notification.id)
                    }
                  }}
                  className="w-full px-[14px] py-[12px] text-left border-b border-[#F2F2F7] last:border-b-0 hover:bg-[#F9F9FB] transition-colors"
                >
                  <div className="flex items-start gap-[10px]">
                    <div className={`mt-[5px] w-[8px] h-[8px] rounded-full shrink-0 ${notification.read_at === null ? 'bg-[#007AFF]' : 'bg-transparent'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-[8px]">
                        <p className="text-[14px] font-semibold text-[#1C1C1E] leading-snug">
                          {notification.title}
                        </p>
                        {notification.read_at !== null && (
                          <CheckCheck className="w-[15px] h-[15px] text-[#34C759] shrink-0 mt-[1px]" />
                        )}
                      </div>
                      <p className="text-[13px] text-[#3A3A3C] leading-snug mt-[4px] line-clamp-2">
                        {notification.body}
                      </p>
                      <p className="text-[12px] text-[#8E8E93] mt-[6px]">
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
