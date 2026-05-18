export type NotificationStatus = 'pending' | 'in_progress' | 'sent' | 'failed'

export interface NotificationPayload {
  id: string
  userId: string
  userEmail: string | null
  registrationId: string | null
  qrToken: string | null
  title: string
  body: string
  createdAt: string
}

export interface INotifier {
  readonly channel: string
  send(payload: NotificationPayload): Promise<void>
}

export interface NotificationDto {
  id: string
  registration_id: string | null
  title: string
  body: string
  status: NotificationStatus
  read_at: string | null
  created_at: string
}
