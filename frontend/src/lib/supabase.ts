import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
let currentAccessToken: string | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Thiếu biến môi trường Supabase tại Frontend. Kiểm tra file .env');
}

async function authorizedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  if (currentAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }

  return fetch(input, { ...init, headers });
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
  },
  global: {
    fetch: authorizedFetch,
  },
});

export async function syncSupabaseAccessToken(token: string | null) {
  currentAccessToken = token;

  if (token) {
    await supabase.realtime.setAuth(token);
    return;
  }

  await supabase.realtime.setAuth();
}
