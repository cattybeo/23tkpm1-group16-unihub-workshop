import { supabase } from '../../lib/supabase.js'
import type { INotifier, NotificationDto, NotificationPayload, NotificationStatus } from './types.js'

interface NotificationRow {
  id: string
  user_id: string
  registration_id: string | null
  title: string
  body: string
  status: NotificationStatus
  retry_count: number
  read_at: string | null
  created_at: string
}

interface UserEmailResult {
  user: {
    email?: string | null
  } | null
}

export class NotificationService {
  constructor(private readonly notifiers: INotifier[]) {}

  async dispatch(notificationId: string, allowStuck = false): Promise<void> {
    const row = await this.claim(notificationId, allowStuck)
    if (!row) return

    const payload = await this.toPayload(row)
    const results = await Promise.allSettled(
      this.notifiers.map(notifier => notifier.send(payload)),
    )

    const inAppOk = results.some((result, index) => (
      this.notifiers[index]?.channel === 'in_app' && result.status === 'fulfilled'
    ))

    if (!inAppOk) {
      await this.markFailed(row, this.firstError(results) ?? 'In-app notification failed')
      return
    }

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[notify] ${this.notifiers[index]?.channel ?? 'unknown'} failed:`, result.reason)
      }
    })

    await this.markSent(row.id)
  }

  async retryPending(): Promise<void> {
    const cutoffIso = new Date(Date.now() - 2 * 60_000).toISOString()

    const pending = await this.findRetryCandidates(['pending', 'failed'], cutoffIso)
    const stuck = await this.findRetryCandidates(['in_progress'], cutoffIso)
    const ids = new Set([...pending, ...stuck].map(row => row.id))

    await Promise.allSettled(
      Array.from(ids).map(id => this.dispatch(id, true)),
    )
  }

  async listForUser(userId: string): Promise<NotificationDto[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, registration_id, title, body, status, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .returns<NotificationDto[]>()

    if (error) throw new Error(error.message)
    return data ?? []
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationDto | null> {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select('id, registration_id, title, body, status, read_at, created_at')
      .returns<NotificationDto[]>()

    if (error) throw new Error(error.message)
    return data?.[0] ?? null
  }

  private async claim(notificationId: string, allowStuck: boolean): Promise<NotificationRow | null> {
    const baseClaim = supabase
      .from('notifications')
      .update({ status: 'in_progress', last_error: null })
      .eq('id', notificationId)
      .lt('retry_count', 3)
      .select('id, user_id, registration_id, title, body, status, retry_count, read_at, created_at')

    const { data, error } = await baseClaim
      .in('status', ['pending', 'failed'])
      .returns<NotificationRow[]>()

    if (error) throw new Error(error.message)
    if (data && data.length > 0) return data[0]
    if (!allowStuck) return null

    const cutoffIso = new Date(Date.now() - 2 * 60_000).toISOString()
    const { data: stuck, error: stuckError } = await supabase
      .from('notifications')
      .update({ status: 'in_progress', last_error: null })
      .eq('id', notificationId)
      .eq('status', 'in_progress')
      .lt('updated_at', cutoffIso)
      .lt('retry_count', 3)
      .select('id, user_id, registration_id, title, body, status, retry_count, read_at, created_at')
      .returns<NotificationRow[]>()

    if (stuckError) throw new Error(stuckError.message)
    return stuck?.[0] ?? null
  }

  private async toPayload(row: NotificationRow): Promise<NotificationPayload> {
    const { data, error } = await supabase.auth.admin.getUserById(row.user_id)
    const userData = data as UserEmailResult | null

    if (error) {
      console.error('[notify] failed to load email for notification:', error.message)
    }

    return {
      id: row.id,
      userId: row.user_id,
      userEmail: userData?.user?.email ?? null,
      registrationId: row.registration_id,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
    }
  }

  private async markSent(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ status: 'sent', last_error: null })
      .eq('id', notificationId)

    if (error) throw new Error(error.message)
  }

  private async markFailed(row: NotificationRow, reason: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'failed',
        retry_count: row.retry_count + 1,
        last_error: reason,
      })
      .eq('id', row.id)

    if (error) throw new Error(error.message)
  }

  private async findRetryCandidates(
    statuses: NotificationStatus[],
    cutoffIso: string,
  ): Promise<Array<Pick<NotificationRow, 'id'>>> {
    const { data, error } = await supabase
      .from('notifications')
      .select('id')
      .in('status', statuses)
      .lt('retry_count', 3)
      .lt('updated_at', cutoffIso)
      .returns<Array<Pick<NotificationRow, 'id'>>>()

    if (error) throw new Error(error.message)
    return data ?? []
  }

  private firstError(results: PromiseSettledResult<void>[]): string | null {
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (!rejected) return null
    if (rejected.reason instanceof Error) return rejected.reason.message
    return String(rejected.reason)
  }
}
