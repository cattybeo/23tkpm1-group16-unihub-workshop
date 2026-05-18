import { initCronJobs } from './workers/cron-jobs.js'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'

// Infra adapters
import { MockPaymentGateway } from './infra/payment/mock-payment-gateway.js'

// Services (depend on interfaces, not concrete infra)
import { PaymentService } from './services/payment.service.js'
import { RegistrationService } from './services/registration.service.js'

// Route factories
import { createRegistrationRoutes } from './routes/registration.routes.js'
import { createPaymentRoutes }      from './routes/payment.routes.js'
import { createAdminRoutes }        from './routes/csv.routes.js'
import workshopRoutes               from './routes/workshop.routes.js'
import authRoutes                   from './routes/auth.routes.js'
import checkinRoutes                from './modules/checkin/checkin-router.js'
import summaryRouter                from './modules/ai-summary/summary-router.js'
import { createNotificationRoutes } from './routes/notification.routes.js'

import { sendError, type ErrorCode } from './shared/http.js'
import { EmailNotifier }             from './modules/notify/email-notifier.js'
import { InAppNotifier }             from './modules/notify/in-app-notifier.js'
import { registerNotificationListeners } from './modules/notify/listener.js'
import { NotificationService }          from './modules/notify/notification.service.js'

// ---------------------------------------------------------------------------
// DI — wire interfaces to adapters and compose services
// ---------------------------------------------------------------------------

const notificationService = new NotificationService([
  new InAppNotifier(),
  new EmailNotifier(),
])

const registrationService = new RegistrationService()
const paymentService      = new PaymentService(new MockPaymentGateway())

registerNotificationListeners(notificationService)

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()

app.use(helmet())
app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json())
app.use(express.text({ type: ['text/csv', 'text/plain'] }))

// Global rate limit: 200 req / 15 min / IP
app.use(rateLimit({
  windowMs:        15 * 60_000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) => {
    sendError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests')
  },
}))

// Critical rate limit: 20 req / min / IP — only for POST /registrations
const registrationRateLimit = rateLimit({
  windowMs:        60_000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) => {
    sendError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many registration requests, please slow down')
  },
})

app.use('/api/v1/auth',          authRoutes)
app.use('/api/v1/workshops',     workshopRoutes)
app.use('/api/v1/admin',         createAdminRoutes(registrationService))
app.use('/api/v1/registrations', registrationRateLimit, createRegistrationRoutes(registrationService))
app.use('/api/v1/payments',      createPaymentRoutes(paymentService))
app.use('/api/v1/check-ins',     checkinRoutes)
app.use('/api/v1/workshops',     summaryRouter)
app.use('/api/v1/notifications', createNotificationRoutes(notificationService))

app.get('/healthz', (_req, res) => res.json({ data: { ok: true }, error: null }))

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
    ? err.status
    : 500

  if (status === 413 && req.is('application/pdf')) {
    sendError(res, 400, 'PDF_INVALID_TYPE', 'File PDF vượt quá giới hạn 5MB.')
    return
  }

  const code = err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
    ? err.code as ErrorCode
    : 'VALIDATION_FAILED'
  const message = err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
    ? err.message
    : err instanceof Error
      ? err.message
      : 'Unexpected server error'

  sendError(res, status, code, message)
})

// ---------------------------------------------------------------------------
// Cron jobs
// ---------------------------------------------------------------------------

// Seat release — every 60s (expire pending_payment registrations > 15 min)
setInterval(() => {
  registrationService.releasePendingSeats().catch(err => {
    console.error('[cron] unhandled error in releasePendingSeats:', err)
  })
}, 60_000)

// Notification retry — every 5 min
setInterval(() => {
  notificationService.retryPending().catch(err => {
    console.error('[cron] unhandled error in notification retry:', err)
  })
}, 5 * 60_000)

const port = process.env.PORT ?? 3000
app.listen(port, () => {
  console.log(`Server running on :${port}`)
  initCronJobs()
})
