import type { User } from '@supabase/supabase-js';

let ramToken: string | null = null;
let ramUser: User | null = null;

export const setAuth = (user: User, token: string) => {
  ramToken = token;
  ramUser = user;
};

export const getAuthToken = () => ramToken;
export const getUser = () => ramUser;

export const clearAuth = () => {
  ramToken = null;
  ramUser = null;
};
