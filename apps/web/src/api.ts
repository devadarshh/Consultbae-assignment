/** API client + response types for the audio collection app. */

export interface PersonRef {
  canonicalName: string;
  phone: string | null;
  city: string | null;
}

export interface AudioSubmission {
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
  createdAt: string;
  fileUrl: string;
  person?: PersonRef | null;
}

export interface ApiError {
  error: string;
}

async function handle<T>(resPromise: Promise<Response>): Promise<T> {
  const res = await resPromise;
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as ApiError;
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export function listSubmissions(): Promise<AudioSubmission[]> {
  return handle<AudioSubmission[]>(fetch('/api/audio-submissions'));
}

export interface SubmitResult {
  submission: AudioSubmission;
  linkedPerson: boolean;
}

export async function submitAudio(name: string, phone: string, file: File): Promise<SubmitResult> {
  const form = new FormData();
  form.append('name', name);
  form.append('phone', phone);
  form.append('audio', file);

  const submission = await handle<AudioSubmission>(
    fetch('/api/audio-submissions', { method: 'POST', body: form }),
  );
  return { submission, linkedPerson: submission.personId != null };
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}