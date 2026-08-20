import { useEffect, useState } from 'react';
import { formatBytes, formatDuration, getApiUrl, listSubmissions, type AudioSubmission } from '../api';

export default function SubmissionsView({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<AudioSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSubmissions()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load submissions'));
  }, [refreshKey]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-slate-500">No submissions yet.</p>;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-base font-medium text-slate-900">Submissions ({rows.length})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Duration</th>
              <th className="px-4 py-2">Sample rate</th>
              <th className="px-4 py-2">Bitrate</th>
              <th className="px-4 py-2">Loudness</th>
              <th className="px-4 py-2">Size</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2">Playback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-900">
                  {r.submitterName}
                  {r.person && <span className="block text-xs font-normal text-slate-400">linked: {r.person.canonicalName}</span>}
                </td>
                <td className="px-4 py-2 text-slate-700">{r.submitterPhone ?? '—'}</td>
                <td className="px-4 py-2 text-slate-700">{formatDuration(r.durationSeconds)}</td>
                <td className="px-4 py-2 text-slate-700">
                  {r.sampleRateHz != null ? `${(r.sampleRateHz / 1000).toFixed(1)} kHz` : '—'}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {r.bitrateKbps != null ? `${r.bitrateKbps} kbps` : '—'}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {r.loudnessDb != null ? `${r.loudnessDb} LUFS` : '—'}
                  {r.noiseScore != null && (
                    <span className="block text-xs text-slate-400">noise {r.noiseScore}/100</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-700">{formatBytes(r.sizeBytes)}</td>
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <audio controls preload="none" className="h-8 w-40" src={getApiUrl(r.fileUrl)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}