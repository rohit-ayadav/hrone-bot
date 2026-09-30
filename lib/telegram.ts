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

export async function editTelegramMessage(
    text: string,
    chatId: string | number,
    messageId: string | number,
    replyMarkup?: any
) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId || !messageId) return null;

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'HTML',
                reply_markup: replyMarkup,
            }),
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
            // Ignore benign "message is not modified" error from Telegram
            if (data.description && data.description.includes('message is not modified')) {
                return data;
            }
            console.error('Telegram Edit Error:', data);
        }
        return data;
    } catch (error) {
        console.error('Failed to edit Telegram message:', error);
        return null;
    }
}

export async function deleteTelegramMessage(chatId: string | number, messageId: string | number) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId || !messageId) return false;

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
            }),
        });
        const data = await response.json();
        return !!data.ok;
    } catch (error) {
        console.error('Failed to delete Telegram message:', error);
        return false;
    }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text,
                show_alert: showAlert,
            }),
        });
    } catch (error) {
        console.error('Failed to answer Telegram callback query:', error);
    }
}

export function renderProgressBar(percentage: number, totalBlocks = 10): string {
    const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
    const filledBlocks = Math.max(0, Math.min(totalBlocks, Math.round((clamped / 100) * totalBlocks)));
    const emptyBlocks = totalBlocks - filledBlocks;
    return '🟩'.repeat(filledBlocks) + '⬜'.repeat(emptyBlocks);
}

export function getPersistentReplyKeyboard() {
    return {
        keyboard: [
            [{ text: '⚡ Quick Punch' }, { text: '📊 Shift Status' }],
            [{ text: '🏢 Mode: Office / WFH' }, { text: '⚙️ Menu & Settings' }]
        ],
        resize_keyboard: true,
        persistent: true
    };
}

export async function setupBotCommands(): Promise<boolean> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return false;

    const commands = [
        { command: 'mark', description: '⚡ Punch attendance (Check-In / Out)' },
        { command: 'status', description: '📊 Today shift progress bar & hours' },
        { command: 'workmode', description: '🏢 Toggle Office vs WFH mode' },
        { command: 'wfh', description: '🏠 Switch mode to Work From Home' },
        { command: 'office', description: '🏢 Switch mode to Office (altF)' },
        { command: 'setwfh', description: '📍 Set your WFH/Home address' },
        { command: 'setoffice', description: '📍 Set your Office address' },
        { command: 'resetoffice', description: '🏢 Reset office to default (altF)' },
        { command: 'extend', description: '⏳ Extend today shift (e.g. /extend 30)' },
        { command: 'history', description: '📅 Calendar view & daily punch logs' },
        { command: 'stats', description: '📈 Monthly attendance analytics' },
        { command: 'settings', description: '⚙️ Account settings & auto-punch' },
        { command: 'help', description: '❓ User guide and instructions' },
    ];

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands }),
        });
        const data = await response.json();
        return !!data.ok;
    } catch (e) {
        console.error('Failed to setup bot commands:', e);
        return false;
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