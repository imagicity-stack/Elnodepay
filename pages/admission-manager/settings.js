import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { fetchSettings, fetchUserRole, saveSettings } from '../../lib/admissionService';

const useAdmissionGuard = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/unauthorized');
        return;
      }
      const roles = await fetchUserRole(user.uid);
      if (!roles.includes('admission_manager')) {
        router.push('/unauthorized');
        return;
      }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);
  return { loading };
};

const SettingsPage = () => {
  const { loading } = useAdmissionGuard();
  const [settings, setSettings] = useState({ leadSources: [], landingLabels: {}, customTags: [] });

  useEffect(() => {
    fetchSettings().then(setSettings);
  }, []);

  const updateLeadSource = (value, index) => {
    const leadSources = [...(settings.leadSources || [])];
    leadSources[index] = value;
    setSettings((prev) => ({ ...prev, leadSources }));
  };

  const addLeadSource = () => setSettings((prev) => ({ ...prev, leadSources: [...(prev.leadSources || []), ''] }));

  const updateTag = (value, index) => {
    const customTags = [...(settings.customTags || [])];
    customTags[index] = value;
    setSettings((prev) => ({ ...prev, customTags }));
  };

  const addTag = () => setSettings((prev) => ({ ...prev, customTags: [...(prev.customTags || []), ''] }));

  const updateLabel = (key, value) => {
    setSettings((prev) => ({ ...prev, landingLabels: { ...(prev.landingLabels || {}), [key]: value } }));
  };

  const handleSave = async () => {
    await saveSettings(settings);
  };

  if (loading) return <div className="p-6 text-sm">Checking permissions...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <Head>
        <title>Integration settings</title>
      </Head>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admission Manager Portal</p>
            <h1 className="text-3xl font-semibold text-slate-900">Integration settings</h1>
          </div>
          <a href="/admission-manager" className="text-sm font-semibold text-cardinal hover:underline">
            Back to dashboard
          </a>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Lead sources</h3>
              <button
                type="button"
                onClick={addLeadSource}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Add source
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {(settings.leadSources || []).map((source, index) => (
                <input
                  key={`source-${index}`}
                  value={source}
                  onChange={(e) => updateLeadSource(e.target.value, index)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Landing page labels</h3>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {['name', 'phone', 'email', 'class'].map((key) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-500">{key} label</label>
                  <input
                    value={settings.landingLabels?.[key] || ''}
                    onChange={(e) => updateLabel(key, e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Custom tags</h3>
              <button
                type="button"
                onClick={addTag}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Add tag
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {(settings.customTags || []).map((tag, index) => (
                <input
                  key={`tag-${index}`}
                  value={tag}
                  onChange={(e) => updateTag(e.target.value, index)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-xl bg-cardinal px-3 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90"
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
