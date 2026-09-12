import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User, { IUser } from '@/models/User';
import AttendanceLog from '@/models/AttendanceLog';
import { markAttendance, getAttendanceHistory, verifyHROneCredentials } from '@/lib/markAttendance';
import { sendTelegramMessage, answerCallbackQuery, reverseGeocode } from '@/lib/telegram';
import { encrypt } from '@/lib/crypto';

export async function POST(request: Request) {
    let body: any = null;
    try {
        await connectToDatabase();
        body = await request.json();

        // 1. Handle Inline Button Click (Callback Queries)
        if (body.callback_query) {
            const callbackQuery = body.callback_query;
            const chatId = String(callbackQuery.message.chat.id);
            const data = callbackQuery.data;

            await answerCallbackQuery(callbackQuery.id, 'Processing request...');

            let user = await User.findOne({ chatId });

            if (data === 'action_register') {
                await startRegistrationWizard(chatId, callbackQuery.from?.username);
            } else if (data === 'action_mark') {
                await handleMarkAttendance(chatId, user);
            } else if (data === 'action_status') {
                await handleStatusRequest(chatId, user);
            } else if (data === 'action_history') {
                await handleHistoryRequest(chatId, undefined, user);
            } else if (data === 'action_pick_date') {
                await handleDatePickerRequest(chatId);
            } else if (data.startsWith('action_hist_day_')) {
                const dayNum = data.replace('action_hist_day_', '');
                await handleHistoryRequest(chatId, dayNum, user);
            } else if (data === 'action_skip') {
                await handleSkipRequest(chatId);
            } else if (data === 'action_toggle_auto') {
                await handleToggleAuto(chatId, user);
            } else if (data === 'action_settings') {
                await handleSettingsRequest(chatId, user);
            } else if (data === 'action_myhistory') {
                await handleMyHistory(chatId, user);
            } else if (data === 'action_help') {
                await handleHelpRequest(chatId, user);
            } else if (data === 'action_monthly_stats') {
                await handleStatsRequest(chatId, user);
            }

            return NextResponse.json({ ok: true });
        }

        // 2. Handle Text Messages & Location Sharing
        const message = body.message;
        if (!message) {
            return NextResponse.json({ ok: true });
        }

        const chatId = String(message.chat.id);
        const telegramUsername = message.from?.username || '';
        let user = await User.findOne({ chatId });

        // Handle Live GPS Location sharing from Telegram
        if (message.location) {
            const { latitude, longitude } = message.location;
            if (user) {
                const geoAddr = await reverseGeocode(latitude, longitude);
                user.latitude = String(latitude);
                user.longitude = String(longitude);
                user.geoLocation = geoAddr;
                user.registrationState = 'IDLE';
                await user.save();

                const successText =
                    `📍 <b>Live GPS Location Updated Successfully!</b>\n\n` +
                    `<b>Latitude:</b> <code>${latitude}</code>\n` +
                    `<b>Longitude:</b> <code>${longitude}</code>\n` +
                    `<b>Geo Address:</b> ${geoAddr}`;

                await sendTelegramMessage(successText, chatId, {
                    ...getInteractiveKeyboard(user),
                    remove_keyboard: true
                });
                return NextResponse.json({ ok: true });
            }
        }

        if (!message.text) {
            return NextResponse.json({ ok: true });
        }

        const text = message.text.trim();

        // Handle Wizard Steps if User is registering
        if (user && user.registrationState !== 'IDLE') {
            const isCommand = text.startsWith('/');
            if (!isCommand) {
                if (user.registrationState === 'AWAITING_HR_USERNAME') {
                    user.hrUsername = text;
                    user.registrationState = 'AWAITING_HR_PASSWORD';
                    await user.save();

                    await sendTelegramMessage(
                        `🔑 <b>Username Saved:</b> <code>${text}</code>\n\n` +
                        `Now please send your <b>HRone Password</b>:`,
                        chatId
                    );
                    return NextResponse.json({ ok: true });
                }

                if (user.registrationState === 'AWAITING_HR_PASSWORD') {
                    await sendTelegramMessage('⏳ <b>Verifying your HRone credentials...</b>', chatId);

                    const verifyRes = await verifyHROneCredentials(user.hrUsername, text, user.domainCode);

                    if (verifyRes.valid) {
                        user.hrPassword = encrypt(text);
                        if (verifyRes.employeeId) user.employeeId = verifyRes.employeeId;
                        user.registrationState = 'IDLE';
                        user.autoMarkEnabled = true;
                        if (telegramUsername) user.telegramUsername = telegramUsername;
                        await user.save();

                        const successMsg =
                            `🎉 <b>Account Registered & Verified Successfully!</b>\n\n` +
                            `<b>Username:</b> <code>${user.hrUsername}</code>\n` +
                            `<b>Employee ID:</b> <code>${user.employeeId}</code>\n` +
                            `<b>Auto-Punch:</b> Enabled 🟢\n\n` +
                            `You can now punch attendance, view logs, or manage settings anytime!`;

                        await sendTelegramMessage(successMsg, chatId, getInteractiveKeyboard(user));
                    } else {
                        await sendTelegramMessage(
                            `❌ <b>Authentication Failed</b>\n\n` +
                            `<b>Reason:</b> ${verifyRes.error || 'Invalid credentials'}\n\n` +
                            `Please send your correct <b>HRone Password</b> to try again:`,
                            chatId
                        );
                    }
                    return NextResponse.json({ ok: true });
                }

                if (user.registrationState === 'AWAITING_LOCATION') {
                    user.geoLocation = text;
                    user.registrationState = 'IDLE';
                    await user.save();

                    await sendTelegramMessage(
                        `📍 <b>Location Updated Successfully!</b>\n\n` +
                        `<b>New Address:</b> ${user.geoLocation}`,
                        chatId,
                        getInteractiveKeyboard(user)
                    );
                    return NextResponse.json({ ok: true });
                }
            }
        }

        // Standard Text Commands
        if (text.startsWith('/start') || text.startsWith('/register')) {
            if (!user || user.registrationState !== 'IDLE') {
                await startRegistrationWizard(chatId, telegramUsername);
            } else {
                await sendTelegramMessage(
                    `👋 <b>Welcome back to HROne Bot!</b>\n\n` +
                    `<b>Registered User:</b> <code>${user.hrUsername}</code>\n` +
                    `<b>Auto-Punch:</b> ${user.autoMarkEnabled ? 'Enabled 🟢' : 'Disabled 🔴'}`,
                    chatId,
                    getInteractiveKeyboard(user)
                );
            }
        } else if (text.startsWith('/mark')) {
            await handleMarkAttendance(chatId, user);
        } else if (text.startsWith('/status')) {
            await handleStatusRequest(chatId, user);
        } else if (text.startsWith('/history')) {
            const parts = text.split(' ');
            const dateParam = parts.slice(1).join(' ').trim();
            if (!dateParam) {
                await handleDatePickerRequest(chatId);
            } else {
                await handleHistoryRequest(chatId, dateParam, user);
            }
        } else if (text.startsWith('/myhistory') || text.startsWith('/dblogs')) {
            await handleMyHistory(chatId, user);
        } else if (text.startsWith('/stats') || text.startsWith('/analytics')) {
            await handleStatsRequest(chatId, user);
        } else if (text.startsWith('/settings')) {
            await handleSettingsRequest(chatId, user);
        } else if (text.startsWith('/toggleauto')) {
            await handleToggleAuto(chatId, user);
        } else if (text.startsWith('/updatecreds')) {
            await startRegistrationWizard(chatId, telegramUsername);
        } else if (text.startsWith('/updatelocation')) {
            await handleLocationUpdateRequest(chatId, user);
        } else if (text.startsWith('/unregister') || text.startsWith('/deleteaccount')) {
            if (user) {
                await User.deleteOne({ chatId });
                await sendTelegramMessage('🗑️ <b>Account Unregistered</b>\n\nYour profile has been deleted and automated punches have stopped.', chatId);
            } else {
                await sendTelegramMessage('You are not currently registered.', chatId);
            }
        } else if (text.startsWith('/help')) {
            await handleHelpRequest(chatId, user);
        } else {
            await sendTelegramMessage(
                `🤖 <b>HROne Bot Instructions</b>\n\n` +
                `Send /mark to punch attendance, /history to pick date history, or /settings for account info.`,
                chatId,
                getInteractiveKeyboard(user)
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('Error handling Telegram webhook:', error);

        // Attempt to extract chatId from payload and inform user via Telegram
        try {
            const chatId = body?.message?.chat?.id || body?.callback_query?.message?.chat?.id || body?.callback_query?.from?.id;
            if (chatId) {
                await sendTelegramMessage(
                    `⚠️ <b>Something went wrong</b>\n\n` +
                    `An unexpected error occurred while processing your request. Please try again, or type /cancel to restart setup.`,
                    String(chatId)
                );
            }
        } catch (notifyErr) {
            console.error('Failed to dispatch error notification to Telegram:', notifyErr);
        }

        return NextResponse.json({ ok: true, error: error.message });
    }
}

async function startRegistrationWizard(chatId: string, telegramUsername?: string) {
    let user = await User.findOne({ chatId });
    if (!user) {
        user = new User({
            chatId,
            telegramUsername,
            hrUsername: 'pending',
            hrPassword: 'pending',
            registrationState: 'AWAITING_HR_USERNAME'
        });
    } else {
        user.registrationState = 'AWAITING_HR_USERNAME';
    }
    await user.save();

    const welcomeText =
        `👋 <b>Welcome to HROne Self-Service Attendance Bot!</b>\n\n` +
        `Let's get your account registered for automated check-in and check-out.\n\n` +
        `<b>Step 1/2:</b> Please send your <b>HRone Username</b> (Mobile Number or Login ID):`;

    await sendTelegramMessage(welcomeText, chatId);
}

function normalizeDateInput(input?: string): string | undefined {
    if (!input) return undefined;
    const trimmed = input.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
        const [d, m, y] = trimmed.split('-');
        return `${y}-${m}-${d}`;
    }

    if (/^\d{1,2}$/.test(trimmed)) {
        const now = new Date();
        const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const pad = (n: number) => n.toString().padStart(2, '0');
        const day = pad(parseInt(trimmed, 10));
        return `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${day}`;
    }

    return undefined;
}

async function handleMarkAttendance(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Please send /register to link your HRone account.', chatId);
        return;
    }

    await sendTelegramMessage('⏳ <b>Processing attendance punch...</b>', chatId);

    try {
        const result = await markAttendance(undefined, {
            hrUsername: user.hrUsername,
            hrPassword: user.hrPassword,
            domainCode: user.domainCode,
            employeeId: user.employeeId,
            latitude: user.latitude,
            longitude: user.longitude,
            geoLocation: user.geoLocation,
            geoAccuracy: user.geoAccuracy,
        });

        await AttendanceLog.create({
            chatId,
            hrUsername: user.hrUsername,
            action: result.action,
            punchTime: result.punchTime,
            status: 'SUCCESS',
            source: 'MANUAL',
            requestPayload: result.requestPayload,
            responsePayload: result.response,
        });

        const reqJson = JSON.stringify(result.requestPayload, null, 2);
        const truncatedReq = reqJson.length > 1500 ? reqJson.substring(0, 1500) + '\n... (truncated)' : reqJson;

        const resJson = JSON.stringify(result.response, null, 2);
        const truncatedRes = resJson.length > 1500 ? resJson.substring(0, 1500) + '\n... (truncated)' : resJson;

        const successText =
            `✅ <b>Attendance Punched Successfully!</b>\n\n` +
            `<b>Account:</b> ${user.hrUsername}\n` +
            `<b>Action:</b> Punch ${result.action}\n` +
            `<b>Time:</b> ${result.punchTime} (IST)\n` +
            `<b>Location:</b> ${user.geoLocation}\n\n` +
            `<b>📤 Sent Request Payload:</b>\n` +
            `<pre><code class="language-json">${truncatedReq}</code></pre>\n\n` +
            `<b>📥 Received API Response:</b>\n` +
            `<pre><code class="language-json">${truncatedRes}</code></pre>`;

        await sendTelegramMessage(successText, chatId, getInteractiveKeyboard(user));
    } catch (error: any) {
        await AttendanceLog.create({
            chatId,
            hrUsername: user.hrUsername,
            action: (new Date().getHours() < 14 ? 'In' : 'Out'),
            punchTime: new Date().toISOString(),
            status: 'FAILED',
            source: 'MANUAL',
            errorMessage: error.message || 'Unknown error',
        });

        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toLocaleString('en-IN');

        const errorText =
            `❌ <b>Attendance Punch Failed!</b>\n\n` +
            `<b>Account:</b> ${user.hrUsername}\n` +
            `<b>Error:</b> ${error.message || 'Unknown error'}\n` +
            `<b>Timestamp:</b> ${istTime} (IST)\n` +
            (error.stack ? `<b>Stack Trace:</b>\n<pre><code>${error.stack.substring(0, 800)}</code></pre>` : '');

        await sendTelegramMessage(errorText, chatId, getFailureKeyboard(user));
    }
}

async function handleDatePickerRequest(chatId: string) {
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabel = `${monthNames[istDate.getMonth()]} ${istDate.getFullYear()}`;

    const pickerText =
        `📅 <b>Select Day for History (${monthLabel})</b>\n\n` +
        `Tap any day number (1 – 31) below to view its full attendance history & raw punch logs:`;

    await sendTelegramMessage(pickerText, chatId, getDatePickerKeyboard());
}

async function handleHistoryRequest(chatId: string, dateInput?: string, user?: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Please send /register to link your HRone account.', chatId);
        return;
    }

    const targetDate = normalizeDateInput(dateInput);
    const dateLabel = targetDate || 'today';
    await sendTelegramMessage(`⏳ <b>Fetching attendance logs for ${dateLabel}...</b>`, chatId);

    try {
        const history = await getAttendanceHistory(targetDate, {
            hrUsername: user.hrUsername,
            hrPassword: user.hrPassword,
            domainCode: user.domainCode,
            employeeId: user.employeeId,
        });

        let dbLogsText = '';
        try {
            const datePrefix = history.date;
            const dbLogs = await AttendanceLog.find({
                chatId,
                punchTime: { $regex: datePrefix }
            }).sort({ createdAt: -1 });

            if (dbLogs && dbLogs.length > 0) {
                dbLogsText = dbLogs.map((log: any) => {
                    const time = log.punchTime ? (log.punchTime.includes('T') ? log.punchTime.split('T')[1] : log.punchTime) : 'N/A';
                    const icon = log.status === 'SUCCESS' ? '✅' : '❌';
                    const sourceLabel = log.source === 'AUTOMATED_CRON' ? 'Cron' : 'Manual';
                    return `• <b>${time}</b> (${log.action}) ${icon} [${sourceLabel}]`;
                }).join('\n');
            } else {
                dbLogsText = '<i>No database punch logs recorded for this date.</i>';
            }
        } catch (e) {
            dbLogsText = '<i>Database logs unavailable.</i>';
        }

        let punchListText = '';
        if (Array.isArray(history.rawPunches) && history.rawPunches.length > 0) {
            punchListText = history.rawPunches.map((p: any) => {
                const time = p.punchDateTime ? p.punchDateTime.substring(11, 16) : 'N/A';
                const loc = p.punchLocation ? (p.punchLocation.length > 40 ? p.punchLocation.substring(0, 40) + '...' : p.punchLocation) : 'Online Check-in';
                return `• <b>${time}</b> (${p.punchSource || 'Check-in'} - <i>${loc}</i>)`;
            }).join('\n');
        } else {
            punchListText = '<i>No raw punch entries recorded for this date.</i>';
        }

        const summary = history.summary;
        const historyText =
            `📊 <b>HRone Attendance Logs (${history.date})</b>\n` +
            `<b>Account:</b> ${user.hrUsername}\n\n` +
            `<b>Status:</b> ${summary?.status || 'N/A'}\n` +
            `<b>Check In:</b> ${summary?.timeIn || 'Not Punched'}\n` +
            `<b>Check Out:</b> ${summary?.timeOut || 'Not Punched'}\n` +
            `<b>Total Hours:</b> ${summary?.workingHours || '00:00'}\n` +
            `<b>Shift:</b> ${summary?.shift || 'General'}\n\n` +
            `💾 <b>Saved Bot DB Logs:</b>\n` +
            `${dbLogsText}\n\n` +
            `🌐 <b>HRone Raw Punch Logs (${history.rawPunches?.length || 0}):</b>\n` +
            punchListText;

        await sendTelegramMessage(historyText, chatId, getInteractiveKeyboard(user));
    } catch (error: any) {
        await sendTelegramMessage(
            `❌ <b>Failed to fetch attendance history</b>\n\n<b>Error:</b> ${error.message}`,
            chatId,
            getInteractiveKeyboard(user)
        );
    }
}

async function handleMyHistory(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Please send /register to link your account.', chatId);
        return;
    }

    try {
        const logs = await AttendanceLog.find({ chatId }).sort({ createdAt: -1 }).limit(15);
        if (!logs || logs.length === 0) {
            await sendTelegramMessage('💾 <b>Database Audit History</b>\n\n<i>No attendance punch records found in DB yet.</i>', chatId, getInteractiveKeyboard(user));
            return;
        }

        const logLines = logs.map((log: any) => {
            const dt = log.punchTime || log.createdAt.toISOString();
            const icon = log.status === 'SUCCESS' ? '✅' : '❌';
            const src = log.source === 'AUTOMATED_CRON' ? 'Cron' : 'Manual';
            return `• <b>${dt}</b> (${log.action}) ${icon} [${src}]`;
        }).join('\n');

        const text =
            `💾 <b>Saved DB Attendance History (Last ${logs.length}):</b>\n` +
            `<b>Account:</b> ${user.hrUsername}\n\n` +
            logLines;

        await sendTelegramMessage(text, chatId, getInteractiveKeyboard(user));
    } catch (err: any) {
        await sendTelegramMessage(`❌ Error fetching DB logs: ${err.message}`, chatId, getInteractiveKeyboard(user));
    }
}

async function handleToggleAuto(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    user.autoMarkEnabled = !user.autoMarkEnabled;
    await user.save();

    const statusText =
        `⚙️ <b>Auto-Punch Status Updated</b>\n\n` +
        `Automated Cron Punch is now <b>${user.autoMarkEnabled ? 'Enabled 🟢' : 'Disabled 🔴'}</b> for user <code>${user.hrUsername}</code>.`;

    await sendTelegramMessage(statusText, chatId, getInteractiveKeyboard(user));
}

async function handleSettingsRequest(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    const settingsText =
        `⚙️ <b>Account Profile & Settings</b>\n\n` +
        `<b>HRone Username:</b> <code>${user.hrUsername}</code>\n` +
        `<b>Employee ID:</b> <code>${user.employeeId}</code>\n` +
        `<b>Auto-Punch Status:</b> ${user.autoMarkEnabled ? 'Enabled 🟢' : 'Disabled 🔴'}\n` +
        `<b>Geo Address:</b> ${user.geoLocation}\n\n` +
        `<b>Available Management Commands:</b>\n` +
        `• /toggleauto - Enable or disable automated cron punch\n` +
        `• /updatelocation - Change custom location address\n` +
        `• /updatecreds - Update HRone username/password\n` +
        `• /unregister - Delete account profile from bot`;

    await sendTelegramMessage(settingsText, chatId, getInteractiveKeyboard(user));
}

function getLocationKeyboard() {
    return {
        keyboard: [
            [
                { text: '📍 Share My Live GPS Location', request_location: true }
            ],
            [
                { text: '❌ Cancel' }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
    };
}

async function handleLocationUpdateRequest(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    user.registrationState = 'AWAITING_LOCATION';
    await user.save();

    const text =
        `📍 <b>Update Work GPS Location</b>\n\n` +
        `Tap <b>"📍 Share My Live GPS Location"</b> below to automatically update your GPS coordinates, or reply with a custom location text/address:`;

    await sendTelegramMessage(text, chatId, getLocationKeyboard());
}

async function handleSkipRequest(chatId: string) {
    const skipText =
        `⏸️ <b>Auto-Punch Skipped</b>\n\n` +
        `Pre-punch alert acknowledged. Auto-punch action for today's shift has been skipped.`;

    await sendTelegramMessage(skipText, chatId);
}

async function handleStatusRequest(chatId: string, user?: IUser | null) {
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
        `<b>Registered User:</b> ${user?.hrUsername || 'Not Linked'}\n` +
        `<b>Auto-Punch:</b> ${user?.autoMarkEnabled ? 'Enabled 🟢' : 'Disabled 🔴'}\n` +
        `<b>Status:</b> Engine Operational 🟢`;

    await sendTelegramMessage(statusText, chatId, getInteractiveKeyboard(user));
}

async function handleStatsRequest(chatId: string, user?: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    try {
        const now = new Date();
        const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const pad = (n: number) => n.toString().padStart(2, '0');
        const monthPrefix = `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}`;
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthLabel = `${monthNames[istDate.getMonth()]} ${istDate.getFullYear()}`;

        const monthLogs = await AttendanceLog.find({
            chatId,
            status: 'SUCCESS',
            punchTime: { $regex: monthPrefix }
        }).sort({ createdAt: 1 });

        const daysSet = new Set<string>();
        let cronPunches = 0;
        let manualPunches = 0;

        monthLogs.forEach((log) => {
            if (log.punchTime) {
                daysSet.add(log.punchTime.split('T')[0]);
            }
            if (log.source === 'AUTOMATED_CRON') cronPunches++;
            else manualPunches++;
        });

        let totalWorkedMinutes = 0;
        const dayLogsMap: { [date: string]: { in?: Date; out?: Date } } = {};

        monthLogs.forEach((log) => {
            const datePart = log.punchTime?.split('T')[0];
            if (!datePart) return;
            if (!dayLogsMap[datePart]) dayLogsMap[datePart] = {};

            const logTime = new Date(log.punchTime);
            if (log.action === 'In' && !dayLogsMap[datePart].in) {
                dayLogsMap[datePart].in = logTime;
            } else if (log.action === 'Out') {
                dayLogsMap[datePart].out = logTime;
            }
        });

        Object.values(dayLogsMap).forEach((day) => {
            if (day.in && day.out) {
                const diffMs = day.out.getTime() - day.in.getTime();
                if (diffMs > 0) {
                    totalWorkedMinutes += Math.floor(diffMs / (1000 * 60));
                }
            }
        });

        const totalHours = Math.floor(totalWorkedMinutes / 60);
        const remMins = totalWorkedMinutes % 60;
        const daysWorkedCount = daysSet.size;
        const avgMinsPerDay = daysWorkedCount > 0 ? Math.floor(totalWorkedMinutes / daysWorkedCount) : 0;
        const avgHours = Math.floor(avgMinsPerDay / 60);
        const avgMins = avgMinsPerDay % 60;

        const statsText =
            `📈 <b>Monthly Attendance Analytics (${monthLabel})</b>\n` +
            `<b>Account:</b> ${user.hrUsername}\n\n` +
            `📅 <b>Total Days Worked:</b> ${daysWorkedCount} Days\n` +
            `⏱️ <b>Total Work Duration:</b> ${totalHours}h ${remMins}m\n` +
            `⚡ <b>Average Work / Day:</b> ${avgHours}h ${avgMins}m\n` +
            `🟢 <b>Cron Punches:</b> ${cronPunches} | 👤 <b>Manual:</b> ${manualPunches}\n` +
            `📊 <b>Total Punches Logged:</b> ${monthLogs.length}\n\n` +
            `<i>Keep up the great work! Powered by HROne Bot.</i>`;

        await sendTelegramMessage(statsText, chatId, getInteractiveKeyboard(user));
    } catch (err: any) {
        await sendTelegramMessage(`❌ Error generating stats: ${err.message}`, chatId, getInteractiveKeyboard(user));
    }
}

async function handleHelpRequest(chatId: string, user?: IUser | null) {
    const helpText =
        `❓ <b>HROne Bot Help & User Guide</b>\n\n` +
        `<b>Available Bot Commands:</b>\n` +
        `• /mark - Punch attendance (Auto In/Out based on 9-hr rule)\n` +
        `• /history - Open 1–31 day calendar date picker\n` +
        `• /myhistory - View your MongoDB audit punch logs\n` +
        `• /stats - View monthly attendance analytics & hours\n` +
        `• /status - Check engine status & current IST time\n` +
        `• /settings - Account profile & auto-punch toggle\n` +
        `• /updatelocation - Change custom GPS work location\n` +
        `• /updatecreds - Update HRone username & password\n` +
        `• /unregister - Delete profile from bot\n\n` +
        `⏰ <b>9-Hour Working Shift Rule:</b>\n` +
        `• First punch of the day is automatically recorded as <b>Check-In</b>.\n` +
        `• <b>Punch Out</b> is only permitted after <b>9 working hours</b> have passed since Check-In.\n` +
        `• If you have already Punched Out in DB today, automated cron punches skip gracefully.\n\n` +
        `Tap any interactive button below to navigate:`;

    await sendTelegramMessage(helpText, chatId, getInteractiveKeyboard(user));
}

function getDatePickerKeyboard() {
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const year = istDate.getFullYear();
    const month = istDate.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    const rows: any[] = [];
    let currentRow: any[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
        currentRow.push({
            text: `${day}`,
            callback_data: `action_hist_day_${day}`
        });

        if (currentRow.length === 7 || day === daysInMonth) {
            rows.push(currentRow);
            currentRow = [];
        }
    }

    rows.push([
        { text: '📍 Today\'s Logs', callback_data: 'action_history' },
        { text: 'ℹ️ System Status', callback_data: 'action_status' }
    ]);

    return { inline_keyboard: rows };
}

function getInteractiveKeyboard(user?: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        return {
            inline_keyboard: [
                [{ text: '🚀 Register HRone Account', callback_data: 'action_register' }]
            ]
        };
    }

    return {
        inline_keyboard: [
            [
                { text: '📍 Punch Attendance Now', callback_data: 'action_mark' },
                { text: '📊 Today Logs', callback_data: 'action_history' }
            ],
            [
                { text: '📅 Select Day (1 - 31)', callback_data: 'action_pick_date' },
                { text: '💾 DB Punch Logs', callback_data: 'action_myhistory' }
            ],
            [
                { text: '📈 Monthly Stats', callback_data: 'action_monthly_stats' },
                { text: '⚙️ Settings', callback_data: 'action_settings' }
            ],
            [
                { text: user.autoMarkEnabled ? '⏸️ Disable Auto-Punch' : '▶️ Enable Auto-Punch', callback_data: 'action_toggle_auto' },
                { text: '❓ Help & Guide', callback_data: 'action_help' }
            ]
        ]
    };
}

function getFailureKeyboard(user?: IUser | null) {
    return {
        inline_keyboard: [
            [
                { text: '🔄 Retry Punch Now', callback_data: 'action_mark' },
                { text: '⚙️ Settings', callback_data: 'action_settings' }
            ],
            [
                { text: 'ℹ️ Check System Status', callback_data: 'action_status' }
            ]
        ]
    };
}