import fs from 'fs';
import path from 'path';
import dns from 'dns';
import mongoose from 'mongoose';

// Fix DNS resolution order & SRV lookups on Windows
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
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

const DEFAULT_OFFICE = {
  latitude: '28.500385614012345',
  longitude: '77.41499672380527',
  geoLocation: '210-211, altF Coworking Space, Sector 142, Noida, Uttar Pradesh 201304, India',
  geoAccuracy: '10'
};

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('No MONGODB_URI found');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const collection = mongoose.connection.collection('users');

  const res = await collection.updateMany(
    {
      $or: [
        { officeGeoLocation: { $exists: false } },
        { officeGeoLocation: null },
        { officeGeoLocation: '' }
      ]
    },
    {
      $set: {
        officeLatitude: DEFAULT_OFFICE.latitude,
        officeLongitude: DEFAULT_OFFICE.longitude,
        officeGeoLocation: DEFAULT_OFFICE.geoLocation,
        geoAccuracy: DEFAULT_OFFICE.geoAccuracy
      }
    }
  );
  console.log(`Updated office location for ${res.modifiedCount} user(s).`);

  const workModeRes = await collection.updateMany(
    {
      $or: [
        { workMode: { $exists: false } },
        { workMode: null }
      ]
    },
    {
      $set: { workMode: 'OFFICE' }
    }
  );
  console.log(`Updated workMode for ${workModeRes.modifiedCount} user(s).`);

  const allUsers = await collection.find({}).toArray();
  console.log('User status after update:');
  allUsers.forEach((u) => {
    console.log(`- ${u.hrUsername}: workMode=${u.workMode}, office=${u.officeGeoLocation}`);
  });

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(console.error);
