import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../infra/supabase.ts';
import { errorResponse } from '../shared/response-envelope.ts';

export const idempotency = async (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['idempotency-key'];
  const endpoint = `${req.method} ${req.path}`;

  if (!key || typeof key !== 'string') {
    return res.status(400).json(errorResponse('IDEMPOTENCY_KEY_REQUIRED', 'Thiếu Idempotency-Key trong header'));
  }

  const { data, error } = await supabaseAdmin
    .from('idempotency_keys')
    .insert({
      key: key,
      endpoint: endpoint,
      user_id: req.user?.id,
      response: { status: 'in_progress' }
    })
    .select()
    .single();

  if (error && error.code === '23505') { 
    const { data: existing } = await supabaseAdmin
      .from('idempotency_keys')
      .select('response')
      .eq('key', key)
      .eq('endpoint', endpoint)
      .single();

    if (existing?.response?.status === 'in_progress') {
      return res.status(409).json(errorResponse('REQUEST_IN_PROGRESS', 'Yêu cầu đang được xử lý, vui lòng không gửi lại'));
    }
    
    return res.json(existing?.response);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    supabaseAdmin
      .from('idempotency_keys')
      .update({ response: body })
      .eq('key', key)
      .eq('endpoint', endpoint)
      .then();

    return originalJson(body);
  };

  next();
};