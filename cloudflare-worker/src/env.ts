/**
 * Shared types for the Cloudflare Worker.
 */

export interface Env {
  BOT_TOKEN: string;
  ADMIN_PASSWORD: string;
  PRODUCTION_URL: string;
  SUBSCRIBERS: KVNamespace;
}
