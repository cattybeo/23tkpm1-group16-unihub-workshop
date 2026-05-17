import type { INotifier, NotificationPayload } from './types.js'

export class InAppNotifier implements INotifier {
  readonly channel = 'in_app'

  async send(payload: NotificationPayload): Promise<void> {
    if (!payload.id || !payload.userId) {
      throw new Error('Invalid in-app notification payload')
    }
  }
}
