import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const SECRET = process.env.JWT_SECRET!;
export const COOKIE_NAME = 'nh_token';

export interface AuthUser {
  id: number; name: string; email: string; role: string; status: string;
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthUser | null {
  try { return jwt.verify(token, SECRET) as AuthUser; } catch { return null; }
}

export async function getSession(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Build Set-Cookie header string. Using Secure and SameSite=None for HTTPS compatibility.
export function setCookieHeader(token: string) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=None`;
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=None`;
}
