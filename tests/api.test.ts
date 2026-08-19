import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app';
import { prisma } from '../apps/api/src/lib/prisma';

let app: FastifyInstance;
let uploadsBefore: string[];
const uploadDir = join(process.cwd(), 'uploads');

function multipartBody(opts: {
  name: string;
  phone: string;
  filename: string;
  mimeType: string;
  content?: Buffer;
}): Buffer {
  const boundary = '----vitest-boundary-42';
  const content = opts.content ?? Buffer.from('fake-audio-bytes');
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${opts.name}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="phone"\r\n\r\n${opts.phone}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${opts.filename}"\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  ];
  const body = Buffer.concat([Buffer.from(parts.join('')), content, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return body;
}

async function upload(opts: { name: string; phone: string; filename: string; mimeType: string; content?: Buffer }) {
  return app.inject({
    method: 'POST',
    url: '/api/audio-submissions',
    headers: { 'content-type': `multipart/form-data; boundary=----vitest-boundary-42` },
    payload: multipartBody(opts),
  });
}

beforeAll(async () => {
  uploadsBefore = listUploadDir();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.audioSubmission.deleteMany();
  for (const f of listUploadDir()) {
    if (!uploadsBefore.includes(f)) rmSync(join(uploadDir, f), { force: true });
  }
  await prisma.$disconnect();
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /api/audio-submissions', () => {
  it('rejects a request with no file', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/audio-submissions',
      headers: { 'content-type': 'multipart/form-data; boundary=----vitest-boundary-42' },
      payload: Buffer.from(`------vitest-boundary-42\r\nContent-Disposition: form-data; name="name"\r\n\r\nNo File\r\n------vitest-boundary-42--\r\n`),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing name', async () => {
    const res = await upload({ name: 'A', phone: '9000000001', filename: 'a.wav', mimeType: 'audio/wav' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Name is required/);
  });

  it('rejects an invalid phone', async () => {
    const res = await upload({ name: 'Test User', phone: '123', filename: 'a.wav', mimeType: 'audio/wav' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an unsupported file type', async () => {
    const res = await upload({ name: 'Test User', phone: '9000000001', filename: 'notes.txt', mimeType: 'text/plain' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Unsupported file type/);
  });

  it('rejects content that is not real audio (ffprobe fails)', async () => {
    const res = await upload({
      name: 'Test User',
      phone: '9000000001',
      filename: 'audio.wav',
      mimeType: 'application/json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Could not read audio file/);
  });

  it('accepts a real WAV and extracts metadata', async () => {
    const wav = await readFixtureWav();
    const res = await upload({
      name: 'Tanvi Gupta',
      phone: '+91 90000-00002',
      filename: 'tanvi.wav',
      mimeType: 'audio/wav',
      content: wav,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.submitterName).toBe('Tanvi Gupta');
    expect(body.submitterPhone).toBe('919000000002');
    expect(body.durationSeconds).toBeCloseTo(5, 0);
    expect(body.sampleRateHz).toBe(44100);
    expect(body.bitrateKbps).toBeGreaterThan(0);
    expect(body.loudnessDb).toBeCloseTo(-21.8, 0);
    // linked to the existing merged Person by normalized phone, or created
    expect(body.personId).toBeGreaterThan(0);
    expect(body.fileUrl).toMatch(/\/api\/audio-submissions\/\d+\/file/);
  });

  it('preserves the uploaded file on disk', async () => {
    const files = await listUploadDir();
    expect(files.length).toBeGreaterThan(0);
  });
});

describe('GET /api/audio-submissions', () => {
  it('lists submissions with metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audio-submissions' });
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('durationSeconds');
    expect(rows[0]).toHaveProperty('loudnessDb');
  });
});

describe('GET /api/audio-submissions/:id', () => {
  it('returns a submission by id', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/audio-submissions' });
    const id = list.json()[0].id;
    const res = await app.inject({ method: 'GET', url: `/api/audio-submissions/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(id);
  });

  it('404s for an unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audio-submissions/999999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/not found/i);
  });
});

describe('GET /api/audio-submissions/:id/file', () => {
  it('streams the audio file', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/audio-submissions' });
    const row = list.json()[0];
    const res = await app.inject({ method: 'GET', url: row.fileUrl });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio/);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('404s when the file is missing on disk', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audio-submissions/999999/file' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/people', () => {
  it('returns the merged people directory', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/people' });
    expect(res.statusCode).toBe(200);
    const people = res.json();
    expect(Array.isArray(people)).toBe(true);
    expect(people.length).toBeGreaterThan(0);
    expect(people[0]).toHaveProperty('name');
    expect(people[0]).toHaveProperty('skills');
  });
});

// --- helpers (kept at the bottom so test names stay readable) ---

function readFixtureWav(): Buffer {
  const p = join(process.cwd(), 'tests', 'fixtures', 'test-tone.wav');
  if (!existsSync(p)) throw new Error('missing fixture tests/fixtures/test-tone.wav — run npm run ffmpeg:generate-test-audio');
  return readFileSync(p);
}

function listUploadDir(): string[] {
  if (!existsSync(uploadDir)) return [];
  return readdirSync(uploadDir);
}