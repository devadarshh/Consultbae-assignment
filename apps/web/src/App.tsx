import { useState } from 'react';
import SubmitView from './views/SubmitView';
import SubmissionsView from './views/SubmissionsView';

type Tab = 'submit' | 'submissions';

export default function App() {
  const [tab, setTab] = useState<Tab>('submit');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">ConsultBae Audio Collection</h1>
            <p className="text-xs text-slate-500">Gig worker audio submissions with metadata extraction</p>
          </div>
          <nav className="flex gap-2">
            <button
              onClick={() => setTab('submit')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                tab === 'submit' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Submit Audio
            </button>
            <button
              onClick={() => {
                setTab('submissions');
                setRefreshKey((k) => k + 1);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                tab === 'submissions' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Submissions
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {tab === 'submit' ? (
          <SubmitView onSubmitted={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <SubmissionsView refreshKey={refreshKey} />
        )}
      </main>
    </div>
  );
}