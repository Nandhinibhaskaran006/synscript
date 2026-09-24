import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireAuth } from "../hooks/useRequireAuth";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Settings" }] }),
  component: SettingsPage,
});

function loadPrefs() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("syncscript_prefs") || "{}"); } catch { return {}; }
}

// ── Layout helpers — defined OUTSIDE the component to prevent remounting ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#1d2026]/70 border border-white/5 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-center">
      <label className="text-sm text-[#c2c6d6]">{label}</label>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

const inputClass = "w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[#3B82F6] outline-none text-[#e1e2eb]";

function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useRequireAuth();
  const { updateProfile } = useAuth();

  const [prefs, setPrefs] = useState<any>({
    name: "",
    email: "",
    githubUrl: "",
    theme: "Dark",
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    autoSave: true,
    notifications: true,
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const p = loadPrefs() || {};
    setPrefs((prev: any) => ({
      ...prev,
      ...p,
      name: user?.username ?? p.name ?? "",
      email: user?.email ?? p.email ?? "",
      githubUrl: user?.githubUrl ?? p.githubUrl ?? "",
    }));
  }, [user]);

  const update = (k: string, v: any) => {
    setErrorMsg("");
    setPrefs((p: any) => ({ ...p, [k]: v }));
  };

  const save = async () => {
    try {
      setSaving(true);
      setErrorMsg("");
      
      const newName = prefs.name?.trim();
      const newGithubUrl = prefs.githubUrl?.trim() ?? "";

      // Save username & githubUrl to database via AuthContext
      await updateProfile({
        username: newName || user?.username,
        githubUrl: newGithubUrl,
      });

      localStorage.setItem("syncscript_prefs", JSON.stringify(prefs));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error("Failed to save settings", err);
      setErrorMsg(err.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <main className="p-10 max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-[#8c909f] text-sm mt-1">Manage your profile, editor, and account preferences.</p>
          </div>
          <div className="flex items-center gap-3">
            {errorMsg && <span className="text-rose-400 text-xs font-medium">{errorMsg}</span>}
            <button 
              onClick={save} 
              disabled={saving}
              className="btn-flashlight px-5 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563eb] text-white font-bold disabled:opacity-50 transition"
            >
              {saving ? "Saving..." : saved ? "Saved ✓" : "Save changes"}
            </button>
          </div>
        </header>

        <Section title="Profile">
          <Field label="Display name">
            <input 
              className={inputClass} 
              value={prefs.name} 
              onChange={e => update("name", e.target.value)} 
              placeholder="Your display name"
            />
          </Field>
          <Field label="GitHub Profile URL">
            <input 
              type="url"
              className={inputClass} 
              value={prefs.githubUrl} 
              onChange={e => update("githubUrl", e.target.value)} 
              placeholder="https://github.com/yourusername"
            />
          </Field>
          <Field label="Email">
            <input 
              type="email" 
              className={`${inputClass} opacity-75 cursor-not-allowed`} 
              value={prefs.email} 
              readOnly 
              title="Email cannot be changed directly"
            />
          </Field>
        </Section>

        <Section title="Appearance">
          <Field label="Theme">
            <div className="flex gap-2">
              {["Dark", "Light", "System"].map(t => (
                <button key={t} onClick={() => update("theme", t)} className={`px-4 py-2 rounded-lg text-sm border transition ${prefs.theme === t ? "bg-[#3B82F6] border-[#3B82F6] text-white" : "border-white/10 text-[#c2c6d6] hover:bg-white/5"}`}>{t}</button>
              ))}
            </div>
          </Field>
        </Section>

        <Section title="Editor preferences">
          <Field label="Font size">
            <input type="number" min={10} max={24} className={inputClass} value={prefs.fontSize} onChange={e => update("fontSize", Number(e.target.value))} />
          </Field>
          <Field label="Tab size">
            <select className={inputClass} value={prefs.tabSize} onChange={e => update("tabSize", Number(e.target.value))}>
              {[2, 4, 8].map(n => <option key={n} value={n}>{n} spaces</option>)}
            </select>
          </Field>
          <Field label="Word wrap">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={prefs.wordWrap} onChange={e => update("wordWrap", e.target.checked)} className="accent-[#3B82F6] w-4 h-4" />
              <span className="text-sm text-[#c2c6d6]">Wrap long lines</span>
            </label>
          </Field>
          <Field label="Auto save">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={prefs.autoSave} onChange={e => update("autoSave", e.target.checked)} className="accent-[#3B82F6] w-4 h-4" />
              <span className="text-sm text-[#c2c6d6]">Save changes automatically</span>
            </label>
          </Field>
        </Section>

        <Section title="Account">
          <Field label="Notifications">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={prefs.notifications} onChange={e => update("notifications", e.target.checked)} className="accent-[#3B82F6] w-4 h-4" />
              <span className="text-sm text-[#c2c6d6]">Email me about room activity</span>
            </label>
          </Field>
          <Field label="Danger zone">
            <button className="px-4 py-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm">Delete account</button>
          </Field>
        </Section>
      </main>
    </AppShell>
  );
}
