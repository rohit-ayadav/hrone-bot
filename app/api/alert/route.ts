import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hour = istDate.getHours();
    const shiftMode = hour < 14 ? 'In' : 'Out';

    const alertMessage =
        `🔔 <b>Pre-Punch Alert (15-Minute Reminder)</b>\n\n` +
        `Your automated <b>Punch ${shiftMode}</b> is scheduled in 15 minutes.\n` +
        `<b>Target Location:</b> altF Sector 142, Noida\n` +
        `<b>Scheduled Shift:</b> Punch ${shiftMode}\n\n` +
        `Tap below to punch immediately or skip today's auto-punch.`;

    const result = await sendTelegramMessage(
        alertMessage,
        undefined, // target default chat ID
        {
            inline_keyboard: [
                [
                    { text: '⚡ Punch Attendance Now', callback_data: 'action_mark' },
                    { text: '⏸️ Skip Today', callback_data: 'action_skip' }
                ],
                [
                    { text: 'ℹ️ Check System Status', callback_data: 'action_status' }
                ]
            ]
        }
    );

    return NextResponse.json({
        success: true,
        message: 'Pre-punch alert dispatched to Telegram',
        shiftMode,
        telegramResponse: result,
    });
}
