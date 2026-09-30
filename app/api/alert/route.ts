import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';
import AttendanceLog from '@/models/AttendanceLog';
import { sendTelegramMessage } from '@/lib/telegram';
import { getISTParts, getEffectiveUserLocation } from '@/lib/markAttendance';

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
                workMode: 'OFFICE',
                geoLocation: '210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India',
            } as any];
        }

        const now = new Date();
        const istParts = getISTParts(now);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const todayStr = `${istParts.year}-${pad(istParts.month)}-${pad(istParts.day)}`;
        const hour = istParts.hour;
        const shiftMode = hour < 14 ? 'In' : 'Out';

        const dispatched: string[] = [];

        for (const user of users) {
            if (!user.chatId) continue;

            const effectiveLoc = getEffectiveUserLocation({
                workMode: user.workMode,
                officeLatitude: user.officeLatitude,
                officeLongitude: user.officeLongitude,
                officeGeoLocation: user.officeGeoLocation,
                wfhLatitude: user.wfhLatitude,
                wfhLongitude: user.wfhLongitude,
                wfhGeoLocation: user.wfhGeoLocation,
                latitude: user.latitude,
                longitude: user.longitude,
                geoLocation: user.geoLocation,
                geoAccuracy: user.geoAccuracy,
            });

            const workModeBadge = user.workMode === 'WFH' ? '🏠 WFH (Home)' : '🏢 Office';
            const toggleWorkModeText = user.workMode === 'WFH' ? '🏢 Switch to Office' : '🏠 Switch to WFH';

            if (shiftMode === 'Out') {
                // Query today's attendance logs from MongoDB
                const todayLogs = await AttendanceLog.find({
                    $or: [{ chatId: user.chatId }, { hrUsername: user.hrUsername }],
                    status: 'SUCCESS',
                    punchTime: { $regex: todayStr }
                }).sort({ createdAt: 1 });

                const inLog = todayLogs.find((l) => l.action === 'In');
                const outLog = todayLogs.find((l) => l.action === 'Out');

                if (outLog) {
                    // Already punched out today
                    continue;
                }

                if (!inLog) {
                    // Has not punched in today
                    const missedInMsg =
                        `⚠️ <b>Punch-Out Alert: Check-In Missing!</b>\n\n` +
                        `Hello <b>${user.employeeName || user.hrUsername}</b>,\n` +
                        `No <b>Punch In</b> was recorded for your account today (${todayStr}).\n` +
                        `Automated Punch-Out cannot trigger until an initial Check-In is logged.\n\n` +
                        `Tap below if you want to punch in now:`;

                    await sendTelegramMessage(missedInMsg, user.chatId, {
                        inline_keyboard: [
                            [{ text: '📍 Punch Check-In Now', callback_data: 'action_mark' }],
                            [{ text: 'ℹ️ Check Today Logs', callback_data: 'action_history' }]
                        ]
                    });
                    dispatched.push(`${user.hrUsername} (missed-in)`);
                    continue;
                }

                // In punch exists! Calculate exact 9h + extension timing
                const inTime = new Date(inLog.punchTime);
                const elapsedMs = now.getTime() - inTime.getTime();
                const elapsedHours = elapsedMs / (1000 * 60 * 60);

                let extraMinutes = 0;
                if (user.outPunchExtensionDate === todayStr && user.outPunchExtensionMinutes) {
                    extraMinutes = user.outPunchExtensionMinutes;
                }
                const requiredHours = 9 + (extraMinutes / 60);

                const targetOutDate = new Date(inTime.getTime() + (requiredHours * 60 * 60 * 1000));
                const remainingMs = Math.max(0, targetOutDate.getTime() - now.getTime());
                const remHours = Math.floor(remainingMs / (1000 * 60 * 60));
                const remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

                const formatTime = (d: Date) => {
                    const parts = getISTParts(d);
                    const h = parts.hour % 12 || 12;
                    const ampm = parts.hour >= 12 ? 'PM' : 'AM';
                    return `${pad(h)}:${pad(parts.minute)} ${ampm}`;
                };

                const inTimeFormatted = formatTime(inTime);
                const targetOutFormatted = formatTime(targetOutDate);
                const isEligibleNow = elapsedHours >= requiredHours;
                const isSkippedToday = user.skipPunchOutDate === todayStr;

                const extensionBadge = extraMinutes > 0 ? ` (+${extraMinutes}m extension)` : '';
                const statusBadge = isSkippedToday
                    ? '⏸️ Auto-Out Skipped Today'
                    : isEligibleNow
                    ? '🟢 Eligible to Punch Out Now'
                    : `⏳ In Progress (${remHours}h ${remMins}m remaining)`;

                const alertMessage =
                    `🔔 <b>Smart 9-Hour Punch-Out Reminder</b>\n\n` +
                    `Hello <b>${user.employeeName || user.hrUsername}</b>!\n` +
                    `• <b>Check-In Time:</b> ${inTimeFormatted} IST\n` +
                    `• <b>Target Out Time:</b> ${targetOutFormatted} IST${extensionBadge}\n` +
                    `• <b>Time Elapsed:</b> ${Math.floor(elapsedHours)}h ${Math.floor((elapsedHours % 1) * 60)}m\n` +
                    `• <b>Status:</b> ${statusBadge}\n` +
                    `• <b>Work Mode:</b> ${workModeBadge}\n` +
                    `• <b>Location:</b> ${effectiveLoc.geoLocation}\n\n` +
                    (isSkippedToday
                        ? `<i>Automated punch-out is paused for today. You can still punch out manually anytime.</i>`
                        : `<i>Automated punch-out will trigger once your shift requirement is satisfied.</i>`);

                await sendTelegramMessage(alertMessage, user.chatId, {
                    inline_keyboard: [
                        [
                            { text: '⚡ Punch Out Now', callback_data: 'action_mark' },
                            { text: '⏳ Extend +30m', callback_data: 'action_extend_30' }
                        ],
                        [
                            { text: '⏳ Extend +1h', callback_data: 'action_extend_60' },
                            { text: '⏸️ Skip Auto-Out Today', callback_data: 'action_skip_out_today' }
                        ],
                        [
                            { text: toggleWorkModeText, callback_data: 'action_toggle_workmode' },
                            { text: 'ℹ️ Check Status', callback_data: 'action_status' }
                        ]
                    ]
                });

                dispatched.push(user.hrUsername);
            } else {
                // Morning Punch-In Alert
                const alertMessage =
                    `🔔 <b>Pre-Punch In Alert (15-Minute Reminder)</b>\n\n` +
                    `Hello <b>${user.employeeName || user.hrUsername}</b>! Your automated <b>Punch In</b> is scheduled in 15 minutes.\n\n` +
                    `• <b>Work Mode:</b> ${workModeBadge}\n` +
                    `• <b>Target Location:</b> ${effectiveLoc.geoLocation}\n\n` +
                    `Tap below to punch in immediately, switch between Office/WFH, or skip today's auto-punch:`;

                await sendTelegramMessage(alertMessage, user.chatId, {
                    inline_keyboard: [
                        [
                            { text: '⚡ Punch Attendance Now', callback_data: 'action_mark' },
                            { text: toggleWorkModeText, callback_data: 'action_toggle_workmode' }
                        ],
                        [
                            { text: '⏸️ Skip Today', callback_data: 'action_skip' },
                            { text: 'ℹ️ Check System Status', callback_data: 'action_status' }
                        ]
                    ]
                });

                dispatched.push(user.hrUsername);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Smart pre-punch alerts dispatched to ${dispatched.length} user(s)`,
            shiftMode,
            users: dispatched,
        });
    } catch (error: any) {
        console.error('Failed to dispatch pre-punch alerts:', error);
        return NextResponse.json({ error: 'Alert failed', details: error.message }, { status: 500 });
    }
}
