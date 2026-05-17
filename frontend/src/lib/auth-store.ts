let ramToken: string | null = null;
let ramUser: any | null = null;

export const setAuth = (user: any, token: string) => {
  ramToken = token;
  ramUser = user;
  console.log("🔑 [Auth] Token đã được nạp vào RAM.");
};

export const getAuthToken = () => ramToken;
export const getUser = () => ramUser;

export const clearAuth = () => {
  ramToken = null;
  ramUser = null;
};