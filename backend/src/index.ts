import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import workshopRoutes     from './routes/workshop.routes.js'
import adminRoutes        from './routes/csv.routes.js'
import authRoutes         from './routes/auth.routes.js'
import registrationRoutes from './routes/registration.routes.js'
import paymentRoutes      from './routes/payment.routes.js'
import { createNotificationRoutes } from './routes/notification.routes.js'
import { sendError }      from './shared/http.js'
import { releasePendingSeats } from './services/registration.service.js'
import { EmailNotifier } from './modules/notify/email-notifier.js'
import { InAppNotifier } from './modules/notify/in-app-notifier.js'
import { registerNotificationListeners } from './modules/notify/listener.js'
import { NotificationService } from './modules/notify/notification.service.js'

const app = express()
const notificationService = new NotificationService([
  new InAppNotifier(),
  new EmailNotifier(),
])

registerNotificationListeners(notificationService)

app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.text({ type: ['text/csv', 'text/plain'] }))

// Global rate limit: 200 req / 15 min / IP
app.use(rateLimit({
  windowMs:       15 * 60_000,
  max:            200,
  standardHeaders: true,
  legacyHeaders:  false,
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
app.use('/api/v1/admin',         adminRoutes)
app.use('/api/v1/registrations', registrationRateLimit, registrationRoutes)
app.use('/api/v1/payments',      paymentRoutes)
app.use('/api/v1/notifications', createNotificationRoutes(notificationService))

app.get('/healthz', (_req, res) => res.json({ data: { ok: true }, error: null }))

// Seat release cron — runs every 60 seconds
setInterval(() => {
  releasePendingSeats().catch(err => {
    console.error('[cron] unhandled error in releasePendingSeats:', err)
  })
}, 60_000)

setInterval(() => {
  notificationService.retryPending().catch(err => {
    console.error('[cron] unhandled error in notification retry:', err)
  })
}, 5 * 60_000)

const port = process.env.PORT ?? 3000
app.listen(port, () => {
  console.log(`Server running on :${port}`)
})
