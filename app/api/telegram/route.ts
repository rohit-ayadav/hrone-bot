import { NextResponse } from 'next/server';
import { markAttendance, getAttendanceHistory } from '@/lib/markAttendance';
import { sendTelegramMessage, answerCallbackQuery } from '@/lib/telegram';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // 1. Handle Inline Button Click (Callback Queries)
        if (body.callback_query) {
            const callbackQuery = body.callback_query;
            const chatId = callbackQuery.message.chat.id;
            const data = callbackQuery.data;

            await answerCallbackQuery(callbackQuery.id, 'Processing request...');

            if (data === 'action_mark') {
                await handleMarkAttendance(chatId);
            } else if (data === 'action_status') {
                await handleStatusRequest(chatId);
            } else if (data === 'action_history') {
                await handleHistoryRequest(chatId);
            } else if (data === 'action_skip') {
                await handleSkipRequest(chatId);
            }

            return NextResponse.json({ ok: true });
        }

        // 2. Handle Text Commands
        const message = body.message;
        if (!message || !message.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id;
        const text = message.text.trim();

        if (text.startsWith('/mark')) {
            await handleMarkAttendance(chatId);
        } else if (text.startsWith('/status')) {
            await handleStatusRequest(chatId);
        } else if (text.startsWith('/history')) {
            await handleHistoryRequest(chatId);
        } else if (text.startsWith('/start') || text.startsWith('/help')) {
            await handleHelpRequest(chatId);
        } else {
            // Unrecognized text command, reply with help options
            await sendTelegramMessage(
                `🤖 <b>HROne Bot Instructions</b>\n\n` +
                `Send /mark to punch attendance, /history to view logs, or /status for system state.`,
                chatId,
                getInteractiveKeyboard()
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('Error handling Telegram webhook:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}

async function handleMarkAttendance(chatId: string | number) {
    await sendTelegramMessage('⏳ <b>Processing attendance punch...</b>', chatId);

    try {
        const result = await markAttendance();

        const payloadJson = JSON.stringify(result.response, null, 2);
        const truncatedPayload = payloadJson.length > 2500 ? payloadJson.substring(0, 2500) + '\n... (truncated)' : payloadJson;

        const successText =
            `✅ <b>Attendance Punched Successfully!</b>\n\n` +
            `<b>Action:</b> Punch ${result.action}\n` +
            `<b>Time:</b> ${result.punchTime} (IST)\n` +
            `<b>Location:</b> altF Sector 142, Noida\n` +
            `<b>Source:</b> Online Web Check-in\n\n` +
            `<b>Full API Response Payload:</b>\n` +
            `<pre><code class="language-json">${truncatedPayload}</code></pre>`;

        await sendTelegramMessage(successText, chatId, getInteractiveKeyboard());
    } catch (error: any) {
        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toLocaleString('en-IN');

        const errorText =
            `❌ <b>Attendance Punch Failed!</b>\n\n` +
            `<b>Error:</b> ${error.message || 'Unknown error'}\n` +
            `<b>Timestamp:</b> ${istTime} (IST)\n` +
            `<b>Domain:</b> uharvest\n` +
            `<b>Endpoint:</b> app.hrone.cloud\n\n` +
            (error.stack ? `<b>Stack Trace:</b>\n<pre><code>${error.stack.substring(0, 800)}</code></pre>` : '');

        await sendTelegramMessage(errorText, chatId, getFailureKeyboard());
    }
}

async function handleHistoryRequest(chatId: string | number) {
    await sendTelegramMessage('⏳ <b>Fetching attendance history from HRone...</b>', chatId);

    try {
        const history = await getAttendanceHistory();
        const historyJson = JSON.stringify(history.data, null, 2);
        const truncatedHistory = historyJson.length > 2500 ? historyJson.substring(0, 2500) + '\n... (truncated)' : historyJson;

        const historyText =
            `📊 <b>HRone Attendance History (${history.month}/${history.year})</b>\n\n` +
            `<b>Domain:</b> uharvest\n` +
            `<b>Employee ID:</b> 4050\n\n` +
            `<b>History Data Payload:</b>\n` +
            `<pre><code class="language-json">${truncatedHistory}</code></pre>`;

        await sendTelegramMessage(historyText, chatId, getInteractiveKeyboard());
    } catch (error: any) {
        await sendTelegramMessage(
            `❌ <b>Failed to fetch attendance history</b>\n\n<b>Error:</b> ${error.message}`,
            chatId,
            getInteractiveKeyboard()
        );
    }
}

async function handleSkipRequest(chatId: string | number) {
    const skipText =
        `⏸️ <b>Auto-Punch Skipped</b>\n\n` +
        `Pre-punch alert acknowledged. Auto-punch action for today's shift has been skipped.`;

    await sendTelegramMessage(skipText, chatId, getInteractiveKeyboard());
}

async function handleStatusRequest(chatId: string | number) {
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hour = istDate.getHours();
    const shiftMode = hour < 14 ? 'In' : 'Out';

    const pad = (n: number) => n.toString().padStart(2, '0');
    const istString = `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${pad(istDate.getDate())} ${pad(istDate.getHours())}:${pad(istDate.getMinutes())}:${pad(istDate.getSeconds())}`;

    const statusText =
        `ℹ️ <b>HROne Bot System Status</b>\n\n` +
        `<b>Current IST Time:</b> ${istString}\n` +
        `<b>Active Shift Mode:</b> Punch ${shiftMode} (${hour < 14 ? 'Before 2 PM' : 'After 2 PM'})\n` +
        `<b>Status:</b> Engine Operational 🟢`;

    await sendTelegramMessage(statusText, chatId, getInteractiveKeyboard());
}

async function handleHelpRequest(chatId: string | number) {
    const helpText =
        `👋 <b>Welcome to HROne Attendance Bot!</b>\n\n` +
        `Available Telegram Controls:\n\n` +
        `• /mark - Punch attendance now\n` +
        `• /history - View monthly attendance logs\n` +
        `• /status - View current IST time & shift mode\n` +
        `• /help - Display this menu`;

    await sendTelegramMessage(helpText, chatId, getInteractiveKeyboard());
}

function getInteractiveKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '📍 Punch Attendance Now', callback_data: 'action_mark' },
                { text: '📊 Attendance History', callback_data: 'action_history' }
            ],
            [
                { text: 'ℹ️ Check System Status', callback_data: 'action_status' }
            ]
        ]
    };
}

function getFailureKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '🔄 Retry Punch Now', callback_data: 'action_mark' },
                { text: '📊 Attendance History', callback_data: 'action_history' }
            ],
            [
                { text: 'ℹ️ Check System Status', callback_data: 'action_status' }
            ]
        ]
    };
}