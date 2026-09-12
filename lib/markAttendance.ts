import { sendTelegramMessage } from './telegram';

export interface UserProfile {
    hrUsername?: string;
    hrPassword?: string;
    domainCode?: string;
    employeeId?: number;
    latitude?: string;
    longitude?: string;
    geoLocation?: string;
    geoAccuracy?: string;
}

export interface MarkAttendanceResult {
    success: boolean;
    action: 'In' | 'Out';
    punchTime: string;
    requestPayload: any;
    response: any;
}

export async function verifyHROneCredentials(
    username: string,
    password: string,
    domain: string = 'uharvest'
): Promise<{ valid: boolean; tokenData?: any; employeeId?: number; error?: string }> {
    try {
        const tokenRes = await fetch('https://gateway.app.hrone.cloud/oauth2/token', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/x-www-form-urlencoded',
                'domaincode': domain,
                'accessmode': 'W',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
                'origin': 'https://app.hrone.cloud',
                'referer': 'https://app.hrone.cloud/',
            },
            body: new URLSearchParams({
                username: username,
                password: password,
                grant_type: 'password',
                loginType: '1',
                companyDomainCode: domain,
                isUpdated: '0',
                validSource: 'Y',
                deviceName: 'Chrome-windows-10',
            }),
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok || !tokenData.access_token) {
            return {
                valid: false,
                error: tokenData.error_description || tokenData.message || 'Invalid HRone credentials',
            };
        }

        // Try parsing employeeId / LogOnId from token
        let employeeId = 4050;
        try {
            const parts = tokenData.access_token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                if (payload.LogOnId) {
                    employeeId = parseInt(payload.LogOnId, 10) || 4050;
                }
            }
        } catch (e) {
            // Fall back to 4050
        }

        return {
            valid: true,
            tokenData,
            employeeId,
        };
    } catch (err: any) {
        return {
            valid: false,
            error: err.message || 'Connection error while reaching HRone Gateway',
        };
    }
}

export async function markAttendance(
    overrideAction?: 'In' | 'Out',
    profile?: UserProfile
): Promise<MarkAttendanceResult> {
    const username = profile?.hrUsername || process.env.HR_USERNAME;
    const password = profile?.hrPassword || process.env.HR_PASSWORD;
    const domain = profile?.domainCode || 'uharvest';
    const empId = profile?.employeeId || 4050;
    const lat = profile?.latitude || '28.500385614012345';
    const lng = profile?.longitude || '77.41499672380527';
    const accuracy = profile?.geoAccuracy || '10';
    const locAddress = profile?.geoLocation || '210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India';

    if (!username || !password) {
        throw new Error('Missing HRone login credentials');
    }

    // 1. Fetch Fresh OAuth Token
    const tokenRes = await fetch('https://gateway.app.hrone.cloud/oauth2/token', {
        method: 'POST',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/x-www-form-urlencoded',
            'domaincode': domain,
            'accessmode': 'W',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
            'origin': 'https://app.hrone.cloud',
            'referer': 'https://app.hrone.cloud/',
        },
        body: new URLSearchParams({
            username: username,
            password: password,
            grant_type: 'password',
            loginType: '1',
            companyDomainCode: domain,
            isUpdated: '0',
            validSource: 'Y',
            deviceName: 'Chrome-windows-10',
        }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.message || 'Failed to authenticate with HRone Gateway');
    }

    const jwtToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || '';

    // 2. Determine exact current IST Punch Time & Action
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hour = istDate.getHours();
    const action = overrideAction || (hour < 14 ? 'In' : 'Out');

    const pad = (n: number) => n.toString().padStart(2, '0');
    const punchTime = `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${pad(istDate.getDate())}T${pad(istDate.getHours())}:${pad(istDate.getMinutes())}`;

    const requestPayload = {
        requestType: 'A',
        applyRequestSource: 10,
        employeeId: empId,
        latitude: lat,
        longitude: lng,
        geoAccuracy: accuracy,
        geoLocation: locAddress,
        punchTime: punchTime,
        remarks: action,
        uploadedPhotoOneName: '',
        uploadedPhotoOnePath: '',
        uploadedPhotoTwoName: '',
        uploadedPhotoTwoPath: '',
        attendanceSource: 'A',
        attendanceType: 'Online',
    };

    // 3. Mark Attendance
    const attendanceRes = await fetch('https://app.hrone.cloud/api/timeoffice/mobile/checkin/Attendance/Request', {
        method: 'POST',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'domaincode': domain,
            'accessmode': 'W',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
            'origin': 'https://app.hrone.cloud',
            'referer': 'https://app.hrone.cloud/app',
            'x-requested-with': 'https://app.hrone.cloud',
            'cookie': `JwtTokenCookie=${jwtToken}; RefreshTokenCookie=${refreshToken}`,
        },
        body: JSON.stringify(requestPayload),
    });

    const attendanceData = await attendanceRes.json();

    if (!attendanceRes.ok) {
        throw new Error(attendanceData.message || attendanceData.error || `Attendance API HTTP ${attendanceRes.status}`);
    }

    return {
        success: true,
        action,
        punchTime,
        requestPayload,
        response: attendanceData,
    };
}

export async function getAttendanceHistory(targetDate?: string, profile?: UserProfile): Promise<any> {
    const username = profile?.hrUsername || process.env.HR_USERNAME;
    const password = profile?.hrPassword || process.env.HR_PASSWORD;
    const domain = profile?.domainCode || 'uharvest';
    const empId = profile?.employeeId || 4050;

    if (!username || !password) {
        throw new Error('Missing HRone credentials');
    }

    // 1. Fetch OAuth token
    const tokenRes = await fetch('https://gateway.app.hrone.cloud/oauth2/token', {
        method: 'POST',
        headers: {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/x-www-form-urlencoded',
            'domaincode': domain,
            'accessmode': 'W',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
            'origin': 'https://app.hrone.cloud',
            'referer': 'https://app.hrone.cloud/',
        },
        body: new URLSearchParams({
            username: username,
            password: password,
            grant_type: 'password',
            loginType: '1',
            companyDomainCode: domain,
            isUpdated: '0',
            validSource: 'Y',
            deviceName: 'Chrome-windows-10',
        }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Failed to authenticate with HRone Gateway');
    }

    const jwtToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || '';

    // Calculate target date string (YYYY-MM-DD in IST)
    let dateStr = targetDate;
    if (!dateStr) {
        const now = new Date();
        const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const pad = (n: number) => n.toString().padStart(2, '0');
        dateStr = `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${pad(istDate.getDate())}`;
    }

    const headers = {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'domaincode': domain,
        'accessmode': 'W',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
        'origin': 'https://app.hrone.cloud',
        'referer': 'https://app.hrone.cloud/app/myprofile/calendar',
        'x-requested-with': 'https://app.hrone.cloud',
        'cookie': `JwtTokenCookie=${jwtToken}; RefreshTokenCookie=${refreshToken}`,
    };

    // 2. Query Daywise & RawPunch API
    try {
        const [daywiseRes, rawPunchRes] = await Promise.all([
            fetch(`https://app.hrone.cloud/api/timeoffice/attendance/Daywise/${empId}/${dateStr}`, { method: 'GET', headers }),
            fetch(`https://app.hrone.cloud/api/timeoffice/attendance/RawPunch/${empId}/${dateStr}/true`, { method: 'GET', headers })
        ]);

        const daywiseData = daywiseRes.ok ? await daywiseRes.json() : null;
        const rawPunchData = (rawPunchRes.ok && rawPunchRes.status === 200) ? await rawPunchRes.json() : [];

        const daySummary = Array.isArray(daywiseData) && daywiseData.length > 0 ? daywiseData[0] : null;

        return {
            success: true,
            date: dateStr,
            summary: daySummary ? {
                timeIn: daySummary.timeIn || 'Not Punched',
                timeOut: daySummary.timeout || 'Not Punched',
                workingHours: daySummary.workingHours || '00:00',
                status: `${daySummary.firstHalfDisplayName || ''} / ${daySummary.secondHalfDisplayName || ''}`,
                shift: daySummary.shiftCode || 'General',
            } : null,
            rawPunches: rawPunchData,
            fullDaywise: daySummary,
        };
    } catch (err: any) {
        return {
            success: false,
            date: dateStr,
            error: err.message
        };
    }
}
