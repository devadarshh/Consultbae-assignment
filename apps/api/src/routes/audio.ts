/**
 * Audio submission routes.
 *
 * POST /api/audio-submissions   -> multipart (name, phone, audio file). Saves the file,
 *                                   extracts metadata with ffmpeg/ffprobe, resolves/creates
 *                                   the Person, stores the AudioSubmission row.
 * GET  /api/audio-submissions    -> list (newest first)
 * GET  /api/audio-submissions/:id
 * GET  /api/audio-submissions/:id/file -> streams the stored audio for playback
 */
import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { extractAudioMetadata } from '../../../../packages/shared/src/audio';
import { normalizeName, normalizePhone } from '../../../../packages/shared/src/normalize';
import { prisma } from '../lib/prisma';
import { config } from '../config';

const ALLOWED_EXTENSIONS = new Set(['wav', 'mp3', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'webm', 'wma', 'opus', 'mp4']);

export const audioSubmissionSchema = z.object({
  name: z.string().trim().min(2, 'Name is required (min 2 characters)').max(120),
  phone: z.string().trim().min(5, 'Phone is required'),
});

function sanitizeExt(filename: string): string {
  const ext = path.extname(filename || '').toLowerCase().replace('.', '');
  return ALLOWED_EXTENSIONS.has(ext) ? ext : '';
}

function fieldValue(fields: Record<string, unknown>, key: string): string {
  const v = fields[key];
  if (Array.isArray(v)) return String(v[0] ?? '');
  if (v && typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value);
  return '';
}

export function registerAudioRoutes(app: FastifyInstance) {
  app.post('/api/audio-submissions', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No multipart file received' });

    const nameRaw = fieldValue(data.fields as Record<string, unknown>, 'name');
    const phoneRaw = fieldValue(data.fields as Record<string, unknown>, 'phone');

    // Validate fields (never trust client metadata for the audio properties themselves).
    const parsed = audioSubmissionSchema.safeParse({ name: nameRaw, phone: phoneRaw });
    if (!parsed.success) {
      data.file.resume();
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }

    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      data.file.resume();
      return reply.code(400).send({ error: 'Phone must be a valid Indian mobile number' });
    }

    // Validate file type + size while streaming to disk.
    const ext = sanitizeExt(data.filename);
    const mimetype = data.mimetype ?? '';
    const isAudio = mimetype.startsWith('audio/') || ext !== '';
    if (!isAudio) {
      data.file.resume();
      return reply.code(400).send({ error: `Unsupported file type "${data.filename}" (${mimetype || 'no mime'}). Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` });
    }

    const safeExt = ext || 'audio';
    const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`;
    const filePath = path.join(config.uploadDir, storedName);

    let sizeBytes = 0;
    try {
      await pipeline(
        data.file,
        new (await import('node:stream')).Transform({
          transform(chunk, _enc, cb) {
            sizeBytes += chunk.length;
            if (sizeBytes > config.maxUploadBytes) {
              cb(new Error('file_too_large'));
              return;
            }
            cb(null, chunk);
          },
          flush(cb) {
            cb();
          },
        }),
        createWriteStream(filePath, { flags: 'wx' }),
      );
    } catch (err) {
      const tooLarge = (err as Error).message === 'file_too_large';
      await stat(filePath).then((s) => s).catch(() => null);
      // best-effort cleanup of the partial file
      try {
        const { rm } = await import('node:fs/promises');
        await rm(filePath, { force: true });
      } catch {
        /* ignore */
      }
      return reply.code(tooLarge ? 413 : 400).send({
        error: tooLarge ? `File exceeds the ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB limit` : 'Failed to store file',
      });
    }

    // Extract metadata from the actual file.
    let metadata;
    try {
      metadata = await extractAudioMetadata(filePath, sizeBytes);
    } catch (err) {
      try {
        const { rm } = await import('node:fs/promises');
        await rm(filePath, { force: true });
      } catch {
        /* ignore */
      }
      return reply.code(400).send({ error: `Could not read audio file: ${(err as Error).message}` });
    }

    // Link to an existing person by canonical phone, otherwise create a new person.
    const person = await prisma.person.findFirst({ where: { phone } });
    const personId = person
      ? person.id
      : (
          await prisma.person.create({
            data: { canonicalName: normalizeName(parsed.data.name), phone },
          })
        ).id;

    const submission = await prisma.audioSubmission.create({
      data: {
        personId,
        submitterName: normalizeName(parsed.data.name),
        submitterPhone: phone,
        filePath,
        originalFilename: data.filename,
        mimeType: mimetype,
        sizeBytes,
        durationSeconds: metadata.durationSeconds,
        sampleRateHz: metadata.sampleRateHz,
        bitrateKbps: metadata.bitrateKbps,
        loudnessDb: metadata.loudnessDb,
        noiseScore: Number.isFinite(metadata.noiseScore) ? metadata.noiseScore : null,
        qualityScore: Number.isFinite(metadata.qualityScore) ? metadata.qualityScore : null,
      },
    });

    return reply.code(201).send(toPublic(submission));
  });

  app.get('/api/audio-submissions', async () => {
    const rows = await prisma.audioSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { person: { select: { canonicalName: true, phone: true, city: true } } },
    });
    return rows.map((r) => ({ ...toPublic(r), person: r.person }));
  });

  app.get('/api/audio-submissions/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid id' });
    const row = await prisma.audioSubmission.findUnique({
      where: { id },
      include: { person: { select: { canonicalName: true, phone: true, city: true } } },
    });
    if (!row) return reply.code(404).send({ error: 'Submission not found' });
    return reply.send({ ...toPublic(row), person: row.person });
  });

  app.get('/api/audio-submissions/:id/file', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid id' });
    const row = await prisma.audioSubmission.findUnique({ where: { id } });
    if (!row) return reply.code(404).send({ error: 'Submission not found' });

    const info = await stat(row.filePath).catch(() => null);
    if (!info) return reply.code(404).send({ error: 'Audio file missing on disk' });

    const { createReadStream } = await import('node:fs');
    return reply
      .header('Content-Type', row.mimeType ?? 'audio/wav')
      .header('Content-Length', info.size)
      .header('Content-Disposition', `inline; filename="${row.originalFilename}"`)
      .send(createReadStream(row.filePath));
  });

  app.get('/api/health', async () => ({ status: 'ok' }));
}

interface SubmissionRow {
  id: number;
  personId: number | null;
  submitterName: string;
  submitterPhone: string | null;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number;
  durationSeconds: number | null;
  sampleRateHz: number | null;
  bitrateKbps: number | null;
  loudnessDb: number | null;
  noiseScore: number | null;
  qualityScore: number | null;
  createdAt: Date;
}

function toPublic(row: SubmissionRow) {
  return {
    id: row.id,
    personId: row.personId,
    submitterName: row.submitterName,
    submitterPhone: row.submitterPhone,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    durationSeconds: row.durationSeconds,
    sampleRateHz: row.sampleRateHz,
    bitrateKbps: row.bitrateKbps,
    loudnessDb: row.loudnessDb,
    noiseScore: row.noiseScore,
    qualityScore: row.qualityScore,
    createdAt: row.createdAt,
    fileUrl: `/api/audio-submissions/${row.id}/file`,
  };
}