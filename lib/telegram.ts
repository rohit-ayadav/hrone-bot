export async function sendTelegramMessage(
    text: string,
    chatId?: string | number,
    replyMarkup?: any
) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !targetChatId) {
        console.warn('Telegram token or target chatId missing. Skipping telegram message.');
        return null;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: text,
                parse_mode: 'HTML',
                reply_markup: replyMarkup,
            }),
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
            console.error('Telegram API Error:', data);
        }
        return data;
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
        return null;
    }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text,
            }),
        });
    } catch (error) {
        console.error('Failed to answer Telegram callback query:', error);
    }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
            headers: {
                'User-Agent': 'HROne-Bot/1.0 (contact@devblogger.in)'
            }
        });
        if (response.ok) {
            const data = await response.json();
            if (data && data.display_name) {
                return data.display_name;
            }
        }
    } catch (e) {
        console.error('Reverse geocode failed:', e);
    }
    return `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;
}