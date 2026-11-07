// Shared helpers for the owner scripts. Plain node: dotenv + mongoose, no server needed.
import 'dotenv/config';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

export const connect = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (put it in server/.env)');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'prepwise' });
};

export const disconnect = () => mongoose.disconnect();

// True when this file is the one being run (so tests can import a script's helpers safely).
export const isMain = (metaUrl) => !!process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href;

export const slugify = (name) =>
  String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const run = async (main) => {
  try {
    await main();
    process.exitCode = process.exitCode || 0;
  } catch (error) {
    console.error('Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await disconnect().catch(() => {});
  }
};
