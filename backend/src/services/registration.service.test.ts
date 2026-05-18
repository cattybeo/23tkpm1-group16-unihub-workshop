import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  eventBus,
  REGISTRATION_CONFIRMED_EVENT,
  type RegistrationConfirmedEvent,
} from '../infra/event-bus.js'

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

const qrCodeMock = vi.hoisted(() => ({
  toDataURL: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: supabaseMock,
}))

vi.mock('qrcode', () => ({
  default: qrCodeMock,
}))

import { RegistrationService } from './registration.service.js'

describe('registerForWorkshop notification outbox integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventBus.removeAllListeners(REGISTRATION_CONFIRMED_EVENT)
    qrCodeMock.toDataURL.mockResolvedValue('data:image/png;base64,qr')
  })

  it('emits RegistrationConfirmed after a free registration creates outbox notification', async () => {
    const events: RegistrationConfirmedEvent[] = []
    eventBus.on(REGISTRATION_CONFIRMED_EVENT, (event: RegistrationConfirmedEvent) => {
      events.push(event)
    })

    supabaseMock.rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          registration_id: 'registration-1',
          workshop_id: '11111111-1111-1111-1111-111111111111',
          status: 'confirmed',
          qr_token: 'qr-token',
          fee_vnd: 0,
          notification_id: 'notification-1',
        },
        error: null,
      }),
    })

    const service = new RegistrationService()
    const result = await service.registerForWorkshop(
      '22120001',
      '11111111-1111-1111-1111-111111111111',
      'user-1',
    )

    expect(result).toMatchObject({
      registration_id: 'registration-1',
      status: 'confirmed',
      qr_token: 'qr-token',
      qr_image: 'data:image/png;base64,qr',
    })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('create_registration_with_outbox', {
      p_mssv: '22120001',
      p_workshop_id: '11111111-1111-1111-1111-111111111111',
      p_user_id: 'user-1',
    })
    expect(events).toEqual([{ notificationId: 'notification-1' }])
  })
})
