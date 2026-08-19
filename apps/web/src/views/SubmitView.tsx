import { useRef, useState } from 'react';
import { submitAudio, type AudioSubmission } from '../api';

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function SubmitView({ onSubmitted }: { onSubmitted: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AudioSubmission | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Please choose an audio file');
      return;
    }
    setError(null);
    setResult(null);
    setPhase('uploading');
    try {
      const { submission, linkedPerson } = await submitAudio(name, phone, file);
      setPhase('processing'); // metadata already extracted server-side; show success below
      setResult(submission);
      setPhase('done');
      if (!linkedPerson) {
        // no-op: phone always resolves or creates a person server-side
      }
      onSubmitted();
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 max-w-xl">
      <h2 className="text-base font-medium text-slate-900 mb-4">Submit an audio recording</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="e.g. Tanvi Gupta"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="e.g. +919000000254"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="audio">
            Audio file
          </label>
          <input
            id="audio"
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.aac"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          />
          {file && (
            <p className="mt-1 text-xs text-slate-500">
              {file.name} — {(file.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={phase === 'uploading'}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {phase === 'uploading' ? 'Uploading…' : 'Submit'}
        </button>
      </form>

      {phase === 'uploading' && (
        <div className="mt-4 text-sm text-slate-600">
          <span className="inline-block h-4 w-4 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin align-middle mr-2" />
          Uploading and extracting audio metadata…
        </div>
      )}

      {phase === 'done' && result && (
        <div className="mt-6 rounded-md bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm font-medium text-emerald-800 mb-2">Submission successful</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Duration</dt>
            <dd>{result.durationSeconds != null ? `${result.durationSeconds.toFixed(1)} s` : '—'}</dd>
            <dt className="text-slate-500">Sample rate</dt>
            <dd>{result.sampleRateHz != null ? `${(result.sampleRateHz / 1000).toFixed(1)} kHz` : '—'}</dd>
            <dt className="text-slate-500">Bitrate</dt>
            <dd>{result.bitrateKbps != null ? `${result.bitrateKbps} kbps` : '—'}</dd>
            <dt className="text-slate-500">Loudness</dt>
            <dd>{result.loudnessDb != null ? `${result.loudnessDb} LUFS` : '—'}</dd>
            <dt className="text-slate-500">Linked person</dt>
            <dd>{result.person?.canonicalName ?? 'New person created'}</dd>
          </dl>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="mt-6 rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}