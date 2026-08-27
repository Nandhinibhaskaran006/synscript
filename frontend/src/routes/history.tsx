import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RawScreen } from "../components/RawScreen";
import { AppShell } from "../components/AppShell";
import html from "../screens/body_6.html?raw";
import { getUserRooms } from "../lib/user-rooms";
import api from "../api/axios";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Version History" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const activeRoomId = localStorage.getItem("syncscript_active_roomId") || getUserRooms()[0]?.id || null;
    setRoomId(activeRoomId);

    if (!activeRoomId) {
      setLoading(false);
      return;
    }

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
  }, []);

  useEffect(() => {
    if (loading || history.length === 0) return;

    const historyListEl = document.getElementById("ss-history-list");
    const diffLeftEl = document.getElementById("ss-diff-left");
    const diffRightEl = document.getElementById("ss-diff-right");
    const filenameLeftEl = document.getElementById("ss-filename-left");
    const filenameRightEl = document.getElementById("ss-filename-right");
    const titleEl = document.getElementById("ss-history-title");

    if (titleEl && roomId) {
      titleEl.innerText = roomId;
    }

    const renderCodeLines = (codeText: string, isAdded = false, isRemoved = false) => {
      if (!codeText) return '<div class="text-outline text-xs p-4">No content available</div>';
      return codeText.split('\n').map((line, idx) => {
        let cls = "flex group hover:bg-surface-container-high/30";
        if (isAdded) cls = "flex diff-added group";
        if (isRemoved) cls = "flex diff-removed group";
        return `
          <div class="${cls}">
            <span class="w-10 text-right pr-4 text-outline-variant select-none">${idx + 1}</span>
            <span class="text-on-surface-variant">${escapeHtml(line)}</span>
          </div>
        `;
      }).join('');
    };

    const renderList = () => {
      if (!historyListEl) return;
      historyListEl.innerHTML = history.map((item, idx) => {
        const isActive = idx === selectedIndex;
        const dateStr = new Date(item.createdAt).toLocaleString();
        const author = item.savedBy?.username || "Unknown";
        const label = item.label || `Snapshot #${history.length - idx}`;
        return `
          <div data-index="${idx}" class="p-3 rounded-lg ${isActive ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-surface-variant/50'} group cursor-pointer transition-all duration-200">
            <div class="flex justify-between items-start mb-1">
              <span class="font-code-sm ${isActive ? 'text-primary' : 'text-on-surface-variant'} font-bold">${escapeHtml(label)}</span>
              ${idx === 0 ? '<span class="font-label-caps text-label-caps text-status-active">LATEST</span>' : ''}
            </div>
            <div class="flex items-center gap-2 mb-2">
              <div class="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">${escapeHtml(author[0].toUpperCase())}</div>
              <span class="text-body-sm text-on-surface">${escapeHtml(author)}</span>
              <span class="text-[10px] text-outline">${escapeHtml(dateStr)}</span>
            </div>
          </div>
        `;
      }).join('');
    };

    const updateDiff = () => {
      const current = history[selectedIndex];
      const previous = history[selectedIndex + 1];

      if (diffRightEl) {
        diffRightEl.innerHTML = renderCodeLines(current?.code || "", true, false);
      }
      if (diffLeftEl) {
        diffLeftEl.innerHTML = renderCodeLines(previous?.code || "", false, true);
      }

      if (filenameRightEl && current) {
        filenameRightEl.innerText = `snapshot-${history.length - selectedIndex}.txt`;
      }
      if (filenameLeftEl) {
        filenameLeftEl.innerText = previous ? `snapshot-${history.length - selectedIndex - 1}.txt` : "None";
      }
    };

    renderList();
    updateDiff();

    const handleItemClick = (e: Event) => {
      const target = (e.target as HTMLElement).closest("[data-index]");
      if (target) {
        const index = parseInt(target.getAttribute("data-index") || "0", 10);
        setSelectedIndex(index);
      }
    };

    historyListEl?.addEventListener("click", handleItemClick);
    return () => historyListEl?.removeEventListener("click", handleItemClick);
  }, [loading, history, selectedIndex, roomId]);

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
          <div className="text-center space-y-4 max-w-md p-6 glass-panel rounded-xl border border-white/5">
            <span className="material-symbols-outlined text-5xl text-[#adc6ff]">history</span>
            <h2 className="text-xl font-bold text-[#e1e2eb]">No snapshots available</h2>
            <p className="text-sm text-outline-variant">You need to create or enter a room, write some code, and click the Save button to record snapshots.</p>
            <Link to="/dashboard" className="inline-block mt-4 px-4 py-2 bg-[#3B82F6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-semibold transition-all">Go to Dashboard</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // Inject unique IDs and styles for sidebar snapshots lists & diff viewers
  const customized = html
    .replace('class="p-2 space-y-1"', 'id="ss-history-list" class="p-2 space-y-1"')
    .replace('class="font-headline-md text-body-base font-bold text-on-surface truncate"', 'id="ss-history-title" class="font-headline-md text-body-base font-bold text-on-surface truncate"')
    .replaceAll('auth.service.ts', 'code')
    .replace('Current Changes', 'Selected Snapshot')
    .replace(
      '<div class="font-code-base text-code-base leading-relaxed p-4 whitespace-pre">',
      '<div id="ss-diff-left" class="font-code-base text-code-base leading-relaxed p-4 whitespace-pre" style="white-space: pre-wrap; font-family: monospace;">'
    )
    .replace('<span class="font-code-sm text-outline">code</span>', '<span id="ss-filename-left" class="font-code-sm text-outline">code</span>')
    .replace(
      '<div class="font-code-base text-code-base leading-relaxed p-4 whitespace-pre">',
      '<div id="ss-diff-right" class="font-code-base text-code-base leading-relaxed p-4 whitespace-pre" style="white-space: pre-wrap; font-family: monospace;">'
    )
    .replace('<span class="font-code-sm text-outline">code</span>', '<span id="ss-filename-right" class="font-code-sm text-outline">code</span>');

  return (
    <AppShell>
      <RawScreen requireAuth html={customized} />
    </AppShell>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
