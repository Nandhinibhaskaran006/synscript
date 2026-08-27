import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isLoggedIn, setRedirect } from "@/lib/auth";
import { AppShell } from "../components/AppShell";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Settings" }] }),
  component: SettingsPage,
});

function loadPrefs() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("syncscript_prefs") || "{}"); } catch { return {}; }
}

function SettingsPage() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isLoggedIn()) { setRedirect("/settings"); navigate({ to: "/login" }); }
  }, [navigate]);

  const [prefs, setPrefs] = useState<any>({
    name: "Alex Rivera",
    email: "alex.rivera@syncscript.dev",
    theme: "Dark",
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    autoSave: true,
    notifications: true,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = loadPrefs();
    if (p) setPrefs((prev: any) => ({ ...prev, ...p }));
  }, []);

  const update = (k: string, v: any) => setPrefs((p: any) => ({ ...p, [k]: v }));
  const save = () => {
    localStorage.setItem("syncscript_prefs", JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Section = ({ title, children }: any) => (
    <section className="bg-[#1d2026]/70 border border-white/5 rounded-xl p-6 space-y-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );

  const Field = ({ label, children }: any) => (
    <div className="grid grid-cols-3 gap-4 items-center">
      <label className="text-sm text-[#c2c6d6]">{label}</label>
      <div className="col-span-2">{children}</div>
    </div>
  );

  const input = "w-full bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[#3B82F6] outline-none";

  return (
    <AppShell>
      <main className="p-10 max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-[#8c909f] text-sm mt-1">Manage your profile, editor, and account preferences.</p>
          </div>
          <button onClick={save} className="btn-flashlight px-5 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563eb] text-white font-bold">
            {saved ? "Saved ✓" : "Save changes"}
          </button>
        </header>

        <Section title="Profile">
          <Field label="Display name"><input className={input} value={prefs.name} onChange={e => update("name", e.target.value)} /></Field>
          <Field label="Email"><input type="email" className={input} value={prefs.email} onChange={e => update("email", e.target.value)} /></Field>
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
            <input type="number" min={10} max={24} className={input} value={prefs.fontSize} onChange={e => update("fontSize", Number(e.target.value))} />
          </Field>
          <Field label="Tab size">
            <select className={input} value={prefs.tabSize} onChange={e => update("tabSize", Number(e.target.value))}>
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
