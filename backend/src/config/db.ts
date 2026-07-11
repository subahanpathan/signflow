import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && !(key in process.env) || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

loadEnv();

const MONGODB_URI = process.env.MONGODB_URI || '';

if (!MONGODB_URI) {
  console.error('[db] MONGODB_URI is not set in environment variables!');
}

export const connectDB = async (): Promise<void> => {
  console.log('[db] cwd:', process.cwd());
  console.log('[db] Using MongoDB URI:', MONGODB_URI.replace(/:\/\/.*@/, '://***@'));

  const attempt = async (retries: number): Promise<void> => {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      console.log('MongoDB connected successfully');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      const delay = Math.min(5000 * Math.pow(2, Math.min(retries, 4)), 30000);
      console.log(`Retrying MongoDB connection in ${delay / 1000}s...`);
      setTimeout(() => void attempt(retries + 1), delay);
    }
  };

  void attempt(0);
};
