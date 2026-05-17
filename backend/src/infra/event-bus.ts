import { EventEmitter } from 'node:events'

export const REGISTRATION_CONFIRMED_EVENT = 'RegistrationConfirmed' as const

export interface RegistrationConfirmedEvent {
  notificationId: string
}

export const eventBus = new EventEmitter()
