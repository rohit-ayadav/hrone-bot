import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';
import { sendTelegramMessage } from '@/lib/telegram';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await connectToDatabase();

        let users = await User.find({ autoMarkEnabled: true, registrationState: 'IDLE' });

        if ((!users || users.length === 0) && process.env.TELEGRAM_CHAT_ID) {
            users = [{
                chatId: process.env.TELEGRAM_CHAT_ID,
                hrUsername: process.env.HR_USERNAME || 'Default User',
                geoLocation: '210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India',
            } as any];
        }

        const now = new Date();
        const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const hour = istDate.getHours();
        const shiftMode = hour < 14 ? 'In' : 'Out';

        const dispatched: string[] = [];

        for (const user of users) {
            if (!user.chatId) continue;

            const alertMessage =
                `🔔 <b>Pre-Punch Alert (15-Minute Reminder)</b>\n\n` +
                `Hello <b>${user.hrUsername}</b>! Your automated <b>Punch ${shiftMode}</b> is scheduled in 15 minutes.\n` +
                `<b>Target Location:</b> ${user.geoLocation || 'altF Sector 142, Noida'}\n` +
                `<b>Scheduled Shift:</b> Punch ${shiftMode}\n\n` +
                `Tap below to punch immediately or skip today's auto-punch.`;

            await sendTelegramMessage(
                alertMessage,
                user.chatId,
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

            dispatched.push(user.hrUsername);
        }

        return NextResponse.json({
            success: true,
            message: `Pre-punch alert dispatched to ${dispatched.length} user(s)`,
            shiftMode,
            users: dispatched,
        });
    } catch (error: any) {
        console.error('Failed to dispatch pre-punch alerts:', error);
        return NextResponse.json({ error: 'Alert failed', details: error.message }, { status: 500 });
    }
}
