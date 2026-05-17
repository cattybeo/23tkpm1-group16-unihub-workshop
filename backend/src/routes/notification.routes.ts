import { Router } from 'express'
import { z } from 'zod'
import { loadProfile, verifyJwt } from '../middleware/auth.js'
import type { NotificationService } from '../modules/notify/notification.service.js'
import { sendError, sendSuccess } from '../shared/http.js'

const ParamsSchema = z.object({
  id: z.string().uuid(),
})

export function createNotificationRoutes(notificationService: NotificationService): Router {
  const router = Router()

  router.get(
    '/',
    verifyJwt,
    loadProfile,
    async (req, res) => {
      try {
        const notifications = await notificationService.listForUser(req.user!.id)
        sendSuccess(res, notifications)
      } catch (err) {
        const e = err as Error
        sendError(res, 500, 'VALIDATION_FAILED', e.message)
      }
    },
  )

  router.patch(
    '/:id/read',
    verifyJwt,
    loadProfile,
    async (req, res) => {
      const parsed = ParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_FAILED', 'Invalid notification id', parsed.error.flatten())
        return
      }

      try {
        const notification = await notificationService.markRead(req.user!.id, parsed.data.id)
        if (!notification) {
          sendError(res, 404, 'RESOURCE_NOT_FOUND', 'Notification not found')
          return
        }

        sendSuccess(res, notification)
      } catch (err) {
        const e = err as Error
        sendError(res, 500, 'VALIDATION_FAILED', e.message)
      }
    },
  )

  return router
}
