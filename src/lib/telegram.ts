export interface TelegramResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a message via Telegram Bot API
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<TelegramResult> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return { ok: false, error: data.description || "Unknown Telegram API error" };
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Network error";
    return { ok: false, error: errorMessage };
  }
}
