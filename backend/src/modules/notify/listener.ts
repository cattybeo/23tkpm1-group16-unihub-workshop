import {
  eventBus,
  REGISTRATION_CONFIRMED_EVENT,
  type RegistrationConfirmedEvent,
} from '../../infra/event-bus.js'
import type { NotificationService } from './notification.service.js'

export function registerNotificationListeners(notificationService: NotificationService): void {
  eventBus.on(REGISTRATION_CONFIRMED_EVENT, (event: RegistrationConfirmedEvent) => {
    notificationService.dispatch(event.notificationId).catch(error => {
      console.error('[notify] dispatch failed:', error)
    })
  })
}
