export interface NotificationDto {
  id: string
  registration_id: string | null
  title: string
  body: string
  status: 'pending' | 'in_progress' | 'sent' | 'failed'
  read_at: string | null
  created_at: string
}

interface ApiError {
  code: string
  message: string
  details?: unknown
}

interface ApiEnvelope<T> {
  data: T | null
  error: ApiError | null
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiEnvelope<T>
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? 'Notification request failed')
  }
  if (body.data === null) {
    throw new Error('Notification response is empty')
  }
  return body.data
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

export async function fetchNotifications(accessToken: string): Promise<NotificationDto[]> {
  const response = await fetch('/api/v1/notifications', {
    headers: authHeaders(accessToken),
  })
  return parseEnvelope<NotificationDto[]>(response)
}

export async function markNotificationRead(
  accessToken: string,
  notificationId: string,
): Promise<NotificationDto> {
  const response = await fetch(`/api/v1/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
  })
  return parseEnvelope<NotificationDto>(response)
}
