/**
 * Telegram Bot API sender — Cloudflare Worker compatible.
 */

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<SendResult> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000) as unknown as AbortSignal,
    });

    const data = (await response.json()) as { ok: boolean; description?: string };

    if (data.ok) {
      return { ok: true };
    }

    return { ok: false, error: data.description || `HTTP ${response.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
