import type { NextFunction, Request, Response } from 'express'
import { supabase } from '../lib/supabase.js'
import { sendError } from '../shared/http.js'

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.headers['idempotency-key']

  if (!key || typeof key !== 'string' || key.trim() === '') {
    sendError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required')
    return
  }

  const trimmedKey = key.trim()
  const userId = req.user?.id ?? null

  // Atomic INSERT: nếu (key, endpoint) chưa có → INSERT thành công (ta là first)
  // Nếu đã có → conflict (PG 23505), RETURNING rỗng
  const { error: insertError } = await supabase
    .from('idempotency_keys')
    .insert({ key: trimmedKey, endpoint: req.path, user_id: userId, response: {} })

  if (insertError) {
    if (insertError.code === '23505') {
      // Key đã tồn tại — fetch để kiểm tra trạng thái
      const { data: existing } = await supabase
        .from('idempotency_keys')
        .select('response')
        .eq('key', trimmedKey)
        .eq('endpoint', req.path)
        .single<{ response: Record<string, unknown> }>()

      if (!existing) {
        sendError(res, 500, 'VALIDATION_FAILED', 'Idempotency key lookup failed')
        return
      }

      const isEmpty = Object.keys(existing.response).length === 0
      if (isEmpty) {
        // Request gốc đang chạy
        sendError(res, 409, 'REQUEST_IN_PROGRESS', 'A request with this key is already in progress')
        return
      }

      // Request đã hoàn thành — trả lại cached response
      res.status(200).json(existing.response)
      return
    }

    sendError(res, 500, 'VALIDATION_FAILED', 'Idempotency check failed')
    return
  }

  // Ta là first — wrap res.json để capture body và lưu vào DB
  const originalJson = res.json.bind(res)
  res.json = (body: unknown) => {
    supabase
      .from('idempotency_keys')
      .update({ response: body })
      .eq('key', trimmedKey)
      .eq('endpoint', req.path)
      .then(({ error }) => {
        if (error) console.error('[idempotency] failed to save response:', error.message)
      })
    return originalJson(body)
  }

  next()
}
