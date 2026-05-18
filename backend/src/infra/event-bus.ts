import { EventEmitter } from 'node:events'

export const REGISTRATION_CONFIRMED_EVENT = 'RegistrationConfirmed' as const

export interface RegistrationConfirmedEvent {
  notificationId: string
}

export const WORKSHOP_CHANGED_EVENT = 'WorkshopChanged' as const

export interface WorkshopChangedEvent {
  workshopId: string
  notificationTitle: string
  notificationBody: string
}

export const eventBus = new EventEmitter()
