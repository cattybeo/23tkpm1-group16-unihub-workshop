import type { INotifier, NotificationPayload } from './types.js'

export class EmailNotifier implements INotifier {
  readonly channel = 'email'

  async send(payload: NotificationPayload): Promise<void> {
    console.info('[email:mock] registration confirmation', {
      to: payload.userEmail ?? '(missing email)',
      title: payload.title,
      body: payload.body,
      notification_id: payload.id,
      registration_id: payload.registrationId,
    })
  }
}
