import {
  eventBus,
  REGISTRATION_CONFIRMED_EVENT,
  WORKSHOP_CHANGED_EVENT,
  type RegistrationConfirmedEvent,
  type WorkshopChangedEvent,
} from '../../infra/event-bus.js'
import { supabase } from '../../lib/supabase.js'
import type { NotificationService } from './notification.service.js'

export function registerNotificationListeners(notificationService: NotificationService): void {
  eventBus.on(REGISTRATION_CONFIRMED_EVENT, (event: RegistrationConfirmedEvent) => {
    notificationService.dispatch(event.notificationId).catch(error => {
      console.error('[notify] dispatch failed:', error)
    })
  })

  eventBus.on(WORKSHOP_CHANGED_EVENT, (event: WorkshopChangedEvent) => {
    void handleWorkshopChanged(notificationService, event).catch(error => {
      console.error('[notify] workshop change dispatch failed:', error)
    })
  })
}

async function handleWorkshopChanged(
  notificationService: NotificationService,
  event: WorkshopChangedEvent,
): Promise<void> {
  const { data, error } = await supabase.rpc('notify_workshop_change', {
    p_workshop_id: event.workshopId,
    p_title: event.notificationTitle,
    p_body: event.notificationBody,
  })

  if (error) throw new Error(error.message)

  const rows = (data as Array<{ notification_id: string }> | null) ?? []
  if (rows.length === 0) return

  await Promise.allSettled(
    rows.map(row => notificationService.dispatch(row.notification_id)),
  )
}
