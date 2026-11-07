// Runs the whole app locally with an embedded MongoDB. Nothing touches server/.env or any remote database.
// Usage: npm run dev:local            (data persists in server/.local-db between runs)
//        npm run dev:local -- --fresh (wipe the local database first)
// Demo data only: fake universities, fake users, fake questions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(here, '..', '.local-db');

if (process.argv.includes('--fresh')) fs.rmSync(dbPath, { recursive: true, force: true });
fs.mkdirSync(dbPath, { recursive: true });

const secretFile = path.join(dbPath, 'jwt-secret.txt');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));

const mongod = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger' } });

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
const firstRun = !(await Institution.findOne({ slug: 'demo-university-a' }));

if (firstRun) {
  console.log('\nFirst run: seeding fake demo data (printed passwords are for local use only)...');
  const seedQuestions = await import('./seed-questions.js');
  await seedQuestions.main();
  const seedDemo = await import('./seed-demo.js');
  await seedDemo.main();
  console.log('\nSave the credentials above. They are only printed on the first run.\n');
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
