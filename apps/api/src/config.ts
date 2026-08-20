import { mkdirSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const webOriginEnv = process.env.WEB_ORIGIN ?? '*';
const webOrigin: boolean | string | string[] =
  webOriginEnv === '*'
    ? true
    : webOriginEnv.includes(',')
      ? webOriginEnv.split(',').map((s) => s.trim())
      : webOriginEnv;

export const config = {
  port: int(process.env.PORT, 3001),
  webOrigin,
  uploadDir: UPLOAD_DIR,
  maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 25 * 1024 * 1024), // 25 MB default
  llm: {
    baseUrl: process.env.N8N_LLM_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: process.env.N8N_LLM_MODEL ?? 'gemini-3.6-flash',
  },
};

export type AppConfig = typeof config;