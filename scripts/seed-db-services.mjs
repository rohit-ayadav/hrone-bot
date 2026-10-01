import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

// Fix Windows DNS querySrv issue for MongoDB Atlas
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

// Parse .env file
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in .env');
  process.exit(1);
}

const EnvironmentServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'Web Apps', trim: true },
    description: { type: String, default: '', trim: true },
    devUrl: { type: String, default: '', trim: true },
    qaUrl: { type: String, default: '', trim: true },
    prodUrl: { type: String, default: '', trim: true },
    localUrl: { type: String, default: '', trim: true },
    tags: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const EnvironmentService =
  mongoose.models.EnvironmentService ||
  mongoose.model('EnvironmentService', EnvironmentServiceSchema);

export const ALL_OFFICE_SERVICES = [
  // --- DIT Core Operations ---
  {
    name: 'DIT Admin Portal',
    category: 'Admin & Ops',
    description: 'DeliverIt primary backoffice operations, sales collections & settings',
    devUrl: 'https://admin-dev.deliverit.net.in/',
    qaUrl: 'https://admin-qa.deliverit.net.in/',
    prodUrl: 'https://admin.deliverit.net.in/',
    tags: ['DIT', 'Admin', 'Operations'],
    sortOrder: 1,
  },
  {
    name: 'DIT User Management',
    category: 'Auth & Security',
    description: 'DeliverIt user management, role privileges & RBAC portal',
    devUrl: 'https://proud-cliff-0c52a6d00.7.azurestaticapps.net/',
    qaUrl: 'https://calm-hill-0ed8b5a00.7.azurestaticapps.net/',
    prodUrl: 'https://happy-field-03bca1c00.7.azurestaticapps.net/',
    tags: ['DIT', 'User Management', 'Roles', 'Azure'],
    sortOrder: 2,
  },
  {
    name: 'DIT Routing (Lumi)',
    category: 'Logistics & Ops',
    description: 'DeliverIt dispatch, order routing, and delivery fleet optimization',
    devUrl: '',
    qaUrl: 'https://ambitious-mushroom-0d5772d00.7.azurestaticapps.net/',
    prodUrl: 'https://lumi.deliverit.net.in/',
    tags: ['DIT', 'Routing', 'Lumi', 'Dispatch'],
    sortOrder: 3,
  },
  {
    name: 'DIT Customer Web',
    category: 'Web Apps',
    description: 'DeliverIt consumer store and customer web portal',
    devUrl: 'https://customer-dev.deliverit.net.in/',
    qaUrl: 'https://customer-qa.deliverit.net.in/',
    prodUrl: '',
    tags: ['DIT', 'Customer', 'Frontend'],
    sortOrder: 4,
  },
  {
    name: 'DIT Sales App',
    category: 'Sales & Marketing',
    description: 'DeliverIt sales partner app & agent catalog interface',
    devUrl: '',
    qaUrl: 'https://blue-moss-031c76000.3.azurestaticapps.net/',
    prodUrl: '',
    tags: ['DIT', 'Sales', 'Partners'],
    sortOrder: 5,
  },
  {
    name: 'DIT WMS (Warehouse)',
    category: 'Logistics & Ops',
    description: 'DeliverIt warehouse management dashboard, inventory & pick-pack',
    devUrl: '',
    qaUrl: 'https://salmon-desert-0c66c7300.7.azurestaticapps.net/',
    prodUrl: '',
    tags: ['DIT', 'WMS', 'Warehouse'],
    sortOrder: 6,
  },
  {
    name: 'Robotics User Management',
    category: 'Auth & Security',
    description: 'Robotics automation fleet & hardware access management',
    devUrl: 'https://thankful-grass-0e5d65800.6.azurestaticapps.net/',
    qaUrl: '',
    prodUrl: '',
    tags: ['Robotics', 'Automation', 'Users'],
    sortOrder: 7,
  },

  // --- UH Platform (UHarvest) ---
  {
    name: 'UH Admin Portal',
    category: 'UH Platform',
    description: 'UHarvest backoffice system settings & central management',
    devUrl: '',
    qaUrl: '',
    prodUrl: 'https://admin.uharvest.in/',
    tags: ['UH', 'UHarvest', 'Admin'],
    sortOrder: 8,
  },
  {
    name: 'UH Routing (Lumi UH)',
    category: 'UH Platform',
    description: 'UHarvest route assignment and dispatch management',
    devUrl: '',
    qaUrl: '',
    prodUrl: 'https://lumi-uh.uharvest.in/',
    tags: ['UH', 'Routing', 'Lumi'],
    sortOrder: 9,
  },
  {
    name: 'UH Sales Partner App',
    category: 'UH Platform',
    description: 'UHarvest sales partner and field merchant app',
    devUrl: '',
    qaUrl: '',
    prodUrl: 'https://sales-partner.uharvest.in/',
    tags: ['UH', 'Sales', 'Partners'],
    sortOrder: 10,
  },
  {
    name: 'UH User Management',
    category: 'UH Platform',
    description: 'UHarvest employee and merchant identity role management',
    devUrl: '',
    qaUrl: '',
    prodUrl: 'https://proud-meadow-008ca6000.7.azurestaticapps.net/',
    tags: ['UH', 'User Management', 'Roles'],
    sortOrder: 11,
  },

  // --- Keycloak & Identity Services ---
  {
    name: 'DIT Keycloak',
    category: 'Auth & Security',
    description: 'Keycloak SSO, OAuth2/OIDC identity realm tokens for DIT platform',
    devUrl: 'https://dit-identity-dev.victorioussky-c561900e.centralindia.azurecontainerapps.io/',
    qaUrl: 'https://identity-service-qa.happyrock-1236a00b.centralindia.azurecontainerapps.io/',
    prodUrl: 'https://dit-identity-production.yellowbeach-a8e8372c.centralindia.azurecontainerapps.io/',
    localUrl: 'http://localhost:8080',
    tags: ['Keycloak', 'Identity', 'Azure', 'SSO'],
    sortOrder: 12,
  },
  {
    name: 'UH Identity (Keycloak)',
    category: 'Auth & Security',
    description: 'UH Identity OpenID Connect & security admin console',
    devUrl: 'https://uh-identity-dev.victorioussky-c561900e.centralindia.azurecontainerapps.io/',
    qaUrl: 'https://uh-identity-qa.happyrock-1236a00b.centralindia.azurecontainerapps.io/',
    prodUrl: 'https://uh-identity-production.bravedesert-38b8e25e.centralindia.azurecontainerapps.io/',
    localUrl: 'http://localhost:8082',
    tags: ['Keycloak', 'UH', 'Identity', 'Azure', 'SSO'],
    sortOrder: 13,
  },
  {
    name: 'External Identity (Keycloak)',
    category: 'Auth & Security',
    description: 'External Keycloak Identity & WMS Worker security admin console',
    devUrl: 'https://external-identity-dev.victorioussky-c561900e.centralindia.azurecontainerapps.io/',
    qaUrl: 'https://external-identity-qa.happyrock-1236a00b.centralindia.azurecontainerapps.io/',
    prodUrl: '',
    localUrl: 'http://localhost:8081',
    tags: ['Keycloak', 'External', 'Identity', 'Azure', 'WMS'],
    sortOrder: 14,
  },
];

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { bufferCommands: false });
    console.log('Connected to MongoDB successfully!');

    for (const svc of ALL_OFFICE_SERVICES) {
      const existing = await EnvironmentService.findOne({ name: svc.name });
      if (existing) {
        console.log(`Updating service: ${svc.name}`);
        await EnvironmentService.updateOne({ _id: existing._id }, { $set: svc });
      } else {
        console.log(`Inserting new service: ${svc.name}`);
        await EnvironmentService.create(svc);
      }
    }

    const totalCount = await EnvironmentService.countDocuments();
    const all = await EnvironmentService.find().sort({ sortOrder: 1 }).select('name devUrl qaUrl prodUrl category');

    console.log(`\n===========================================`);
    console.log(`Successfully synced ${all.length} total services in MongoDB:`);
    console.log(`===========================================`);
    all.forEach((s, idx) => {
      console.log(`${idx + 1}. [${s.category}] ${s.name}`);
      if (s.devUrl) console.log(`   DEV:  ${s.devUrl}`);
      if (s.qaUrl) console.log(`   QA:   ${s.qaUrl}`);
      if (s.prodUrl) console.log(`   PROD: ${s.prodUrl}`);
    });

    await mongoose.disconnect();
    console.log('\nMongoDB disconnected cleanly.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
