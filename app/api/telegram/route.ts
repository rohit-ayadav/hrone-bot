import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import User, { IUser } from '@/models/User';
import AttendanceLog from '@/models/AttendanceLog';
import {
    markAttendance,
    getAttendanceHistory,
    verifyHROneCredentials,
    getISTParts,
    getEffectiveUserLocation,
    DEFAULT_OFFICE_LOCATION
} from '@/lib/markAttendance';
import { sendTelegramMessage, answerCallbackQuery, reverseGeocode } from '@/lib/telegram';
import { encrypt } from '@/lib/crypto';
import {
    findExistingHROneUser,
    initiateAccountTransfer,
    verifyAndExecuteTransfer,
    formatTelegramAccountIdentifier
} from '@/lib/accountTransfer';

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
            } else if (data === 'action_toggle_workmode') {
                await handleToggleWorkMode(chatId, user);
            } else if (data === 'action_set_mode_office') {
                await handleSetMode(chatId, user, 'OFFICE');
            } else if (data === 'action_set_mode_wfh') {
                await handleSetMode(chatId, user, 'WFH');
            } else if (data === 'action_extend_30') {
                await handleExtendPunchOut(chatId, user, 30);
            } else if (data === 'action_extend_60') {
                await handleExtendPunchOut(chatId, user, 60);
            } else if (data === 'action_skip_out_today') {
                await handleSkipOutToday(chatId, user);
            } else if (data === 'action_prompt_early_out') {
                await handlePromptEarlyOut(chatId, user);
            } else if (data === 'action_confirm_early_out') {
                await handleConfirmEarlyOut(chatId, user);
            } else if (data === 'action_set_wfh_loc') {
                await handleSetWfhCommand(chatId, user);
            } else if (data === 'action_set_office_loc') {
                await handleSetOfficeCommand(chatId, user);
            } else if (data === 'action_reset_office_default') {
                await handleResetOfficeCommand(chatId, user);
            } else if (data === 'action_share_gps_office') {
                await handleLocationUpdateRequest(chatId, user, 'OFFICE');
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
            } else if (data === 'action_change_username') {
                await handleChangeUsernameRequest(chatId, user);
            } else if (data === 'action_cancel') {
                if (user) {
                    user.registrationState = 'IDLE';
                    user.pendingTransferTargetChatId = undefined;
                    user.transferOtp = undefined;
                    user.transferOtpExpiresAt = undefined;
                    await user.save();
                }
                await sendTelegramMessage('❌ <b>Operation Cancelled</b>', chatId);
            } else if (data === 'action_transfer_otp') {
                if (user && user.pendingTransferTargetChatId) {
                    const targetUser = await User.findOne({ chatId: user.pendingTransferTargetChatId });
                    if (targetUser) {
                        await initiateAccountTransfer(user, targetUser, callbackQuery.from?.username);
                    } else {
                        await sendTelegramMessage('⚠️ Target account no longer exists. Please restart registration.', chatId);
                    }
                }
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
                if (user.workMode === 'WFH') {
                    user.wfhLatitude = String(latitude);
                    user.wfhLongitude = String(longitude);
                    user.wfhGeoLocation = geoAddr;
                } else {
                    user.officeLatitude = String(latitude);
                    user.officeLongitude = String(longitude);
                    user.officeGeoLocation = geoAddr;
                    user.latitude = String(latitude);
                    user.longitude = String(longitude);
                    user.geoLocation = geoAddr;
                }
                user.registrationState = 'IDLE';
                await user.save();

                const modeBadge = user.workMode === 'WFH' ? '🏠 WFH (Home)' : '🏢 Office';
                const successText =
                    `📍 <b>${modeBadge} GPS Location Updated Successfully!</b>\n\n` +
                    `<b>Latitude:</b> <code>${latitude}</code>\n` +
                    `<b>Longitude:</b> <code>${longitude}</code>\n` +
                    `<b>Geo Address:</b> ${geoAddr}\n\n` +
                    `Punches under <b>${modeBadge}</b> mode will now use this location.`;

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
            if (text === '/cancel') {
                user.registrationState = 'IDLE';
                user.pendingTransferTargetChatId = undefined;
                user.transferOtp = undefined;
                user.transferOtpExpiresAt = undefined;
                await user.save();
                await sendTelegramMessage('❌ <b>Operation Cancelled</b>', chatId);
                return NextResponse.json({ ok: true });
            }

            if (text === '/changeusername') {
                await handleChangeUsernameRequest(chatId, user);
                return NextResponse.json({ ok: true });
            }

            const isCommand = text.startsWith('/');
            if (!isCommand) {
                if (user.registrationState === 'AWAITING_HR_USERNAME') {
                    const existingUser = await findExistingHROneUser(text, chatId);

                    if (existingUser) {
                        user.hrUsername = text;
                        user.pendingTransferTargetChatId = existingUser.chatId;
                        await user.save();

                        const existingInfo = formatTelegramAccountIdentifier(existingUser);
                        await sendTelegramMessage(
                            `⚠️ <b>HRone Account Already Registered!</b>\n\n` +
                            `The HRone account <code>${text}</code> is currently linked to <b>${existingInfo}</b>.\n\n` +
                            `If this is your account and you wish to transfer it to this Telegram chat, tap <b>🔑 Transfer Account via OTP</b> below. An OTP will be sent to ${existingInfo}.`,
                            chatId,
                            {
                                inline_keyboard: [
                                    [{ text: '🔑 Send OTP to Transfer Account', callback_data: 'action_transfer_otp' }],
                                    [{ text: '✏️ Change Username', callback_data: 'action_change_username' }],
                                    [{ text: '❌ Cancel', callback_data: 'action_cancel' }]
                                ]
                            }
                        );
                        return NextResponse.json({ ok: true });
                    }

                    user.hrUsername = text;
                    user.registrationState = 'AWAITING_HR_PASSWORD';
                    await user.save();

                    await sendTelegramMessage(
                        `🔑 <b>Username Saved:</b> <code>${text}</code>\n\n` +
                        `Now please send your <b>HRone Password</b>:`,
                        chatId,
                        {
                            inline_keyboard: [
                                [{ text: '✏️ Change Username', callback_data: 'action_change_username' }],
                                [{ text: '❌ Cancel', callback_data: 'action_cancel' }]
                            ]
                        }
                    );
                    return NextResponse.json({ ok: true });
                }

                if (user.registrationState === 'AWAITING_HR_PASSWORD') {
                    await sendTelegramMessage('⏳ <b>Verifying your HRone credentials...</b>', chatId);

                    const verifyRes = await verifyHROneCredentials(user.hrUsername, text, user.domainCode);

                    if (verifyRes.valid) {
                        user.hrPassword = encrypt(text);
                        if (verifyRes.employeeId) user.employeeId = verifyRes.employeeId;
                        if (verifyRes.employeeCode) user.employeeCode = verifyRes.employeeCode;
                        if (verifyRes.employeeName) user.employeeName = verifyRes.employeeName;
                        if (verifyRes.designation) user.designation = verifyRes.designation;
                        if (verifyRes.department) user.department = verifyRes.department;
                        if (verifyRes.company) user.company = verifyRes.company;
                        if (verifyRes.mobileNo) user.mobileNo = verifyRes.mobileNo;
                        if (verifyRes.email) user.email = verifyRes.email;

                        user.registrationState = 'IDLE';
                        user.autoMarkEnabled = true;
                        if (!user.officeGeoLocation) {
                            user.officeLatitude = DEFAULT_OFFICE_LOCATION.latitude;
                            user.officeLongitude = DEFAULT_OFFICE_LOCATION.longitude;
                            user.officeGeoLocation = DEFAULT_OFFICE_LOCATION.geoLocation;
                            user.latitude = DEFAULT_OFFICE_LOCATION.latitude;
                            user.longitude = DEFAULT_OFFICE_LOCATION.longitude;
                            user.geoLocation = DEFAULT_OFFICE_LOCATION.geoLocation;
                            user.geoAccuracy = DEFAULT_OFFICE_LOCATION.geoAccuracy;
                        }
                        if (!user.workMode) {
                            user.workMode = 'OFFICE';
                        }
                        if (telegramUsername) user.telegramUsername = telegramUsername;
                        await user.save();

                        const empCodeDisplay = user.employeeCode ? `<code>${user.employeeCode}</code>` : `<code>${user.employeeId}</code>`;
                        const nameDisplay = user.employeeName ? `\n<b>Name:</b> ${user.employeeName}` : '';
                        const desigDisplay = user.designation ? `\n<b>Designation:</b> ${user.designation}` : '';
                        const companyDisplay = user.company ? `\n<b>Company:</b> ${user.company}` : '';

                        const successMsg =
                            `🎉 <b>Account Registered & Verified Successfully!</b>\n\n` +
                            `<b>Employee Code:</b> ${empCodeDisplay}` +
                            `${nameDisplay}` +
                            `${desigDisplay}` +
                            `${companyDisplay}\n` +
                            `<b>Username:</b> <code>${user.hrUsername}</code>\n` +
                            `<b>Auto-Punch:</b> Enabled 🟢\n\n` +
                            `You can now punch attendance, view logs, or manage settings anytime!`;

                        await sendTelegramMessage(successMsg, chatId, getInteractiveKeyboard(user));
                    } else {
                        await sendTelegramMessage(
                            `❌ <b>Authentication Failed</b>\n\n` +
                            `<b>Reason:</b> ${verifyRes.error || 'Invalid credentials'}\n\n` +
                            `Please send your correct <b>HRone Password</b> to try again, or tap below to edit your <b>Username</b> if it was entered incorrectly:`,
                            chatId,
                            {
                                inline_keyboard: [
                                    [{ text: '✏️ Change Username', callback_data: 'action_change_username' }],
                                    [{ text: '❌ Cancel Setup', callback_data: 'action_cancel' }]
                                ]
                            }
                        );
                    }
                    return NextResponse.json({ ok: true });
                }

                if (user.registrationState === 'AWAITING_TRANSFER_OTP') {
                    await sendTelegramMessage('⏳ <b>Verifying OTP...</b>', chatId);

                    const transferRes = await verifyAndExecuteTransfer(user, text);

                    if (transferRes.success) {
                        const empCodeDisplay = user.employeeCode ? `<code>${user.employeeCode}</code>` : `<code>${user.employeeId}</code>`;
                        const nameDisplay = user.employeeName ? `\n<b>Name:</b> ${user.employeeName}` : '';

                        const successMsg =
                            `🎉 <b>Account Transferred & Verified Successfully!</b>\n\n` +
                            `<b>Employee Code:</b> ${empCodeDisplay}` +
                            `${nameDisplay}\n` +
                            `<b>Username:</b> <code>${user.hrUsername}</code>\n` +
                            `<b>Auto-Punch:</b> Enabled 🟢\n\n` +
                            `Your HRone account has been transferred to this Telegram profile. You can now punch attendance or manage settings!`;

                        await sendTelegramMessage(successMsg, chatId, getInteractiveKeyboard(user));
                    } else {
                        await sendTelegramMessage(
                            `❌ <b>Transfer Verification Failed</b>\n\n` +
                            `<b>Reason:</b> ${transferRes.error}\n\n` +
                            `Please enter the correct 6-digit OTP sent to the old Telegram account, or tap below to edit your Username:`,
                            chatId,
                            {
                                inline_keyboard: [
                                    [{ text: '✏️ Change Username', callback_data: 'action_change_username' }],
                                    [{ text: '❌ Cancel Transfer', callback_data: 'action_cancel' }]
                                ]
                            }
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
        } else if (text.startsWith('/changeusername')) {
            await handleChangeUsernameRequest(chatId, user);
        } else if (text.startsWith('/workmode') || text.startsWith('/toggleworkmode')) {
            await handleToggleWorkMode(chatId, user);
        } else if (text.startsWith('/wfh')) {
            await handleSetMode(chatId, user, 'WFH');
        } else if (text.startsWith('/office')) {
            await handleSetMode(chatId, user, 'OFFICE');
        } else if (text.startsWith('/setwfh')) {
            const parts = text.split(' ');
            const customAddr = parts.slice(1).join(' ').trim();
            await handleSetWfhCommand(chatId, user, customAddr);
        } else if (text.startsWith('/setoffice')) {
            const parts = text.split(' ');
            const customAddr = parts.slice(1).join(' ').trim();
            await handleSetOfficeCommand(chatId, user, customAddr);
        } else if (text.startsWith('/resetoffice') || text.startsWith('/defaultoffice')) {
            await handleResetOfficeCommand(chatId, user);
        } else if (text.startsWith('/extend')) {
            const parts = text.split(' ');
            const mins = parseInt(parts[1] || '30', 10) || 30;
            await handleExtendPunchOut(chatId, user, mins);
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
                `Send /mark to punch attendance, /workmode to toggle Office/WFH, /history for history, or /settings for account info.`,
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
            registrationState: 'AWAITING_HR_USERNAME',
            workMode: 'OFFICE',
            officeLatitude: DEFAULT_OFFICE_LOCATION.latitude,
            officeLongitude: DEFAULT_OFFICE_LOCATION.longitude,
            officeGeoLocation: DEFAULT_OFFICE_LOCATION.geoLocation,
            latitude: DEFAULT_OFFICE_LOCATION.latitude,
            longitude: DEFAULT_OFFICE_LOCATION.longitude,
            geoLocation: DEFAULT_OFFICE_LOCATION.geoLocation,
            geoAccuracy: DEFAULT_OFFICE_LOCATION.geoAccuracy,
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

async function handleChangeUsernameRequest(chatId: string, user?: IUser | null) {
    if (!user) {
        await startRegistrationWizard(chatId);
        return;
    }
    user.registrationState = 'AWAITING_HR_USERNAME';
    user.pendingTransferTargetChatId = undefined;
    user.transferOtp = undefined;
    user.transferOtpExpiresAt = undefined;
    await user.save();

    await sendTelegramMessage(
        `✏️ <b>Step 1/2: Enter HRone Username</b>\n\n` +
        `Please send your correct <b>HRone Username</b> (Mobile Number or Login ID):`,
        chatId
    );
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

        const modeBadge = result.workMode === 'WFH' ? '🏠 WFH (Home)' : '🏢 Office';
        const successText =
            `✅ <b>Attendance Punched Successfully!</b>\n\n` +
            `<b>Account:</b> ${user.hrUsername}\n` +
            `<b>Action:</b> Punch ${result.action}\n` +
            `<b>Time:</b> ${result.punchTime} (IST)\n` +
            `<b>Work Mode:</b> ${modeBadge}\n` +
            `<b>Location:</b> ${result.requestPayload?.geoLocation || user.geoLocation}\n\n` +
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
        const istTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const isGateway = error.message && (
            error.message.includes('502') ||
            error.message.includes('503') ||
            error.message.includes('504') ||
            error.message.includes('Gateway')
        );

        const gatewayTip = isGateway
            ? `\n\n💡 <i>The HRone Gateway returned a server error after 3 automatic retries. HRone cloud servers may be experiencing high rush-hour load.</i>`
            : '';

        const errorText =
            `❌ <b>Attendance Punch Failed!</b>\n\n` +
            `<b>Account:</b> ${user.hrUsername}\n` +
            `<b>Error:</b> ${error.message || 'Unknown error'}\n` +
            `<b>Timestamp:</b> ${istTime} (IST)${gatewayTip}\n` +
            (error.stack ? `<b>Stack Trace:</b>\n<pre><code>${error.stack.substring(0, 800)}</code></pre>` : '');

        const isNineHourBlock = error.message && error.message.includes('Minimum 9 working hours');
        const failureKeyboard = isNineHourBlock
            ? {
                inline_keyboard: [
                    [
                        { text: '⚡ Punch Out Anyway (Early Out)', callback_data: 'action_prompt_early_out' },
                        { text: '⏳ Extend +30m', callback_data: 'action_extend_30' }
                    ],
                    [
                        { text: 'ℹ️ Check Today Logs', callback_data: 'action_history' },
                        { text: '⚙️ Settings', callback_data: 'action_settings' }
                    ]
                ]
            }
            : getFailureKeyboard(user);

        await sendTelegramMessage(errorText, chatId, failureKeyboard);
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

    const empCodeDisplay = user.employeeCode ? `<code>${user.employeeCode}</code>` : `<code>${user.employeeId}</code>`;
    const nameDisplay = user.employeeName ? `\n<b>Name:</b> ${user.employeeName}` : '';
    const desigDisplay = user.designation ? `\n<b>Designation:</b> ${user.designation}` : '';
    const deptDisplay = user.department ? `\n<b>Department:</b> ${user.department}` : '';
    const companyDisplay = user.company ? `\n<b>Company:</b> ${user.company}` : '';
    const workModeDisplay = user.workMode === 'WFH' ? '🏠 WFH (Work From Home)' : '🏢 Office';
    const officeAddr = user.officeGeoLocation || user.geoLocation || DEFAULT_OFFICE_LOCATION.geoLocation;
    const wfhAddr = user.wfhGeoLocation || '<i>Not set yet (tap button below to set)</i>';

    const now = new Date();
    const istParts = getISTParts(now);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${istParts.year}-${pad(istParts.month)}-${pad(istParts.day)}`;

    let extDisplay = 'None';
    if (user.outPunchExtensionDate === todayStr && user.outPunchExtensionMinutes) {
        extDisplay = `+${user.outPunchExtensionMinutes}m (Active Today)`;
    }
    const skipDisplay = user.skipPunchOutDate === todayStr ? 'Yes (Skipped for today)' : 'No';

    const settingsText =
        `⚙️ <b>Account Profile & Settings</b>\n\n` +
        `<b>HRone Username:</b> <code>${user.hrUsername}</code>\n` +
        `<b>Employee Code:</b> ${empCodeDisplay}` +
        `${nameDisplay}` +
        `${desigDisplay}` +
        `${deptDisplay}` +
        `${companyDisplay}\n` +
        `<b>Active Work Mode:</b> ${workModeDisplay}\n` +
        `🏢 <b>Office Address:</b> ${officeAddr}\n` +
        `🏠 <b>WFH Address:</b> ${wfhAddr}\n\n` +
        `<b>Auto-Punch Status:</b> ${user.autoMarkEnabled ? 'Enabled 🟢' : 'Disabled 🔴'}\n` +
        `<b>Today Shift Extension:</b> ${extDisplay}\n` +
        `<b>Skip Auto-Out Today:</b> ${skipDisplay}\n\n` +
        `<b>Available Management Commands:</b>\n` +
        `• /workmode - Toggle between Office and WFH mode\n` +
        `• /wfh or /office - Directly switch work mode\n` +
        `• /setwfh &lt;address&gt; - Set your Home/WFH location\n` +
        `• /setoffice &lt;address&gt; - Set your Office location\n` +
        `• /resetoffice - Reset office to default (altF Coworking)\n` +
        `• /extend &lt;mins&gt; - Extend today's shift (e.g. /extend 30)\n` +
        `• /toggleauto - Enable or disable automated cron punch\n` +
        `• /updatecreds - Update HRone username/password\n` +
        `• /unregister - Delete account profile from bot`;

    const toggleModeText = user.workMode === 'WFH' ? '🏢 Switch to Office Mode' : '🏠 Switch to WFH Mode';

    await sendTelegramMessage(settingsText, chatId, {
        inline_keyboard: [
            [
                { text: toggleModeText, callback_data: 'action_toggle_workmode' }
            ],
            [
                { text: '🏠 Set WFH Location', callback_data: 'action_set_wfh_loc' },
                { text: '🏢 Set Office Location', callback_data: 'action_set_office_loc' }
            ],
            [
                { text: '🏢 Reset Office to altF', callback_data: 'action_reset_office_default' },
                { text: user.autoMarkEnabled ? '⏸️ Disable Auto' : '▶️ Enable Auto', callback_data: 'action_toggle_auto' }
            ],
            [
                { text: '📍 Punch Attendance Now', callback_data: 'action_mark' }
            ]
        ]
    });
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

async function handleLocationUpdateRequest(chatId: string, user: IUser | null, targetMode?: 'OFFICE' | 'WFH') {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    if (targetMode) {
        user.workMode = targetMode;
        await user.save();
    }

    user.registrationState = 'AWAITING_LOCATION';
    await user.save();

    const modeLabel = (targetMode || user.workMode) === 'WFH' ? '🏠 WFH (Home)' : '🏢 Office';
    const text =
        `📍 <b>Update ${modeLabel} Location</b>\n\n` +
        `Tap <b>"📍 Share My Live GPS Location"</b> below to automatically update your coordinates, or reply with an address (e.g., <code>/setwfh Sector 142, Noida</code>):`;

    await sendTelegramMessage(text, chatId, getLocationKeyboard());
}

async function handleToggleWorkMode(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    const newMode: 'OFFICE' | 'WFH' = user.workMode === 'WFH' ? 'OFFICE' : 'WFH';
    user.workMode = newMode;
    await user.save();

    if (newMode === 'WFH') {
        const wfhLocation = user.wfhGeoLocation;
        const locMsg = wfhLocation
            ? `<b>Active WFH Address:</b> ${wfhLocation}`
            : `⚠️ <i>No dedicated WFH location set yet!</i>\nShare your live GPS location pin 📍 or type <code>/setwfh &lt;address&gt;</code> to save your home coordinates.`;

        const text =
            `🏠 <b>Work Mode Switched to WFH (Work From Home)</b>\n\n` +
            `${locMsg}\n\n` +
            `Scheduled automated and manual attendance punches will now record under <b>WFH mode</b>.`;

        await sendTelegramMessage(text, chatId, getInteractiveKeyboard(user));
    } else {
        const officeLocation = user.officeGeoLocation || user.geoLocation || DEFAULT_OFFICE_LOCATION.geoLocation;
        const text =
            `🏢 <b>Work Mode Switched to Office</b>\n\n` +
            `<b>Active Office Address:</b> ${officeLocation}\n\n` +
            `Scheduled automated and manual attendance punches will now record under <b>Office mode</b>.`;

        await sendTelegramMessage(text, chatId, getInteractiveKeyboard(user));
    }
}

async function handleSetMode(chatId: string, user: IUser | null, mode: 'OFFICE' | 'WFH') {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }
    user.workMode = mode;
    await user.save();

    const isWfh = mode === 'WFH';
    const loc = isWfh
        ? (user.wfhGeoLocation || 'Home / WFH')
        : (user.officeGeoLocation || user.geoLocation || DEFAULT_OFFICE_LOCATION.geoLocation);

    const text =
        `${isWfh ? '🏠' : '🏢'} <b>Work Mode Set to ${mode}</b>\n\n` +
        `<b>Active Location:</b> ${loc}\n\n` +
        `Punches will now use this work location.`;

    await sendTelegramMessage(text, chatId, getInteractiveKeyboard(user));
}

async function handleSetWfhCommand(chatId: string, user: IUser | null, customAddr?: string) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    if (!customAddr) {
        user.workMode = 'WFH';
        await user.save();
        await sendTelegramMessage(
            `🏠 <b>Set WFH (Home) Location</b>\n\n` +
            `Please share your live GPS location pin 📍 or reply with your home address:\n` +
            `Example: <code>/setwfh Tower 3, Express View, Sector 93, Noida</code>`,
            chatId,
            getLocationKeyboard()
        );
        return;
    }

    user.workMode = 'WFH';
    user.wfhGeoLocation = customAddr;
    await user.save();

    await sendTelegramMessage(
        `🏠 <b>WFH Location Updated Successfully!</b>\n\n` +
        `<b>Address:</b> ${customAddr}\n` +
        `<b>Work Mode:</b> 🏠 WFH Active\n\n` +
        `Future punches will now use this WFH address.`,
        chatId,
        getInteractiveKeyboard(user)
    );
}

async function handleResetOfficeCommand(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    user.workMode = 'OFFICE';
    user.officeLatitude = DEFAULT_OFFICE_LOCATION.latitude;
    user.officeLongitude = DEFAULT_OFFICE_LOCATION.longitude;
    user.officeGeoLocation = DEFAULT_OFFICE_LOCATION.geoLocation;
    user.latitude = DEFAULT_OFFICE_LOCATION.latitude;
    user.longitude = DEFAULT_OFFICE_LOCATION.longitude;
    user.geoLocation = DEFAULT_OFFICE_LOCATION.geoLocation;
    user.geoAccuracy = DEFAULT_OFFICE_LOCATION.geoAccuracy;
    await user.save();

    const resetMsg =
        `🏢 <b>Office Address Reset to Default (altF Coworking)</b>\n\n` +
        `<b>Active Office:</b> ${DEFAULT_OFFICE_LOCATION.geoLocation}\n` +
        `<b>Coordinates:</b> <code>${DEFAULT_OFFICE_LOCATION.latitude}, ${DEFAULT_OFFICE_LOCATION.longitude}</code>\n` +
        `<b>Work Mode:</b> 🏢 Office Mode Active\n\n` +
        `All office check-ins and check-outs will now use altF Coworking Space.`;

    await sendTelegramMessage(resetMsg, chatId, getInteractiveKeyboard(user));
}

async function handleSetOfficeCommand(chatId: string, user: IUser | null, customAddr?: string) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet. Send /register to start.', chatId);
        return;
    }

    if (customAddr && ['default', 'altf', 'reset'].includes(customAddr.trim().toLowerCase())) {
        await handleResetOfficeCommand(chatId, user);
        return;
    }

    if (!customAddr) {
        user.workMode = 'OFFICE';
        await user.save();

        const currentOffice = user.officeGeoLocation || DEFAULT_OFFICE_LOCATION.geoLocation;
        await sendTelegramMessage(
            `🏢 <b>Office Location Configuration</b>\n\n` +
            `<b>Current Office:</b> ${currentOffice}\n` +
            `<b>Default Office:</b> ${DEFAULT_OFFICE_LOCATION.geoLocation}\n\n` +
            `• Tap <b>"🏢 Reset to Default (altF)"</b> to restore altF Sector 142.\n` +
            `• Or reply with an address: <code>/setoffice &lt;address&gt;</code>\n` +
            `• Or share your live GPS pin 📍 to save custom office coordinates.`,
            chatId,
            {
                inline_keyboard: [
                    [{ text: '🏢 Reset to Default (altF Coworking)', callback_data: 'action_reset_office_default' }],
                    [{ text: '📍 Share Live Office GPS Pin', callback_data: 'action_share_gps_office' }],
                    [{ text: '⚙️ Account Settings', callback_data: 'action_settings' }]
                ]
            }
        );
        return;
    }

    user.workMode = 'OFFICE';
    user.officeGeoLocation = customAddr;
    user.geoLocation = customAddr;
    await user.save();

    await sendTelegramMessage(
        `🏢 <b>Office Location Updated Successfully!</b>\n\n` +
        `<b>Address:</b> ${customAddr}\n` +
        `<b>Work Mode:</b> 🏢 Office Active\n\n` +
        `Future office punches will now use this address.\n` +
        `<i>(To reset to altF anytime, type <code>/setoffice default</code> or /resetoffice)</i>`,
        chatId,
        getInteractiveKeyboard(user)
    );
}

async function handleExtendPunchOut(chatId: string, user: IUser | null, minutes: number) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet.', chatId);
        return;
    }

    const now = new Date();
    const istParts = getISTParts(now);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${istParts.year}-${pad(istParts.month)}-${pad(istParts.day)}`;

    if (user.outPunchExtensionDate !== todayStr) {
        user.outPunchExtensionDate = todayStr;
        user.outPunchExtensionMinutes = minutes;
    } else {
        user.outPunchExtensionMinutes = (user.outPunchExtensionMinutes || 0) + minutes;
    }
    await user.save();

    const successMsg =
        `⏳ <b>Shift Extended (+${minutes} mins)</b>\n\n` +
        `Added <b>+${minutes} minutes</b> to today's working shift.\n` +
        `• <b>Total Extension Today:</b> +${user.outPunchExtensionMinutes}m\n\n` +
        `Automated Punch-Out will wait for your extended working hours to complete.`;

    await sendTelegramMessage(successMsg, chatId, getInteractiveKeyboard(user));
}

async function handleSkipOutToday(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet.', chatId);
        return;
    }

    const now = new Date();
    const istParts = getISTParts(now);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${istParts.year}-${pad(istParts.month)}-${pad(istParts.day)}`;

    user.skipPunchOutDate = todayStr;
    await user.save();

    const msg =
        `⏸️ <b>Punch-Out Paused for Today</b>\n\n` +
        `Automated Punch-Out will be skipped for today (${todayStr}).\n` +
        `You can still punch out manually at any time by sending /mark.`;

    await sendTelegramMessage(msg, chatId, getInteractiveKeyboard(user));
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

    const workModeBadge = user?.workMode === 'WFH' ? '🏠 WFH (Home)' : '🏢 Office';

    const statusText =
        `ℹ️ <b>HROne Bot System Status</b>\n\n` +
        `<b>Current IST Time:</b> ${istString}\n` +
        `<b>Active Shift Mode:</b> Punch ${shiftMode} (${hour < 14 ? 'Before 2 PM' : 'After 2 PM'})\n` +
        `<b>Registered User:</b> ${user?.hrUsername || 'Not Linked'}\n` +
        `<b>Work Mode:</b> ${workModeBadge}\n` +
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
        `• /workmode - Toggle between Office and WFH mode\n` +
        `• /wfh or /office - Switch mode directly\n` +
        `• /setwfh &lt;address&gt; - Update your WFH/home address\n` +
        `• /setoffice &lt;address&gt; - Update your office address\n` +
        `• /extend &lt;mins&gt; - Extend today's shift (e.g. /extend 30)\n` +
        `• /history - Open 1–31 day calendar date picker\n` +
        `• /myhistory - View your MongoDB audit punch logs\n` +
        `• /stats - View monthly attendance analytics & hours\n` +
        `• /status - Check engine status & current IST time\n` +
        `• /settings - Account profile & auto-punch toggle\n` +
        `• /updatelocation - Change custom GPS work location\n` +
        `• /updatecreds - Update HRone username & password\n` +
        `• /unregister - Delete profile from bot\n\n` +
        `⏰ <b>Smart 9-Hour Shift Rule:</b>\n` +
        `• First punch of the day is automatically recorded as <b>Check-In</b>.\n` +
        `• <b>Punch Out</b> requires at least <b>9 working hours</b> (plus any requested shift extensions).\n` +
        `• If you have already Punched Out today, automated cron punches skip gracefully.\n\n` +
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

    const workModeBtn = user.workMode === 'WFH'
        ? { text: '🏠 Mode: WFH (Switch to 🏢)', callback_data: 'action_toggle_workmode' }
        : { text: '🏢 Mode: Office (Switch to 🏠)', callback_data: 'action_toggle_workmode' };

    return {
        inline_keyboard: [
            [
                { text: '📍 Punch Attendance Now', callback_data: 'action_mark' },
                { text: '📊 Today Logs', callback_data: 'action_history' }
            ],
            [
                workModeBtn,
                { text: '⚙️ Settings', callback_data: 'action_settings' }
            ],
            [
                { text: '📅 Select Day (1 - 31)', callback_data: 'action_pick_date' },
                { text: '💾 DB Punch Logs', callback_data: 'action_myhistory' }
            ],
            [
                { text: '📈 Monthly Stats', callback_data: 'action_monthly_stats' },
                { text: user.autoMarkEnabled ? '⏸️ Auto-Punch: On' : '▶️ Auto-Punch: Off', callback_data: 'action_toggle_auto' }
            ],
            [
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

async function handlePromptEarlyOut(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet.', chatId);
        return;
    }

    const now = new Date();
    const istParts = getISTParts(now);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${istParts.year}-${pad(istParts.month)}-${pad(istParts.day)}`;

    const todayLogs = await AttendanceLog.find({
        $or: [{ chatId }, { hrUsername: user.hrUsername }],
        status: 'SUCCESS',
        punchTime: { $regex: todayStr }
    }).sort({ createdAt: 1 });

    const inLog = todayLogs.find((l) => l.action === 'In');
    const outLog = todayLogs.find((l) => l.action === 'Out');

    if (outLog) {
        await sendTelegramMessage('✅ You have already Punched Out today.', chatId, getInteractiveKeyboard(user));
        return;
    }

    if (!inLog) {
        await sendTelegramMessage('⚠️ No Check-In record was found for today. You cannot punch out before checking in.', chatId, getInteractiveKeyboard(user));
        return;
    }

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

    const inParts = getISTParts(inTime);
    const inHour = inParts.hour % 12 || 12;
    const inAmpm = inParts.hour >= 12 ? 'PM' : 'AM';
    const inTimeStr = `${pad(inHour)}:${pad(inParts.minute)} ${inAmpm}`;

    const promptText =
        `⚠️ <b>Early Punch-Out Confirmation</b>\n\n` +
        `<b>Account:</b> ${user.hrUsername}\n` +
        `• <b>Check-In Time:</b> ${inTimeStr} IST\n` +
        `• <b>Worked So Far:</b> ${Math.floor(elapsedHours)}h ${Math.floor((elapsedHours % 1) * 60)}m\n` +
        `• <b>Shift Shortage:</b> ${remHours}h ${remMins}m short of 9 hours\n\n` +
        `Are you sure you want to mark <b>Punch Out</b> early?`;

    await sendTelegramMessage(promptText, chatId, {
        inline_keyboard: [
            [
                { text: '✅ Yes, Confirm Early Punch-Out', callback_data: 'action_confirm_early_out' }
            ],
            [
                { text: '⏳ Extend +30m Instead', callback_data: 'action_extend_30' },
                { text: '❌ Cancel', callback_data: 'action_cancel' }
            ]
        ]
    });
}

async function handleConfirmEarlyOut(chatId: string, user: IUser | null) {
    if (!user || user.registrationState !== 'IDLE') {
        await sendTelegramMessage('⚠️ You are not registered yet.', chatId);
        return;
    }

    await sendTelegramMessage('⏳ <b>Processing early attendance punch out...</b>', chatId);

    try {
        const result = await markAttendance('Out', {
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
        }, { allowEarlyOut: true });

        await AttendanceLog.create({
            chatId,
            hrUsername: user.hrUsername,
            action: 'Out',
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

        const modeBadge = result.workMode === 'WFH' ? '🏠 WFH (Home)' : '🏢 Office';
        const successText =
            `✅ <b>Early Attendance Punched Successfully!</b>\n\n` +
            `<b>Account:</b> ${user.hrUsername}\n` +
            `<b>Action:</b> Punch Out ⚠️ (Early Sign-Off)\n` +
            `<b>Time:</b> ${result.punchTime} (IST)\n` +
            `<b>Work Mode:</b> ${modeBadge}\n` +
            `<b>Location:</b> ${result.requestPayload?.geoLocation || user.geoLocation}\n\n` +
            `<b>📤 Sent Request Payload:</b>\n` +
            `<pre><code class="language-json">${truncatedReq}</code></pre>\n\n` +
            `<b>📥 Received API Response:</b>\n` +
            `<pre><code class="language-json">${truncatedRes}</code></pre>`;

        await sendTelegramMessage(successText, chatId, getInteractiveKeyboard(user));
    } catch (error: any) {
        await AttendanceLog.create({
            chatId,
            hrUsername: user.hrUsername,
            action: 'Out',
            punchTime: new Date().toISOString(),
            status: 'FAILED',
            source: 'MANUAL',
            errorMessage: error.message || 'Early punch out failed',
        });

        const errorText =
            `❌ <b>Early Punch-Out Failed!</b>\n\n` +
            `<b>Account:</b> ${user.hrUsername}\n` +
            `<b>Error:</b> ${error.message || 'Unknown error'}`;

        await sendTelegramMessage(errorText, chatId, getFailureKeyboard(user));
    }
}