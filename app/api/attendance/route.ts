import { NextResponse } from 'next/server';
import { markAttendance } from '@/lib/markAttendance';
import { sendTelegramMessage } from '@/lib/telegram';

export async function GET(request: Request) {
    // 1. Security: Prevent unauthorized triggers
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await markAttendance();

        // Format full HRone API response payload for Telegram
        const payloadJson = JSON.stringify(result.response, null, 2);
        const truncatedPayload = payloadJson.length > 2500 ? payloadJson.substring(0, 2500) + '\n... (truncated)' : payloadJson;

        const successMessage =
            `⏰ <b>Automated Attendance Triggered (Success)</b>\n\n` +
            `<b>Action:</b> Punch ${result.action}\n` +
            `<b>Punch Time:</b> ${result.punchTime} (IST)\n` +
            `<b>Location:</b> altF Sector 142, Noida\n` +
            `<b>Status:</b> Success ✅\n\n` +
            `<b>Full API Response Payload:</b>\n` +
            `<pre><code class="language-json">${truncatedPayload}</code></pre>`;

        // Send notification to Telegram channel/user with action keyboard
        await sendTelegramMessage(
            successMessage,
            undefined, // Uses process.env.TELEGRAM_CHAT_ID
            {
                inline_keyboard: [
                    [{ text: '📍 Punch Attendance Again', callback_data: 'action_mark' }],
                    [{ text: 'ℹ️ Check System Status', callback_data: 'action_status' }]
                ]
            }
        );

        // Return complete API response data to HTTP caller
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Failed to mark attendance:', error);

        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toLocaleString('en-IN');

        const failureMessage =
            `🚨 <b>Automated Attendance Failed!</b>\n\n` +
            `<b>Error:</b> ${error.message || 'Unknown error'}\n` +
            `<b>Timestamp:</b> ${istTime} (IST)\n` +
            `<b>Domain:</b> uharvest\n` +
            `<b>Endpoint:</b> app.hrone.cloud\n\n` +
            (error.stack ? `<b>Stack Trace:</b>\n<pre><code>${error.stack.substring(0, 800)}</code></pre>` : '');

        // Send detailed failure alert with a Retry button
        await sendTelegramMessage(
            failureMessage,
            undefined, // Uses process.env.TELEGRAM_CHAT_ID
            {
                inline_keyboard: [
                    [{ text: '🔄 Retry Punch Now', callback_data: 'action_mark' }],
                    [{ text: 'ℹ️ Check System Status', callback_data: 'action_status' }]
                ]
            }
        );

        return NextResponse.json({
            success: false,
            error: 'Attendance Marking Failed',
            details: error.message,
            stack: error.stack,
        }, { status: 500 });
    }
}