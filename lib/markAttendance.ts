import { sendTelegramMessage } from './telegram';

export interface MarkAttendanceResult {
    success: boolean;
    action: 'In' | 'Out';
    punchTime: string;
    response: any;
}

export async function markAttendance(overrideAction?: 'In' | 'Out'): Promise<MarkAttendanceResult> {
    const username = process.env.HR_USERNAME;
    const password = process.env.HR_PASSWORD;
    const domain = 'uharvest';

    if (!username || !password) {
        throw new Error('Missing HR_USERNAME or HR_PASSWORD environment variables');
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

    // 2. Determine IST Punch Time & Action
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hour = istDate.getHours();
    const action = overrideAction || (hour < 14 ? 'In' : 'Out');

    const pad = (n: number) => n.toString().padStart(2, '0');
    const punchTime = `${istDate.getFullYear()}-${pad(istDate.getMonth() + 1)}-${pad(istDate.getDate())}T${pad(istDate.getHours())}:${pad(istDate.getMinutes())}`;

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
        body: JSON.stringify({
            requestType: 'A',
            applyRequestSource: 10,
            employeeId: 4050,
            latitude: '28.500385614012345',
            longitude: '77.41499672380527',
            geoAccuracy: '10',
            geoLocation: '210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India',
            punchTime: punchTime,
            remarks: action,
            uploadedPhotoOneName: '',
            uploadedPhotoOnePath: '',
            uploadedPhotoTwoName: '',
            uploadedPhotoTwoPath: '',
            attendanceSource: 'A',
            attendanceType: 'Online',
        }),
    });

    const attendanceData = await attendanceRes.json();

    if (!attendanceRes.ok) {
        throw new Error(attendanceData.message || attendanceData.error || `Attendance API HTTP ${attendanceRes.status}`);
    }

    return {
        success: true,
        action,
        punchTime,
        response: attendanceData,
    };
}

export async function getAttendanceHistory(): Promise<any> {
    const username = process.env.HR_USERNAME;
    const password = process.env.HR_PASSWORD;
    const domain = 'uharvest';

    if (!username || !password) {
        throw new Error('Missing HR_USERNAME or HR_PASSWORD environment variables');
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

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 2. Query History API
    try {
        const historyRes = await fetch('https://app.hrone.cloud/api/timeoffice/mobile/checkin/Attendance/History', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json',
                'domaincode': domain,
                'accessmode': 'W',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
                'origin': 'https://app.hrone.cloud',
                'referer': 'https://app.hrone.cloud/app',
                'cookie': `JwtTokenCookie=${jwtToken}; RefreshTokenCookie=${refreshToken}`,
            },
            body: JSON.stringify({
                employeeId: 4050,
                month: month,
                year: year,
            }),
        });

        const historyData = await historyRes.json();
        return {
            month,
            year,
            data: historyData,
        };
    } catch (err: any) {
        return {
            month,
            year,
            data: null,
            error: err.message
        };
    }
}
