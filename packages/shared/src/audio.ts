/**
 * Audio metadata extraction via ffprobe + ffmpeg filters.
 *
 *  - ffprobe               : duration, sample rate, bitrate, codec
 *  - ffmpeg ebur128 filter : integrated loudness (LUFS, the broadcast loudness standard)
 *  - ffmpeg astats filter  : RMS level + noise floor -> heuristic noise/quality scores (bonus)
 *
 * All values are read from the actual file, never from client-supplied metadata.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'fluent-ffmpeg';

const execFileP = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 90_000;

export interface AudioMetadata {
  durationSeconds: number;
  sampleRateHz: number;
  bitrateKbps: number;
  loudnessDb: number; // integrated loudness, LUFS (approx dB)
  noiseScore: number; // 0-100 heuristic, higher = noisier
  qualityScore: number; // 0-100 heuristic, higher = cleaner
  codec: string;
}

function runFfmpeg(args: string[]): Promise<string> {
  return execFileP('ffmpeg', args, {
    timeout: FFMPEG_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  }).then((r) => r.stderr); // ffmpeg writes stats to stderr
}

/**
 * Core probe: duration (s), sample rate (Hz), bitrate (kbps) and codec from ffprobe.
 * Falls back to size/duration for bitrate when the container doesn't expose it.
 */
export async function extractCoreMetadata(filePath: string, sizeBytes?: number): Promise<{
  durationSeconds: number;
  sampleRateHz: number;
  bitrateKbps: number;
  codec: string;
}> {
  const info = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
  });

  const stream = info.streams?.find((s) => s.codec_type === 'audio');
  if (!stream) throw new Error('No audio stream found in file');

  const durationSeconds = Number(stream.duration ?? info.format?.duration ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Could not determine audio duration');
  }

  const sampleRateHz = Number(stream.sample_rate ?? 0);
  const rawBitrate = Number(stream.bit_rate ?? info.format?.bit_rate ?? 0);
  const bitrateBps =
    rawBitrate > 0
      ? rawBitrate
      : sizeBytes && sizeBytes > 0
        ? (sizeBytes * 8) / durationSeconds
        : 0;

  return {
    durationSeconds,
    sampleRateHz: Number.isFinite(sampleRateHz) ? Math.round(sampleRateHz) : 0,
    bitrateKbps: Math.round(bitrateBps / 1000),
    codec: stream.codec_name ?? 'unknown',
  };
}

/** Integrated loudness in LUFS via the EBU R128 filter. */
export async function extractLoudness(filePath: string): Promise<number> {
  const stderr = await runFfmpeg(['-hide_banner', '-i', filePath, '-filter_complex', 'ebur128', '-f', 'null', '-']);
  // ebur128 prints per-frame progress ("... I: -70.0 LUFS") and a final summary
  // ("    I:         -21.8 LUFS"). Only the summary line starts with whitespace-then-"I:".
  const m = stderr.match(/^\s*I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/m);
  const value = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(value)) throw new Error('Could not measure loudness (ebur128)');
  return Math.round(value * 10) / 10;
}

/**
 * Noise/quality heuristic from astats: SNR ~= RMS level - noise floor (dB).
 * Higher SNR = cleaner recording. Scores are clamped to 0-100 and clearly heuristics.
 */
export async function extractNoiseScores(filePath: string): Promise<{ noiseScore: number; qualityScore: number }> {
  const stderr = await runFfmpeg(['-hide_banner', '-i', filePath, '-af', 'astats', '-f', 'null', '-']);

  const rmsMatch = stderr.match(/RMS level dB:\s+(-?\d+(?:\.\d+)?)/);
  const floorMatch = stderr.match(/Noise floor dB:\s+(-?\d+(?:\.\d+)?)/);

  const rms = rmsMatch ? Number(rmsMatch[1]) : NaN;
  const floor = floorMatch ? Number(floorMatch[1]) : NaN;

  if (!Number.isFinite(rms) || !Number.isFinite(floor)) {
    return { noiseScore: NaN, qualityScore: NaN };
  }

  const snr = rms - floor; // dB of separation between signal level and noise floor
  const qualityScore = clamp(Math.round(snr * 2), 0, 100);
  const noiseScore = 100 - qualityScore;
  return { noiseScore, qualityScore };
}

/** Full extraction pipeline; every value read from the file itself. */
export async function extractAudioMetadata(filePath: string, sizeBytes?: number): Promise<AudioMetadata> {
  const core = await extractCoreMetadata(filePath, sizeBytes);
  const loudness = await extractLoudness(filePath);
  const scores = await extractNoiseScores(filePath);
  return { ...core, loudnessDb: loudness, ...scores };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}