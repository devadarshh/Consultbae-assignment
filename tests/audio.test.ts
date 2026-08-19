import { describe, expect, it } from 'vitest';
import { extractAudioMetadata, extractCoreMetadata, extractLoudness, extractNoiseScores } from '../packages/shared/src/audio';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'test-tone.wav',
);

describe('audio metadata extraction (real file)', () => {
  it('extracts core ffprobe metadata', async () => {
    const size = statSync(FIXTURE).size;
    const core = await extractCoreMetadata(FIXTURE, size);
    expect(core.durationSeconds).toBeGreaterThan(4);
    expect(core.durationSeconds).toBeLessThan(6);
    expect(core.sampleRateHz).toBe(44100);
    expect(core.bitrateKbps).toBeGreaterThan(100);
  });

  it('measures integrated loudness in LUFS', async () => {
    const loudness = await extractLoudness(FIXTURE);
    expect(Number.isFinite(loudness)).toBe(true);
    // pure sine at ~ -20 dBFS should land near -20 LUFS
    expect(loudness).toBeGreaterThan(-30);
    expect(loudness).toBeLessThan(-10);
  });

  it('produces bounded noise/quality heuristics', async () => {
    const { noiseScore, qualityScore } = await extractNoiseScores(FIXTURE);
    expect(qualityScore).toBeGreaterThanOrEqual(0);
    expect(qualityScore).toBeLessThanOrEqual(100);
    expect(noiseScore).toBeGreaterThanOrEqual(0);
    expect(noiseScore).toBeLessThanOrEqual(100);
    expect(noiseScore + qualityScore).toBe(100);
  });

  it('runs the full pipeline', async () => {
    const size = statSync(FIXTURE).size;
    const meta = await extractAudioMetadata(FIXTURE, size);
    expect(meta.durationSeconds).toBeGreaterThan(4);
    expect(meta.sampleRateHz).toBe(44100);
    expect(meta.bitrateKbps).toBeGreaterThan(100);
    expect(Number.isFinite(meta.loudnessDb)).toBe(true);
    expect(Number.isFinite(meta.noiseScore)).toBe(true);
  });

  it('rejects a non-audio file', async () => {
    const bogus = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'source1_naukri_applicants.csv');
    await expect(extractCoreMetadata(bogus)).rejects.toThrow();
  });
});