import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchNotifications,
  markNotificationRead,
  type NotificationDto,
} from './notifications-api'
import { useAuth } from './auth-context'

interface NotificationsContextValue {
  notifications: NotificationDto[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  markRead: (notificationId: string) => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  const [notifications, setNotifications] = useState<NotificationDto[]>([])
  const [loading, setLoading] = useState(false)

  const accessToken = profile?.must_change_password ? null : session?.access_token ?? null

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setNotifications([])
      return
    }

    setLoading(true)
    try {
      const data = await fetchNotifications(accessToken)
      setNotifications(data)
    } catch (error) {
      console.error('[notifications] refresh failed:', error)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  const markRead = useCallback(async (notificationId: string) => {
    if (!accessToken) return

    try {
      const updated = await markNotificationRead(accessToken, notificationId)
      setNotifications(current => current.map(item => (
        item.id === updated.id ? updated : item
      )))
    } catch (error) {
      console.error('[notifications] mark read failed:', error)
    }
  }, [accessToken])

  useEffect(() => {
    void refresh()
    if (!accessToken) return undefined

    const intervalId = window.setInterval(() => {
      void refresh()
    }, 60_000)

    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [accessToken, refresh])

  const unreadCount = useMemo(
    () => notifications.filter(notification => notification.read_at === null).length,
    [notifications],
  )

  const value = useMemo<NotificationsContextValue>(() => ({
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
  }), [notifications, unreadCount, loading, refresh, markRead])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationsContext)
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider')
  return context
}
