import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns';
import mongoose from 'mongoose';

// Fix DNS resolution order & SRV lookups on Windows for Node.js
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const val = valueParts.join('=').trim();
      if (key && val) {
        process.env[key.trim()] = val;
      }
    }
  });
}

const ALGORITHM = 'aes-256-gcm';

function getSecretKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.CRON_SECRET || 'hrone-bot-default-secret-key-32b!';
  return crypto.createHash('sha256').update(secret).digest();
}

function decrypt(cipherText) {
  if (!cipherText) return cipherText;
  const parts = cipherText.split(':');
  if (parts.length !== 3) return cipherText;
  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getSecretKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return cipherText;
  }
}

const UserSchema = new mongoose.Schema({
  chatId: String,
  telegramUsername: String,
  hrUsername: String,
  hrPassword: String,
  domainCode: String,
  employeeId: Number,
  employeeCode: String,
  employeeName: String,
  designation: String,
  department: String,
  company: String,
  mobileNo: String,
  email: String,
  registrationState: String,
}, { strict: false, timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function backfill() {
  console.log('🚀 Connecting to MongoDB...');
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not found in environment!');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB.');

  const users = await User.find({ hrUsername: { $exists: true, $ne: '', $ne: 'pending' } });
  console.log(`📋 Found ${users.length} user(s) in database to update.`);

  let updatedCount = 0;
  let failedCount = 0;

  for (const user of users) {
    console.log(`\n⏳ Processing user: ${user.hrUsername} (Chat ID: ${user.chatId || 'N/A'})...`);
    const plainPassword = decrypt(user.hrPassword);
    const domain = user.domainCode || 'uharvest';

    try {
      // 1. Authenticate with HRone Gateway
      const tokenRes = await fetch('https://gateway.app.hrone.cloud/oauth2/token', {
        method: 'POST',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'content-type': 'application/x-www-form-urlencoded',
          'domaincode': domain,
          'accessmode': 'W',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'origin': 'https://app.hrone.cloud',
          'referer': 'https://app.hrone.cloud/',
        },
        body: new URLSearchParams({
          username: user.hrUsername,
          password: plainPassword,
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
        console.error(`❌ Authentication failed for ${user.hrUsername}:`, tokenData.error_description || tokenData.message || 'Invalid credentials');
        failedCount++;
        continue;
      }

      const jwtToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || '';

      // 2. Fetch LogOnUserDetail
      const detailRes = await fetch('https://app.hrone.cloud/api/LogOnUser/LogOnUserDetail', {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'domaincode': domain,
          'accessmode': 'W',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'origin': 'https://app.hrone.cloud',
          'referer': 'https://app.hrone.cloud/hroneAuth',
          'x-requested-with': 'https://app.hrone.cloud',
          'cookie': `JwtTokenCookie=${jwtToken}; RefreshTokenCookie=${refreshToken}`
        }
      });

      if (!detailRes.ok) {
        console.error(`❌ Failed to fetch LogOnUserDetail for ${user.hrUsername}: HTTP ${detailRes.status}`);
        failedCount++;
        continue;
      }

      const details = await detailRes.json();

      // Update DB record
      if (details.employeeId) user.employeeId = parseInt(details.employeeId, 10) || user.employeeId;
      if (details.employeeCode) user.employeeCode = String(details.employeeCode);
      if (details.employeeName) user.employeeName = String(details.employeeName);
      if (details.designation) user.designation = String(details.designation);
      if (details.department) user.department = String(details.department);
      if (details.company || details.enterpriseName) user.company = String(details.company || details.enterpriseName);
      if (details.mobileNo) user.mobileNo = String(details.mobileNo);
      if (details.personalEmail || details.officialEmail) user.email = String(details.personalEmail || details.officialEmail);

      await user.save();

      console.log(`✅ Successfully updated profile for ${user.employeeName || user.hrUsername}:`);
      console.log(`   • Employee Code: ${user.employeeCode}`);
      console.log(`   • Employee Name: ${user.employeeName}`);
      console.log(`   • Designation:   ${user.designation}`);
      console.log(`   • Department:    ${user.department}`);
      console.log(`   • Company:       ${user.company}`);

      updatedCount++;
    } catch (err) {
      console.error(`❌ Error updating ${user.hrUsername}:`, err.message);
      failedCount++;
    }
  }

  console.log('\n========================================');
  console.log(`🎉 Migration Complete!`);
  console.log(`   • Successfully Updated: ${updatedCount}`);
  console.log(`   • Failed / Skipped:     ${failedCount}`);
  console.log('========================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

backfill();
