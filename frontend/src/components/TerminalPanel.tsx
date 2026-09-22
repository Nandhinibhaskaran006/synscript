import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalTab {
  id: string;
  name: string;
}

interface TerminalPanelProps {
  roomId: string;
  roomName?: string;
  isVisible: boolean;
  onInput: (data: string, terminalId?: string) => void;
  onResize: (cols: number, rows: number, terminalId?: string) => void;
  onStart: (cols?: number, rows?: number, roomName?: string, terminalId?: string) => void;
  onClose?: (terminalId?: string) => void;
  onRegisterDataListener?: (listener: (payload: { terminalId?: string; data: string } | string) => void) => () => void;
}

interface TabSession {
  term: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  pendingBuffer: string[];
  disposable: { dispose: () => void };
}

const XTERM_THEME = {
  background: "#080a0f",
  foreground: "#e1e2eb",
  cursor: "#60a5fa",
  cursorAccent: "#080a0f",
  selectionBackground: "rgba(59, 130, 246, 0.35)",
  black: "#11141d",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#38bdf8",
  white: "#f3f4f6",
  brightBlack: "#4b5563",
  brightRed: "#fca5a5",
  brightGreen: "#6ee7b7",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#e9d5ff",
  brightCyan: "#7dd3fc",
  brightWhite: "#ffffff",
};

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  roomId,
  roomName,
  isVisible,
  onInput,
  onResize,
  onStart,
  onClose,
  onRegisterDataListener,
}) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: "1", name: "Terminal 1" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("1");
  const [statusMap, setStatusMap] = useState<Record<string, "connecting" | "connected" | "disconnected">>({
    "1": "connecting",
  });

  const nextTabNumRef = useRef(2);
  const tabSessionsRef = useRef<Map<string, TabSession>>(new Map());
  const tabsWrapperRef = useRef<HTMLDivElement>(null);
  const pendingBufferMapRef = useRef<Map<string, string[]>>(new Map());

  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const onStartRef = useRef(onStart);
  const onCloseRef = useRef(onClose);
  const roomNameRef = useRef(roomName);

  onInputRef.current = onInput;
  onResizeRef.current = onResize;
  onStartRef.current = onStart;
  onCloseRef.current = onClose;
  roomNameRef.current = roomName;

  // Initialize a single tab session
  const initTabSession = useCallback(
    (tabId: string, containerEl: HTMLDivElement) => {
      if (tabSessionsRef.current.has(tabId)) return;

      while (containerEl.firstChild) {
        containerEl.removeChild(containerEl.firstChild);
      }

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', monospace",
        lineHeight: 1.25,
        theme: XTERM_THEME,
        scrollback: 5000,
        scrollSensitivity: 1,
        fastScrollSensitivity: 5,
        smoothScrollDuration: 0,
        convertEol: true,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(containerEl);

      // Flush any queued data received before mount
      const queued = pendingBufferMapRef.current.get(tabId) || [];
      if (queued.length > 0) {
        for (const chunk of queued) {
          term.write(chunk);
        }
        pendingBufferMapRef.current.delete(tabId);
      }

      const dataDisposable = term.onData((data) => {
        onInputRef.current(data, tabId);
      });

      const session: TabSession = {
        term,
        fitAddon,
        container: containerEl,
        pendingBuffer: [],
        disposable: dataDisposable,
      };

      tabSessionsRef.current.set(tabId, session);

      requestAnimationFrame(() => {
        try {
          if (containerEl.clientWidth > 0 && containerEl.clientHeight > 0) {
            fitAddon.fit();
          }
          const cols = term.cols || 80;
          const rows = term.rows || 24;
          onStartRef.current(cols, rows, roomNameRef.current, tabId);
          onResizeRef.current(cols, rows, tabId);
          setStatusMap((prev) => ({ ...prev, [tabId]: "connected" }));
        } catch {
          onStartRef.current(80, 24, roomNameRef.current, tabId);
          setStatusMap((prev) => ({ ...prev, [tabId]: "connected" }));
        }
      });
    },
    []
  );

  // Direct socket data listener subscription with per-tab routing
  useEffect(() => {
    if (!onRegisterDataListener) return;

    const unregister = onRegisterDataListener((payload) => {
      let tabId = "1";
      let data = "";

      if (typeof payload === "string") {
        data = payload;
      } else if (payload && typeof payload === "object") {
        tabId = payload.terminalId ? String(payload.terminalId) : "1";
        data = payload.data || "";
      }

      if (typeof data !== "string") return;

      const session = tabSessionsRef.current.get(tabId);
      if (session && session.term) {
        session.term.write(data);
      } else {
        if (!pendingBufferMapRef.current.has(tabId)) {
          pendingBufferMapRef.current.set(tabId, []);
        }
        pendingBufferMapRef.current.get(tabId)!.push(data);
      }
    });

    return unregister;
  }, [onRegisterDataListener]);

  // Fit & Resize for active tab
  const handleFitActive = useCallback(() => {
    if (!isVisible) return;
    const session = tabSessionsRef.current.get(activeTabId);
    if (!session || !session.container) return;

    try {
      const { clientWidth, clientHeight } = session.container;
      if (clientWidth <= 0 || clientHeight <= 0) return;
      session.fitAddon.fit();
      const cols = session.term.cols;
      const rows = session.term.rows;
      if (cols > 0 && rows > 0) {
        onResizeRef.current(cols, rows, activeTabId);
      }
    } catch (err) {
      console.debug("xterm fit error:", err);
    }
  }, [isVisible, activeTabId]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      handleFitActive();
      const activeSession = tabSessionsRef.current.get(activeTabId);
      activeSession?.term?.focus();
    }, 50);

    const resizeObserver = new ResizeObserver(() => {
      handleFitActive();
    });

    if (tabsWrapperRef.current) {
      resizeObserver.observe(tabsWrapperRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [isVisible, activeTabId, handleFitActive]);

  // Create a new terminal tab
  const handleAddTab = () => {
    const newNum = nextTabNumRef.current;
    nextTabNumRef.current += 1;
    const newTabId = String(Date.now());
    const newTab: TerminalTab = {
      id: newTabId,
      name: `Terminal ${newNum}`,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTabId);
    setStatusMap((prev) => ({ ...prev, [newTabId]: "connecting" }));
  };

  // Close a specific terminal tab
  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();

    // Close session on backend
    onCloseRef.current?.(tabId);

    // Dispose local xterm instance
    const session = tabSessionsRef.current.get(tabId);
    if (session) {
      session.disposable.dispose();
      session.term.dispose();
      tabSessionsRef.current.delete(tabId);
    }
    pendingBufferMapRef.current.delete(tabId);

    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== tabId);
      // If we closed the active tab, switch to adjacent or fallback
      if (activeTabId === tabId) {
        if (nextTabs.length > 0) {
          const closedIndex = prev.findIndex((t) => t.id === tabId);
          const nextActive = nextTabs[Math.min(closedIndex, nextTabs.length - 1)].id;
          setActiveTabId(nextActive);
        } else {
          // Re-create default Terminal 1 if all tabs were closed
          const fallbackTab: TerminalTab = { id: "1", name: "Terminal 1" };
          nextTabNumRef.current = 2;
          setActiveTabId("1");
          setStatusMap({ "1": "connecting" });
          return [fallbackTab];
        }
      }
      return nextTabs;
    });

    setStatusMap((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
  };

  // Restart active terminal session
  const handleRestartActive = () => {
    const session = tabSessionsRef.current.get(activeTabId);
    if (!session) return;

    session.term.clear();
    session.term.writeln("\x1b[36m[SynScript] Restarting terminal session...\x1b[0m\r\n");
    setStatusMap((prev) => ({ ...prev, [activeTabId]: "connecting" }));

    const cols = session.term.cols || 80;
    const rows = session.term.rows || 24;
    onStart(cols, rows, roomNameRef.current, activeTabId);
    onResize(cols, rows, activeTabId);
    setStatusMap((prev) => ({ ...prev, [activeTabId]: "connected" }));
  };

  // Clear active terminal display
  const handleClearActive = () => {
    const session = tabSessionsRef.current.get(activeTabId);
    if (!session) return;
    session.term.clear();
    session.term.focus();
  };

  const activeStatus = statusMap[activeTabId] || "connecting";
  const activeTabObj = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-full w-full min-h-0 bg-[#080a0f] text-[#e1e2eb] select-text">
      {/* ── Multi-Tab Header Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 bg-[#0c0f17] border-b border-white/5 text-[11px] font-mono select-none flex-shrink-0 min-h-[32px] overflow-x-auto custom-scrollbar">
        {/* Left: Tab items + Add Button */}
        <div className="flex items-center gap-1 py-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTabId(tab.id);
                  requestAnimationFrame(() => {
                    const session = tabSessionsRef.current.get(tab.id);
                    session?.fitAddon?.fit();
                    session?.term?.focus();
                  });
                }}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition-all border ${
                  isActive
                    ? "bg-[#161a26] text-white border-blue-500/40 shadow-sm font-semibold"
                    : "bg-white/[0.02] text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/[0.06] border-transparent"
                }`}
                title={`Switch to ${tab.name}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    statusMap[tab.id] === "connected"
                      ? "bg-emerald-400"
                      : statusMap[tab.id] === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-rose-400"
                  }`}
                />
                <span className="text-[11px] truncate max-w-[120px]">{tab.name}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    className="opacity-0 group-hover:opacity-100 hover:bg-white/10 text-[#8c909f] hover:text-rose-400 rounded p-0.5 transition-all ml-0.5"
                    title={`Close ${tab.name}`}
                  >
                    <span className="material-symbols-outlined text-[13px] block">close</span>
                  </button>
                )}
              </div>
            );
          })}

          {/* New Tab "+" Button */}
          <button
            onClick={handleAddTab}
            className="flex items-center justify-center w-6 h-6 rounded bg-white/5 hover:bg-white/15 text-[#adc6ff] transition-all hover:scale-105 active:scale-95 ml-1 border border-white/5"
            title="Open New Terminal Tab (+)"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
          </button>
        </div>

        {/* Right: Active Session Status & Quick Actions */}
        <div className="flex items-center gap-2 pl-2">
          <div className="hidden sm:flex items-center gap-1.5 text-[#8c909f] text-[11px]">
            <span className="text-[#555b6e] truncate max-w-[150px]" title={`synscript:${roomName || "Workspace"}#`}>
              synscript:{roomName || "Workspace"}#
            </span>
            <span className="text-white/20">|</span>
            <span className="text-[10px] text-[#adc6ff]/80">
              {activeTabObj?.name || "Terminal"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleClearActive}
              title="Clear Current Terminal"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[#adc6ff] transition-colors text-[10px]"
            >
              <span className="material-symbols-outlined text-[13px]">clear_all</span>
              <span className="hidden md:inline">Clear</span>
            </button>
            <button
              onClick={handleRestartActive}
              title="Restart Shell Session"
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[#adc6ff] transition-colors text-[10px]"
            >
              <span className="material-symbols-outlined text-[13px]">refresh</span>
              <span className="hidden md:inline">Restart</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Persistent Canvas Containers for Each Tab ────────────────────── */}
      <div ref={tabsWrapperRef} className="flex-1 min-h-0 w-full h-full relative overflow-hidden bg-[#080a0f]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) {
                  initTabSession(tab.id, el);
                }
              }}
              className={`absolute inset-0 p-2 overflow-hidden cursor-text ${
                isActive ? "block pointer-events-auto z-10" : "hidden pointer-events-none z-0"
              }`}
              onClick={() => {
                const session = tabSessionsRef.current.get(tab.id);
                session?.term?.focus();
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
