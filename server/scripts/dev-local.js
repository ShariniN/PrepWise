// Runs the whole app locally with an embedded MongoDB. Nothing touches server/.env or any remote database.
// Usage: npm run dev:local            (data persists in server/.local-db between runs)
//        npm run dev:local -- --fresh (wipe the local database first)
// Demo data only: fake universities, fake users, fake questions.
// To run a second copy side by side (e.g. for testing), set PORT, LOCAL_DB_DIR, LOCAL_MONGO_PORT and CLIENT_URL.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.LOCAL_DB_DIR ? path.resolve(process.env.LOCAL_DB_DIR) : path.join(here, '..', '.local-db');
const mongoPort = Number(process.env.LOCAL_MONGO_PORT) || 27111;

if (process.argv.includes('--fresh')) fs.rmSync(dbPath, { recursive: true, force: true });
fs.mkdirSync(dbPath, { recursive: true });

const secretFile = path.join(dbPath, 'jwt-secret.txt');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));

const mongod = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger', port: mongoPort } });

// Set before importing anything that reads the environment (dotenv never overrides existing values).
process.env.MONGODB_URI = mongod.getUri();
process.env.JWT_SECRET = fs.readFileSync(secretFile, 'utf8');
process.env.NODE_ENV = 'development';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.PORT = process.env.PORT || '4000';
// Never send real email or call paid services from the local demo.
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

const mongoose = (await import('mongoose')).default;
await mongoose.connect(process.env.MONGODB_URI, { dbName: 'prepwise' });

const { default: Institution } = await import('../models/Institution.js');
const firstRun = !(await Institution.findOne({ slug: 'demo-a' }));

if (firstRun) {
  console.log('\nFirst run: seeding fake demo data (printed passwords are for local use only)...');
  const seedQuestions = await import('./seed-questions.js');
  await seedQuestions.main();
  const seedDemo = await import('./seed-demo.js');
  await seedDemo.main();
  console.log('\nDemo logins:');
  console.log('  admin@email.com / admin@123');
  console.log('  lecturer@email.com / lecturer@123  (sees Group 1)');
  console.log('  lecturer2@demo-a.test / lecturer@123  (sees Group 2)');
  console.log('  student@email.com / student@123\n');
}

const { default: app } = await import('../app.js');
const server = app.listen(process.env.PORT, () => {
  console.log(`Local API on http://localhost:${process.env.PORT}  (database: embedded, ${dbPath})`);
  console.log('Start the client with: cd client && npm run dev   then open http://localhost:5173');
});

const shutdown = async () => {
  server.close();
  await mongoose.disconnect().catch(() => {});
  await mongod.stop().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
