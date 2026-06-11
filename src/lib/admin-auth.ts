/**
 * Admin Authentication System
 *
 * Simple password-based admin authentication using JWT tokens.
 * The admin password is stored in the AppConfig table.
 * JWT tokens are stored in HTTP-only cookies.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getConfig } from "./config-seeder";

const JWT_SECRET_KEY = "gold-dashboard-admin-secret-key-2024";
const JWT_ALG = "HS256";
const ADMIN_COOKIE_NAME = "admin_session";
const TOKEN_EXPIRY = "7d"; // 7 days

/**
 * Get the JWT secret key as Uint8Array
 */
function getSecret(): Uint8Array {
  return new TextEncoder().encode(JWT_SECRET_KEY);
}

/**
 * Create an admin session JWT token
 */
export async function createAdminSession(): Promise<string> {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecret());
  return token;
}

/**
 * Verify an admin session JWT token
 */
export async function verifyAdminSession(token: string): Promise<boolean> {
  try {
    const payload = await jwtVerify(token, getSecret());
    return payload.payload.role === "admin";
  } catch {
    return false;
  }
}

/**
 * Get the current admin session from cookies (server-side)
 */
export async function getAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return false;
    return await verifyAdminSession(token);
  } catch {
    return false;
  }
}

/**
 * Verify admin password against stored config
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const storedPassword = await getConfig("ADMIN_PASSWORD");
  if (!storedPassword) {
    // No password set — first time setup, any password works and becomes the password
    return true;
  }
  return password === storedPassword;
}

/**
 * Set admin session cookie
 */
export const ADMIN_COOKIE_NAME_EXPORT = ADMIN_COOKIE_NAME;
