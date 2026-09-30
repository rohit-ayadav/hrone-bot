import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';
import AttendanceLog from '@/models/AttendanceLog';
import { markAttendance, DEFAULT_OFFICE_LOCATION } from '@/lib/markAttendance';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow sufficient duration for multi-user randomized human execution delays

export async function GET(request: Request) {
    // 1. Security: Prevent unauthorized triggers
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        await connectToDatabase();

        // 2. Fetch all active registered users from MongoDB
        let users = await User.find({ autoMarkEnabled: true, registrationState: 'IDLE' });

        // Fallback: If MongoDB has no active users but env variables exist, construct fallback user
        if ((!users || users.length === 0) && process.env.HR_USERNAME && process.env.HR_PASSWORD) {
            users = [{
                chatId: process.env.TELEGRAM_CHAT_ID || '',
                hrUsername: process.env.HR_USERNAME,
                hrPassword: process.env.HR_PASSWORD,
                domainCode: 'uharvest',
                employeeId: 4050,
                workMode: 'OFFICE',
                officeLatitude: DEFAULT_OFFICE_LOCATION.latitude,
                officeLongitude: DEFAULT_OFFICE_LOCATION.longitude,
                officeGeoLocation: DEFAULT_OFFICE_LOCATION.geoLocation,
                latitude: DEFAULT_OFFICE_LOCATION.latitude,
                longitude: DEFAULT_OFFICE_LOCATION.longitude,
                geoAccuracy: DEFAULT_OFFICE_LOCATION.geoAccuracy,
                geoLocation: DEFAULT_OFFICE_LOCATION.geoLocation,
                autoMarkEnabled: true,
                registrationState: 'IDLE',
            } as any];
        }

        const enableJitter = searchParams.get('jitter') !== 'false';
        const results: any[] = [];

        // Randomize the order of users to prevent predictable, robotic execution sequences across triggers
        if (enableJitter && users.length > 1) {
            for (let i = users.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [users[i], users[j]] = [users[j], users[i]];
            }
            console.log(`[Human Jitter] Shuffled execution order for ${users.length} users: ${users.map((u: any) => u.hrUsername).join(', ')}`);
        }

        // 3. Execute attendance mark for each active user with real-time execution jitter
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            let jitterDelayMs = 0;

            // Apply randomized human execution delay to prevent synchronized robot punch patterns
            if (enableJitter) {
                // Initial delay for the 1st user: 3s to 18s (or custom min/max)
                // Subsequent delays between different users: 10s to 35s (or custom min/max)
                const defaultMin = i === 0 ? 3 : 10;
                const defaultMax = i === 0 ? 18 : 35;
                const minSec = searchParams.get('minDelay') ? Math.max(0, parseInt(searchParams.get('minDelay')!, 10)) : defaultMin;
                const maxSec = searchParams.get('maxDelay') ? Math.max(minSec, parseInt(searchParams.get('maxDelay')!, 10)) : defaultMax;
                jitterDelayMs = Math.floor((minSec * 1000) + Math.random() * ((maxSec - minSec) * 1000));

                console.log(`[Human Jitter] Random User #${i + 1}/${users.length} (${user.hrUsername}): Waiting ${(jitterDelayMs / 1000).toFixed(1)}s before punching...`);
                await new Promise((r) => setTimeout(r, jitterDelayMs));
            }

            try {
                const result = await markAttendance(undefined, {
                    hrUsername: user.hrUsername,
                    hrPassword: user.hrPassword,
                    domainCode: user.domainCode,
                    employeeId: user.employeeId,
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
                    outPunchExtensionMinutes: user.outPunchExtensionMinutes,
                    outPunchExtensionDate: user.outPunchExtensionDate,
                    skipPunchOutDate: user.skipPunchOutDate,
                });

                const reqJson = JSON.stringify(result.requestPayload, null, 2);
                const truncatedReq = reqJson.length > 1500 ? reqJson.substring(0, 1500) + '\n... (truncated)' : reqJson;

                const resJson = JSON.stringify(result.response, null, 2);
                const truncatedRes = resJson.length > 1500 ? resJson.substring(0, 1500) + '\n... (truncated)' : resJson;

                const workModeDisplay = result.workMode === 'WFH' ? '🏠 WFH (Home)' : '🏢 Office';
                const earlyBadge = result.isEarlyOut ? ' ⚠️ (Early Punch-Out)' : '';
                const successMessage =
                    `⏰ <b>Automated Attendance Triggered (Success)</b>\n\n` +
                    `<b>Account:</b> ${user.hrUsername}\n` +
                    `<b>Action:</b> Punch ${result.action}${earlyBadge}\n` +
                    `<b>Punch Time:</b> ${result.punchTime} (IST)\n` +
                    `<b>Work Mode:</b> ${workModeDisplay}\n` +
                    `<b>Location:</b> ${result.requestPayload?.geoLocation || user.geoLocation}\n` +
                    `<b>Status:</b> Success ✅\n\n` +
                    `<b>📤 Sent Request Payload:</b>\n` +
                    `<pre><code class="language-json">${truncatedReq}</code></pre>\n\n` +
                    `<b>📥 Received API Response:</b>\n` +
                    `<pre><code class="language-json">${truncatedRes}</code></pre>`;

                if (user.chatId) {
                    await AttendanceLog.create({
                        chatId: user.chatId,
                        hrUsername: user.hrUsername,
                        action: result.action,
                        punchTime: result.punchTime,
                        status: 'SUCCESS',
                        source: 'AUTOMATED_CRON',
                        requestPayload: result.requestPayload,
                        responsePayload: result.response,
                    });

                    await sendTelegramMessage(
                        successMessage,
                        user.chatId,
                        {
                            inline_keyboard: [
                                [{ text: '📍 Punch Attendance Again', callback_data: 'action_mark' }],
                                [{ text: 'ℹ️ Check System Status', callback_data: 'action_status' }]
                            ]
                        }
                    );
                }

                results.push({
                    chatId: user.chatId,
                    username: user.hrUsername,
                    status: 'success',
                    jitterDelaySeconds: Math.round(jitterDelayMs / 100) / 10,
                    result,
                });
            } catch (userErr: any) {
                console.error(`Automated punch status for user ${user.hrUsername}:`, userErr.message);

                const isSkipReason = userErr.message && (
                    userErr.message.includes('Already Punched Out') ||
                    userErr.message.includes('Minimum 9 working hours required') ||
                    userErr.message.includes('Check-In recorded today') ||
                    userErr.message.includes('Auto Punch-Out skipped for today')
                );

                const now = new Date();
                const istTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

                if (isSkipReason) {
                    const skipMessage =
                        `ℹ️ <b>Automated Attendance Check (Skipped)</b>\n\n` +
                        `<b>Account:</b> ${user.hrUsername}\n` +
                        `<b>Note:</b> ${userErr.message}\n` +
                        `<b>Checked At:</b> ${istTime} (IST)`;

                    if (user.chatId) {
                        await sendTelegramMessage(
                            skipMessage,
                            user.chatId,
                            {
                                inline_keyboard: [
                                    [{ text: '📍 Punch Attendance Now', callback_data: 'action_mark' }],
                                    [{ text: '📊 Today Logs', callback_data: 'action_history' }]
                                ]
                            }
                        );
                    }

                    results.push({
                        chatId: user.chatId,
                        username: user.hrUsername,
                        status: 'skipped',
                        jitterDelaySeconds: Math.round(jitterDelayMs / 100) / 10,
                        reason: userErr.message,
                    });
                } else {
                    const isGatewayIssue = userErr.message && (
                        userErr.message.includes('502') ||
                        userErr.message.includes('503') ||
                        userErr.message.includes('504') ||
                        userErr.message.includes('Gateway')
                    );

                    const gatewayTip = isGatewayIssue
                        ? `\n\n💡 <i>The HRone Gateway server timed out or returned a gateway error after 3 automatic retries. Peak morning/evening traffic may be affecting HRone.</i>`
                        : '';

                    const failureMessage =
                        `🚨 <b>Automated Attendance Failed!</b>\n\n` +
                        `<b>Account:</b> ${user.hrUsername}\n` +
                        `<b>Error:</b> ${userErr.message || 'Unknown error'}\n` +
                        `<b>Timestamp:</b> ${istTime} (IST)\n` +
                        `<b>Domain:</b> ${user.domainCode || 'uharvest'}${gatewayTip}\n\n` +
                        (userErr.stack ? `<b>Stack Trace:</b>\n<pre><code>${userErr.stack.substring(0, 800)}</code></pre>` : '');

                    if (user.chatId) {
                        await AttendanceLog.create({
                            chatId: user.chatId,
                            hrUsername: user.hrUsername,
                            action: (new Date().getHours() < 14 ? 'In' : 'Out'),
                            punchTime: new Date().toISOString(),
                            status: 'FAILED',
                            source: 'AUTOMATED_CRON',
                            errorMessage: userErr.message || 'Unknown error',
                        });

                        await sendTelegramMessage(
                            failureMessage,
                            user.chatId,
                            {
                                inline_keyboard: [
                                    [{ text: '🔄 Retry Punch Now', callback_data: 'action_mark' }],
                                    [{ text: 'ℹ️ Check System Status', callback_data: 'action_status' }]
                                ]
                            }
                        );
                    }

                    results.push({
                        chatId: user.chatId,
                        username: user.hrUsername,
                        status: 'failed',
                        jitterDelaySeconds: Math.round(jitterDelayMs / 100) / 10,
                        error: userErr.message,
                    });
                }
            }
        }

        // 4. Handle incomplete setup users & disabled auto-punch users to notify them of missed attendance
        const incompleteOrDisabledUsers = await User.find({
            $or: [
                { registrationState: { $ne: 'IDLE' } },
                { autoMarkEnabled: false, registrationState: 'IDLE' }
            ]
        });

        const incompleteNotified: any[] = [];

        for (const user of incompleteOrDisabledUsers) {
            if (!user.chatId) continue;

            if (user.registrationState !== 'IDLE') {
                const incompleteMsg =
                    `⚠️ <b>Automated Attendance Missed!</b>\n\n` +
                    `<b>Account Status:</b> Registration Incomplete 🛠️\n` +
                    `<b>Current Step:</b> ${getFriendlyStateName(user.registrationState)}\n\n` +
                    `Automated check-in/check-out could not be marked for you because your HRone account setup is incomplete.\n\n` +
                    `Tap below to complete your setup now so your attendance can be auto-punched:`;

                await sendTelegramMessage(
                    incompleteMsg,
                    user.chatId,
                    {
                        inline_keyboard: [
                            [{ text: '🚀 Complete Setup Now', callback_data: 'action_register' }]
                        ]
                    }
                );

                incompleteNotified.push({
                    chatId: user.chatId,
                    status: 'notified_incomplete',
                    state: user.registrationState
                });
            } else if (!user.autoMarkEnabled) {
                const disabledMsg =
                    `⏸️ <b>Automated Attendance Skipped (Auto-Punch Off)</b>\n\n` +
                    `<b>Account:</b> ${user.hrUsername}\n` +
                    `<b>Status:</b> Auto-Punch is turned OFF 🔴\n\n` +
                    `Automated attendance was skipped because auto-punch is currently disabled for your profile.\n\n` +
                    `You can punch manually now or enable auto-punch anytime:`;

                await sendTelegramMessage(
                    disabledMsg,
                    user.chatId,
                    {
                        inline_keyboard: [
                            [{ text: '📍 Punch Attendance Now', callback_data: 'action_mark' }],
                            [{ text: '▶️ Enable Auto-Punch', callback_data: 'action_toggle_auto' }]
                        ]
                    }
                );

                incompleteNotified.push({
                    chatId: user.chatId,
                    username: user.hrUsername,
                    status: 'notified_disabled'
                });
            }
        }

        return NextResponse.json({
            success: true,
            totalProcessed: users.length,
            results,
            incompleteOrDisabledNotified: incompleteNotified.length,
            incompleteResults: incompleteNotified
        });
    } catch (error: any) {
        console.error('Failed execution in multi-user attendance cron:', error);
        return NextResponse.json({ error: 'Cron Failed', details: error.message }, { status: 500 });
    }
}

function getFriendlyStateName(state: string): string {
    switch (state) {
        case 'AWAITING_HR_USERNAME':
            return 'Awaiting HRone Username';
        case 'AWAITING_HR_PASSWORD':
            return 'Awaiting HRone Password';
        case 'AWAITING_LOCATION':
            return 'Awaiting GPS Location';
        case 'AWAITING_TRANSFER_OTP':
            return 'Awaiting Transfer OTP';
        default:
            return 'Incomplete Setup';
    }
}