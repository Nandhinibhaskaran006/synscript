import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { AppShell } from "../components/AppShell";
import { useRequireAuth } from "../hooks/useRequireAuth";
import * as monaco from "monaco-editor";
import { getUserRooms } from "../lib/user-rooms";
import api from "../api/axios";

import { defineCustomTheme } from "../lib/monaco-theme";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Version History" }] }),
  component: HistoryPage,
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function HistoryPage() {
  const { user } = useRequireAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const diffContainerRef = useRef<HTMLDivElement | null>(null);
  const modelsRef = useRef<{ original: monaco.editor.ITextModel | null; modified: monaco.editor.ITextModel | null }>({ original: null, modified: null });

  useEffect(() => {
    defineCustomTheme(monaco);
    monaco.editor.setTheme("synscript-dark");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const activeRoomId =
      localStorage.getItem("syncscript_active_roomId") ||
      getUserRooms()[0]?.id ||
      null;
    setRoomId(activeRoomId);
    if (!activeRoomId) { setLoading(false); return; }
    async function loadHistory() {
      try {
        const res = await api.get(`/api/rooms/${activeRoomId}/history`);
        setHistory(res.data);
      } catch (err) {
        console.error("Failed to load version history", err);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [user]);

  // Initialize and clean up Diff Editor
  useEffect(() => {
    if (!diffContainerRef.current || history.length === 0) return;

    defineCustomTheme(monaco);
    monaco.editor.setTheme("synscript-dark");

    const diffEditor = monaco.editor.createDiffEditor(diffContainerRef.current, {
      enableSplitViewResizing: true,
      renderSideBySide: true,
      ignoreTrimWhitespace: false,
      originalEditable: false,
      readOnly: true,
      theme: "synscript-dark",
      automaticLayout: true,
      diffWordWrap: "on",
      renderOverviewRuler: true,
      renderIndicators: true,
      accessibilitySupport: "off",
    });
    diffEditorRef.current = diffEditor;

    return () => {
      diffEditor.setModel(null);
      diffEditor.dispose();
      diffEditorRef.current = null;
    };
  }, [history.length > 0]);

  // Update diff models when selected snapshot or history changes
  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor || history.length === 0) return;

    const current = history[selectedIndex];
    const previous = history[selectedIndex + 1];
    const lang = current?.language ?? previous?.language ?? "javascript";

    // Clean up previous models
    if (modelsRef.current.original && !modelsRef.current.original.isDisposed()) {
      modelsRef.current.original.dispose();
    }
    if (modelsRef.current.modified && !modelsRef.current.modified.isDisposed()) {
      modelsRef.current.modified.dispose();
    }

    const originalModel = monaco.editor.createModel(previous?.code ?? "", lang);
    const modifiedModel = monaco.editor.createModel(current?.code ?? "", lang);
    modelsRef.current = { original: originalModel, modified: modifiedModel };

    diffEditor.setModel({ original: originalModel, modified: modifiedModel });

    return () => {
      if (diffEditorRef.current) {
        diffEditorRef.current.setModel(null);
      }
      if (!originalModel.isDisposed()) originalModel.dispose();
      if (!modifiedModel.isDisposed()) modifiedModel.dispose();
      modelsRef.current = { original: null, modified: null };
    };
  }, [history, selectedIndex]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-screen items-center justify-center text-[#adc6ff]">
          <div className="text-center space-y-4">
            <span className="material-symbols-outlined text-4xl animate-spin">sync</span>
            <p className="font-mono text-sm">RETRIEVING SNAPSHOTS...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!roomId || history.length === 0) {
    return (
      <AppShell>
        <div className="flex h-screen items-center justify-center text-outline">
          <div className="text-center space-y-4 max-w-md p-6 rounded-xl border border-white/5 bg-[#0f1219]">
            <span className="material-symbols-outlined text-5xl text-[#adc6ff]">history</span>
            <h2 className="text-xl font-bold text-[#e1e2eb]">No snapshots available</h2>
            <p className="text-sm text-[#8c909f]">
              Enter a room, write some code, and click Save to record a named snapshot.
            </p>
            <Link
              to="/dashboard"
              className="inline-block mt-4 px-4 py-2 bg-[#3B82F6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-semibold transition-all"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const current = history[selectedIndex];
  const previous = history[selectedIndex + 1];
  const currentLabel = current?.label || `Snapshot #${history.length - selectedIndex}`;
  const currentAuthor = current?.savedBy?.username || "Unknown";
  const currentDate = current?.createdAt ? formatDate(current.createdAt) : "—";
  const previousLabel = previous
    ? (previous.label || `Snapshot #${history.length - (selectedIndex + 1)}`)
    : "No previous version";

  return (
    <AppShell>
      <div className="flex h-screen overflow-hidden">

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 bg-[#0e1117] border-r border-white/5 flex flex-col">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#8c909f] uppercase tracking-wider">Version History</span>
            <span className="text-[10px] font-mono bg-[#3B82F6]/15 text-[#3B82F6] px-2 py-0.5 rounded-full border border-[#3B82F6]/20">
              {history.length} snapshots
            </span>
          </div>
          {roomId && (
            <div className="px-4 py-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[13px] text-[#8c909f]">meeting_room</span>
                <span className="text-[11px] text-[#8c909f] font-mono truncate">{roomId}</span>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#ffffff10 transparent" }}>
            {history.map((item, idx) => {
              const isActive = idx === selectedIndex;
              const label = item.label || `Snapshot #${history.length - idx}`;
              const author = item.savedBy?.username || "Unknown";
              const dateStr = item.createdAt ? formatDate(item.createdAt) : "—";
              return (
                <button
                  key={item._id || idx}
                  onClick={() => setSelectedIndex(idx)}
                  className={[
                    "w-full text-left px-3 py-2 transition-all duration-150 border-l-2 group",
                    isActive
                      ? "bg-[#3B82F6]/8 border-l-[#3B82F6]"
                      : "border-l-transparent hover:bg-white/3 hover:border-l-white/20",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={["text-[12px] font-semibold leading-tight truncate", isActive ? "text-[#adc6ff]" : "text-[#c2c6d6] group-hover:text-[#e1e2eb]"].join(" ")}>
                      {label}
                    </span>
                    {idx === 0 && (
                      <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                        LATEST
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-[#8c909f] leading-none mb-0.5">
                    by <span className="text-[#c2c6d6]">{author}</span>
                  </div>
                  <div className="text-[9px] text-[#6b7280] font-mono leading-none">{dateStr}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main diff area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">

          {/* Header */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-white/5 bg-[#0f1219] flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-bold text-[#e1e2eb] truncate">{currentLabel}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[#8c909f]">by <span className="text-[#c2c6d6]">{currentAuthor}</span></span>
                <span className="text-[10px] text-[#6b7280]">·</span>
                <span className="text-[11px] text-[#6b7280] font-mono">{currentDate}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/30 border-l-2 border-emerald-500" />
                <span className="text-[#8c909f]">Added</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500/30 border-l-2 border-red-500" />
                <span className="text-[#8c909f]">Removed</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                disabled={selectedIndex === 0}
                title="Newer snapshot"
                className="p-1.5 rounded-lg text-[#8c909f] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">keyboard_arrow_up</span>
              </button>
              <button
                onClick={() => setSelectedIndex((i) => Math.min(history.length - 1, i + 1))}
                disabled={selectedIndex === history.length - 1}
                title="Older snapshot"
                className="p-1.5 rounded-lg text-[#8c909f] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">keyboard_arrow_down</span>
              </button>
            </div>
          </div>

          {/* Column labels */}
          <div className="flex flex-shrink-0 border-b border-white/5 bg-[#0e1117]">
            <div className="flex-1 px-4 py-1.5 text-[10px] font-mono text-[#8c909f] uppercase tracking-wider border-r border-white/5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400/60 inline-block flex-shrink-0" />
              <span className="truncate">{previousLabel}</span>
            </div>
            <div className="flex-1 px-4 py-1.5 text-[10px] font-mono text-[#8c909f] uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400/60 inline-block flex-shrink-0" />
              <span className="truncate">{currentLabel}</span>
              <span className="text-[#3B82F6] text-[9px] ml-auto flex-shrink-0">SELECTED</span>
            </div>
          </div>

          {/* Monaco Diff Editor */}
          <div className="flex-1 overflow-hidden">
            <div ref={diffContainerRef} className="w-full h-full" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
