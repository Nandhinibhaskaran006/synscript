import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { QuickOpenModal } from "../components/QuickOpenModal";
import { addMemberToRoom } from "../lib/user-rooms";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { TerminalPanel } from "../components/TerminalPanel";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import { defineCustomTheme } from "../lib/monaco-theme";

// ── Types ──────────────────────────────────────────────────────────────────
type DiffLine = {
  type: "added" | "deleted" | "unchanged";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

type DiffHunk = {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};

type FileNode = {
  path: string;
  name: string;
  type: "file" | "folder";
  content?: string;
  isOpen?: boolean; // For folders
};
type FileSystem = Record<string, FileNode>;

type ExtensionItem = {
  id: string;
  name: string;
  publisher: string;
  desc: string;
  installed: boolean;
  enabled: boolean;
  icon: string;
  category: string;
  version: string;
};

// ── Extension → Language mapping ───────────────────────────────────────────
function getLanguageFromExtension(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    html: "html",
    css: "css",
    py: "python",
    java: "java",
    json: "json",
    md: "markdown",
  };
  return map[ext] ?? "plaintext";
}

// ── File-type icon mapping ─────────────────────────────────────────────────
function getFileIcon(filename: string): { icon: string; color: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, { icon: string; color: string }> = {
    js:   { icon: "javascript",  color: "text-yellow-400" },
    jsx:  { icon: "javascript",  color: "text-yellow-400" },
    ts:   { icon: "code",        color: "text-blue-400" },
    tsx:  { icon: "code",        color: "text-blue-400" },
    html: { icon: "html",        color: "text-orange-400" },
    css:  { icon: "palette",     color: "text-purple-400" },
    json: { icon: "data_object", color: "text-green-400" },
    py:   { icon: "terminal",    color: "text-blue-300" },
    java: { icon: "coffee",      color: "text-red-400" },
    md:   { icon: "article",     color: "text-gray-400" },
  };
  return map[ext] ?? { icon: "description", color: "text-cyan-400" };
}

// ── Language display label ──────────────────────────────────────────────────
function getLanguageLabel(langId: string): string {
  const labels: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    python: "Python",
    java: "Java",
    markdown: "Markdown",
    plaintext: "Plain Text",
  };
  return labels[langId] ?? langId.charAt(0).toUpperCase() + langId.slice(1);
}

// ── Helper: Highlight matching substring ───────────────────────────────────
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <span className="bg-amber-400/30 text-amber-200 font-semibold px-0.5 rounded">
        {match}
      </span>
      {after}
    </>
  );
}

// ── Helper: Lightweight Markdown Preview Viewer ────────────────────────────
function MarkdownViewer({ content }: { content: string }) {
  const lines = content.split("\n");
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-lg overflow-hidden border border-white/10 bg-[#0d1117]">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-white/5 border-b border-white/5 text-[10px] uppercase font-mono text-[#8c909f]">
                {codeBlockLang}
              </div>
            )}
            <pre className="p-3 text-xs font-mono text-[#e1e2eb] overflow-x-auto whitespace-pre">
              {codeBlockLines.join("\n")}
            </pre>
          </div>
        );
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = "";
      } else {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-xl font-bold text-white border-b border-white/10 pb-2 mb-3 mt-4">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-bold text-white border-b border-white/10 pb-1 mb-2 mt-4">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-semibold text-white mb-2 mt-3">{line.slice(4)}</h3>);
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-[#3B82F6] pl-3 py-1 my-2 text-xs text-[#adc6ff] bg-[#3B82F6]/5 rounded-r">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="text-xs text-[#c2c6d6] ml-4 list-disc my-0.5">
          {line.slice(2)}
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-xs text-[#c2c6d6] leading-relaxed my-1">
          {line}
        </p>
      );
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full custom-scrollbar text-[#e1e2eb] select-text">
      {elements}
    </div>
  );
}

// ── Monaco Editor options ──────────────────────────────────────────────────
const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
  fontLigatures: true,
  minimap: { enabled: true },
  lineNumbers: "on",
  wordWrap: "on",
  automaticLayout: true,
  scrollBeyondLastLine: false,
  // IntelliSense & autocomplete
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  parameterHints: { enabled: true },
  wordBasedSuggestions: "allDocuments",
  // Brackets & quotes
  autoClosingBrackets: "always",
  autoClosingQuotes: "always",
  bracketPairColorization: {
    enabled: false,
  },
  guides: {
    indentation: false,
    highlightActiveIndentation: false,
    bracketPairs: false,
  },
  matchBrackets: "never",
  occurrencesHighlight: "off",
  selectionHighlight: false,
  // Formatting
  formatOnPaste: true,
  formatOnType: true,
  // Code folding
  folding: true,
  foldingStrategy: "indentation",
  // Hover & errors
  hover: { enabled: "on" as const },
  renderValidationDecorations: "on",
  // Visual polish
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  smoothScrolling: true,
  renderLineHighlight: "none",
  padding: { top: 16 },
  // Hide the Monaco accessibility keyboard icon
  accessibilitySupport: "off",
};

// ── Default file set ────────────────────────────────────────────────────────
const DEFAULT_FILES: FileSystem = {};

const DEFAULT_EXTENSIONS: ExtensionItem[] = [
  {
    id: "prettier",
    name: "Prettier - Code Formatter",
    publisher: "Prettier",
    desc: "Opinionated code formatter with automatic multi-language formatting",
    installed: true,
    enabled: true,
    icon: "auto_fix_high",
    category: "Formatters",
    version: "v3.2.5",
  },
  {
    id: "javascript",
    name: "JavaScript & TypeScript",
    publisher: "SynScript",
    desc: "IntelliSense, ES6+ Snippets, Linting, and Type Checking",
    installed: true,
    enabled: true,
    icon: "javascript",
    category: "Programming Languages",
    version: "v2.4.0",
  },
  {
    id: "python",
    name: "Python",
    publisher: "Microsoft",
    desc: "IntelliSense, Syntax Highlighting, Formatting and Python Tooling",
    installed: false,
    enabled: false,
    icon: "terminal",
    category: "Programming Languages",
    version: "v2024.1.0",
  },
  {
    id: "java",
    name: "Language Support for Java",
    publisher: "Red Hat",
    desc: "Java class templates, Syntax, Diagnostics & Code Actions",
    installed: false,
    enabled: false,
    icon: "coffee",
    category: "Programming Languages",
    version: "v1.28.0",
  },
  {
    id: "markdown",
    name: "Markdown Preview Enhanced",
    publisher: "SynScript",
    desc: "Live Markdown rendering preview, outline, and syntax styling",
    installed: true,
    enabled: true,
    icon: "article",
    category: "Formatters",
    version: "v1.8.2",
  },
];

function computeLineDiff(oldText: string, newText: string): { hunks: DiffHunk[]; additions: number; deletions: number } {
  const oldLines = oldText ? oldText.split("\n") : [];
  const newLines = newText ? newText.split("\n") : [];
  const N = oldLines.length;
  const M = newLines.length;

  if (N === 0 && M === 0) return { hunks: [], additions: 0, deletions: 0 };
  if (N === 0) {
    return {
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: newLines.map((l, i) => ({ type: "added" as const, content: l, newLineNumber: i + 1 })),
        },
      ],
      additions: M,
      deletions: 0,
    };
  }
  if (M === 0) {
    return {
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: oldLines.map((l, i) => ({ type: "deleted" as const, content: l, oldLineNumber: i + 1 })),
        },
      ],
      additions: 0,
      deletions: N,
    };
  }

  // Optimize for large file content
  if (N * M > 250000) {
    const hunks: DiffHunk[] = [];
    const maxLines = Math.max(N, M);
    const diffLines: DiffLine[] = [];
    for (let k = 0; k < maxLines; k++) {
      if (k < N && k < M) {
        if (oldLines[k] !== newLines[k]) {
          diffLines.push({ type: "deleted", content: oldLines[k], oldLineNumber: k + 1 });
          diffLines.push({ type: "added", content: newLines[k], newLineNumber: k + 1 });
        }
      } else if (k < N) {
        diffLines.push({ type: "deleted", content: oldLines[k], oldLineNumber: k + 1 });
      } else if (k < M) {
        diffLines.push({ type: "added", content: newLines[k], newLineNumber: k + 1 });
      }
    }
    if (diffLines.length > 0) {
      hunks.push({ oldStart: 1, newStart: 1, lines: diffLines });
    }
    let adds = 0, dels = 0;
    diffLines.forEach((l) => { if (l.type === "added") adds++; if (l.type === "deleted") dels++; });
    return { hunks, additions: adds, deletions: dels };
  }

  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diffLines: DiffLine[] = [];
  let i = N, j = M;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffLines.unshift({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffLines.unshift({
        type: "added",
        content: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffLines.unshift({
        type: "deleted",
        content: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    }
  }

  let additions = 0;
  let deletions = 0;
  diffLines.forEach((l) => {
    if (l.type === "added") additions++;
    if (l.type === "deleted") deletions++;
  });

  const hunks: DiffHunk[] = [];
  let currentHunkLines: DiffLine[] = [];
  let inHunk = false;

  diffLines.forEach((line, idx) => {
    if (line.type !== "unchanged") {
      if (!inHunk) {
        inHunk = true;
        currentHunkLines = [];
        if (idx > 0 && diffLines[idx - 1].type === "unchanged") {
          currentHunkLines.push(diffLines[idx - 1]);
        }
      }
      currentHunkLines.push(line);
    } else if (inHunk) {
      currentHunkLines.push(line);
      const firstOld = currentHunkLines.find((l) => l.oldLineNumber)?.oldLineNumber || 1;
      const firstNew = currentHunkLines.find((l) => l.newLineNumber)?.newLineNumber || 1;
      hunks.push({
        oldStart: firstOld,
        newStart: firstNew,
        lines: currentHunkLines,
      });
      currentHunkLines = [];
      inHunk = false;
    }
  });

  if (inHunk && currentHunkLines.length > 0) {
    const firstOld = currentHunkLines.find((l) => l.oldLineNumber)?.oldLineNumber || 1;
    const firstNew = currentHunkLines.find((l) => l.newLineNumber)?.newLineNumber || 1;
    hunks.push({
      oldStart: firstOld,
      newStart: firstNew,
      lines: currentHunkLines,
    });
  }

  return { hunks, additions, deletions };
}

function filesFromApi(raw: any[]): FileSystem {
  const next: FileSystem = {};
  if (!Array.isArray(raw)) return next;
  for (const node of raw) {
    if (!node?.path) continue;
    next[node.path] = {
      path: node.path,
      name: node.name || String(node.path).split("/").pop(),
      type: node.type === "folder" ? "folder" : "file",
      content: node.content ?? "",
      isOpen: node.isOpen !== false,
    };
  }
  return next;
}

function serializeFiles(fs: FileSystem) {
  return Object.values(fs).map((node) => ({
    path: node.path,
    name: node.name,
    type: node.type,
    content: node.content ?? "",
    isOpen: node.isOpen !== false,
  }));
}

type ChatMsg = {
  _id?: string;
  roomId?: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: string;
  text: string;
  time: string;
  color: string;
  avatarBg: string;
  createdAt?: string;
};

// Deterministic color assignment based on userId / username hash
function getUserColor(userId: string) {
  const colors = [
    { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30", label: "text-cyan-500", labelText: "Cyan", hex: "#06b6d4" },
    { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", label: "text-green-500", labelText: "Green", hex: "#22c55e" },
    { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30", label: "text-violet-500", labelText: "Violet", hex: "#8b5cf6" },
    { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30", label: "text-amber-500", labelText: "Amber", hex: "#f59e0b" },
    { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/30", label: "text-rose-500", labelText: "Rose", hex: "#f43f5e" },
    { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30", label: "text-blue-500", labelText: "Blue", hex: "#3b82f6" },
    { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", label: "text-emerald-500", labelText: "Emerald", hex: "#10b981" },
    { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/30", label: "text-orange-500", labelText: "Orange", hex: "#f97316" },
  ];

  let hash = 0;
  const str = userId || "anonymous";
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function formatChatMessage(raw: any): ChatMsg {
  const senderObj = typeof raw.sender === "object" ? raw.sender : null;
  const senderId =
    senderObj?._id ||
    (typeof raw.sender === "string" ? raw.sender : "") ||
    raw.senderId ||
    raw.userId ||
    "";
  const senderUsername =
    raw.senderUsername ||
    raw.username ||
    raw.senderName ||
    senderObj?.username ||
    "Collaborator";
  const senderAvatar =
    raw.senderAvatar ||
    raw.avatar ||
    senderObj?.avatar ||
    "";

  const userColor = getUserColor(senderUsername || senderId);
  const createdAt = raw.createdAt ? new Date(raw.createdAt) : new Date();
  const time = createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return {
    _id: raw._id,
    roomId: raw.roomId,
    senderId: String(senderId),
    senderUsername,
    senderAvatar,
    text: raw.message || raw.text || "",
    time,
    color: userColor.text,
    avatarBg: userColor.bg,
    createdAt: raw.createdAt,
  };
}

export const Route = createFileRoute("/room/$roomId")({
  head: ({ params }) => ({
    meta: [{ title: `Room ${params.roomId} | SYNCSCRIPT` }],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ── Sidebar active tab state ─────────────────────────────────────────────
  const [activeSidebarTab, setActiveSidebarTab] = useState<"explorer" | "search" | "sourceControl" | "extensions" | "settings">("explorer");
  
  // ── Search Panel state ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchExpandedFiles, setSearchExpandedFiles] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Explorer File Search state ───────────────────────────────────────────
  const [explorerSearchQuery, setExplorerSearchQuery] = useState("");

  // ── Quick Open modal state ───────────────────────────────────────────────
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);

  // ── Extensions state with per-user storage ───────────────────────────────
  const userStorageKey = `syncscript_extensions_${user?._id || user?.id || "guest"}`;
  const [extensionsSearch, setExtensionsSearch] = useState("");
  const [extensionsActiveCategory, setExtensionsActiveCategory] = useState<"all" | "installed" | "enabled">("all");
  const [extensions, setExtensions] = useState<ExtensionItem[]>(() => {
    try {
      const saved = localStorage.getItem(userStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return DEFAULT_EXTENSIONS;
  });

  // Markdown Preview State
  const [isPreviewingMarkdown, setIsPreviewingMarkdown] = useState(false);

  // ── Active file system state & Open Tabs state ─────────────────────────────
  const [files, setFiles] = useState<FileSystem>(DEFAULT_FILES);
  const [sessionBaseline, setSessionBaseline] = useState<FileSystem>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [explorerSelection, setExplorerSelection] = useState<string | null>(null);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [remoteCursors, setRemoteCursors] = useState<Map<string, { lineNumber: number; column: number; color: string; filePath: string }>>(new Map());
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const remoteDecorationsRef = useRef<Map<string, editor.IEditorDecorationsCollection>>(new Map());
  const remoteLineDecorationsRef = useRef<Map<string, editor.IEditorDecorationsCollection>>(new Map());
  const remoteCaretWidgetsRef = useRef<Map<string, { widget: editor.IContentWidget; domNode: HTMLDivElement }>>(new Map());
  const cursorStyleElRef = useRef<HTMLStyleElement | null>(null);
  const savedCursorPosRef = useRef<{ lineNumber: number; column: number } | null>(null);
  const originalContents = useRef<Record<string, string>>({});
  const isRemoteUpdate = useRef(false);
  const activeFileRef = useRef<string | null>(null);
  const filesRef = useRef<FileSystem>(DEFAULT_FILES);
  const openTabsRef = useRef<string[]>([]);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceReadyRef = useRef(false);
  const cursorChangeListenerRef = useRef<IDisposable | null>(null);
  const localCursorLineRef = useRef<number>(0);
  const monacoModelsRef = useRef<Map<string, editor.ITextModel>>(new Map());

  // ── Save workspace state to localStorage ───────────────────────────────────
  const saveWorkspaceState = useCallback(
    (patch?: Partial<{
      openTabs: string[];
      activeFile: string | null;
      cursorPosition: { lineNumber: number; column: number } | null;
      files: FileSystem;
    }>) => {
      try {
        const key = `syncscript_workspace_${roomId}`;
        const existingRaw = localStorage.getItem(key);
        const existing = existingRaw ? JSON.parse(existingRaw) : {};
        const curFiles = patch?.files || filesRef.current;
        const curTabs = patch?.openTabs || openTabsRef.current;
        const curActive = patch?.activeFile !== undefined ? patch.activeFile : activeFileRef.current;
        const curCursor = patch?.cursorPosition !== undefined ? patch.cursorPosition : savedCursorPosRef.current;

        const expandedFolders: string[] = [];
        for (const [p, n] of Object.entries(curFiles)) {
          if (n.type === "folder" && n.isOpen) {
            expandedFolders.push(p);
          }
        }

        const nextState = {
          ...existing,
          roomId,
          openTabs: curTabs,
          activeFile: curActive,
          cursorPosition: curCursor,
          expandedFolders,
          files: curFiles,
          lastUpdated: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(nextState));
      } catch (_) {}
    },
    [roomId]
  );

  // Sync openTabs, activeFile, files to ref and localStorage
  useEffect(() => {
    openTabsRef.current = openTabs;
    activeFileRef.current = activeFile;
    if (workspaceReadyRef.current) {
      saveWorkspaceState({ openTabs, activeFile, files });
    }
  }, [openTabs, activeFile, files, saveWorkspaceState]);
  
  // ── Phase 6: Bottom Panel & Code Execution State ─────────────────────────
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] = useState<"output" | "terminal" | "debug">("output");
  const [bottomPanelHeight, setBottomPanelHeight] = useState(240);
  const [isPanelMaximized, setIsPanelMaximized] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionOutput, setExecutionOutput] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [executionStatus, setExecutionStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [executionDuration, setExecutionDuration] = useState<number | null>(null);
  const [executionTimestamp, setExecutionTimestamp] = useState<string | null>(null);
  const [executedLanguage, setExecutedLanguage] = useState<string | null>(null);
  const [executedFileName, setExecutedFileName] = useState<string | null>(null);

  // ── Collapsible Live Chat State & Messages ───────────────────────────────
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatOpen]);

  const handleIncomingChatMessage = useCallback((payload: any) => {
    if (!payload) return;
    const formatted = formatChatMessage(payload);
    setChatMessages((prev) => {
      if (prev.some((m) => m._id && formatted._id && m._id === formatted._id)) {
        return prev;
      }
      return [...prev, formatted];
    });
  }, []);

  // ── Invite Dropdown State ────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) return;
    setInviteSending(true);
    setInviteStatus(null);
    try {
      const res = await api.post("/api/invitations/send", {
        roomId,
        inviteeEmail: trimmed,
      });
      setInviteStatus({ type: "success", message: res.data.message || "Invitation sent!" });
      setInviteEmail("");
    } catch (err: any) {
      setInviteStatus({
        type: "error",
        message: err.response?.data?.message || "Failed to send invitation.",
      });
    } finally {
      setInviteSending(false);
    }
  };

  // ── Last seen files snapshot for Source Control badge tracking ───────────
  const [lastSeenFiles, setLastSeenFiles] = useState<Record<string, string>>({});
  const handleRunCodeRef = useRef<() => void>(() => {});
  const handleSaveFileRef = useRef<() => void>(() => {});

  const isDraggingPanelRef = useRef(false);
  const startDragYRef = useRef(0);
  const startHeightRef = useRef(240);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingPanelRef.current = true;
    startDragYRef.current = e.clientY;
    startHeightRef.current = bottomPanelHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingPanelRef.current) return;
      const deltaY = startDragYRef.current - moveEvent.clientY;
      const newHeight = Math.min(Math.max(startHeightRef.current + deltaY, 100), 650);
      setBottomPanelHeight(newHeight);
    };

    const onMouseUp = () => {
      isDraggingPanelRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleRunCode = useCallback(async () => {
    const currentActive = activeFileRef.current;
    if (!currentActive || isExecuting) return;

    const currentFiles = filesRef.current;
    const model = monacoModelsRef.current.get(currentActive);
    const code = model ? model.getValue() : (currentFiles[currentActive]?.content ?? "");
    const language = getLanguageFromExtension(currentActive);
    const fileName = currentFiles[currentActive]?.name || currentActive;

    setIsExecuting(true);
    setExecutionStatus("running");
    setExecutionOutput("");
    setExecutionError("");
    setExecutedLanguage(getLanguageLabel(language));
    setExecutedFileName(fileName);
    setExecutionTimestamp(new Date().toLocaleTimeString());
    setIsBottomPanelOpen(true);
    setBottomPanelTab("output");

    const startTime = performance.now();

    try {
      const response = await api.post("/api/execute", {
        language,
        code,
      });

      const elapsed = Math.round(performance.now() - startTime);
      setExecutionDuration(elapsed);

      if (response.data.success) {
        setExecutionStatus("success");
        setExecutionOutput(response.data.output || "(Process finished with no output)");
        setExecutionError(response.data.error || "");
      } else {
        setExecutionStatus("error");
        setExecutionOutput(response.data.output || "");
        setExecutionError(response.data.error || "Execution failed with an error.");
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setExecutionDuration(elapsed);
      setExecutionStatus("error");
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Failed to execute code";
      setExecutionError(errMsg);
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting]);

  handleRunCodeRef.current = handleRunCode;

  // ── File persistence handler ──────────────────────────────────────────────
  const persistFiles = useCallback(
    (nextFiles: FileSystem, immediate = false) => {
      if (!workspaceReadyRef.current) return;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const write = () => {
        api.put(`/api/rooms/${roomId}/files`, { files: serializeFiles(nextFiles) }).catch((err: any) => {
          console.error("Failed to persist room files", err);
        });
      };
      if (immediate) write();
      else {
        persistTimerRef.current = setTimeout(write, 400);
      }
    },
    [roomId],
  );

  // ── Save current active file (VS Code style Cmd+S / Ctrl+S) ───────────────
  const handleSaveFile = useCallback(() => {
    const currentActive = activeFileRef.current;
    if (!currentActive) return;

    const editor = editorRef.current;
    const currentVal = editor ? editor.getValue() : (filesRef.current[currentActive]?.content ?? "");

    const nextFiles: FileSystem = {
      ...filesRef.current,
      [currentActive]: {
        ...filesRef.current[currentActive],
        content: currentVal,
      },
    };

    filesRef.current = nextFiles;
    setFiles(nextFiles);

    // Mark active file as clean/saved
    originalContents.current[currentActive] = currentVal;
    setModifiedFiles((prev) => {
      const next = new Set(prev);
      next.delete(currentActive);
      return next;
    });

    // Immediately persist latest room files to backend without snapshot popup
    persistFiles(nextFiles, true);
  }, [persistFiles]);

  handleSaveFileRef.current = handleSaveFile;

  // ── Switch active file (auto-saves previous active file) ───────────────────
  const handleSelectFile = useCallback((path: string) => {
    const prevActive = activeFileRef.current;
    if (prevActive && prevActive !== path) {
      const editor = editorRef.current;
      const currentVal = editor ? editor.getValue() : (filesRef.current[prevActive]?.content ?? "");
      if (filesRef.current[prevActive]?.content !== currentVal) {
        const nextFiles: FileSystem = {
          ...filesRef.current,
          [prevActive]: { ...filesRef.current[prevActive], content: currentVal },
        };
        filesRef.current = nextFiles;
        setFiles(nextFiles);
        persistFiles(nextFiles, false);
      }
    }
    setActiveFile(path);
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setExplorerSelection(path);
  }, [persistFiles]);

  // ── Jump to specific location in Monaco editor ───────────────────────────
  const jumpToLocation = useCallback((filePath: string, lineNumber: number, column = 1) => {
    handleSelectFile(filePath);
    setTimeout(() => {
      const editor = editorRef.current;
      if (editor) {
        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber, column });
        editor.focus();
      }
    }, 60);
  }, [handleSelectFile]);

  // ── Prettier / Document formatting integration ───────────────────────────
  const handleFormatDocument = useCallback(() => {
    const prettierExt = extensions.find((e) => e.id === "prettier");
    if (!prettierExt?.installed || !prettierExt?.enabled) {
      alert("Prettier extension is disabled or not installed. Enable it in the Extensions panel to format documents.");
      return;
    }
    const editor = editorRef.current;
    if (!editor || !activeFile) return;

    const currentVal = editor.getValue();
    const ext = activeFile.split(".").pop()?.toLowerCase();

    // Trigger Monaco's native document format action
    const action = editor.getAction("editor.action.formatDocument");
    if (action) {
      action.run().catch(() => {});
    }

    // Direct JSON tidy formatter if applicable
    if (ext === "json") {
      try {
        const parsed = JSON.parse(currentVal);
        const formatted = JSON.stringify(parsed, null, 2);
        if (formatted !== currentVal) {
          editor.setValue(formatted);
        }
      } catch (_) {}
    }
  }, [extensions, activeFile]);

  // ── Extensions persistence helper ─────────────────────────────────────────
  const updateExtensions = useCallback((updater: (prev: ExtensionItem[]) => ExtensionItem[]) => {
    setExtensions((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(userStorageKey, JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  }, [userStorageKey]);

  // ── Source Control tracking & actions ─────────────────────────────────────
  const sourceControlChanges = useMemo(() => {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const [path, node] of Object.entries(files)) {
      if (node.type !== "file") continue;
      if (!sessionBaseline[path]) {
        added.push(path);
      } else if (node.content !== sessionBaseline[path]?.content) {
        modified.push(path);
      }
    }

    for (const [path, node] of Object.entries(sessionBaseline)) {
      if (node.type !== "file") continue;
      if (!files[path]) {
        deleted.push(path);
      }
    }

    return {
      added,
      modified,
      deleted,
      total: added.length + modified.length + deleted.length,
    };
  }, [files, sessionBaseline]);

  // ── Sync seen files snapshot when opening Source Control tab ─────────────
  useEffect(() => {
    if (activeSidebarTab === "sourceControl") {
      const snapshot: Record<string, string> = {};
      for (const [p, n] of Object.entries(files)) {
        if (n.type === "file") snapshot[p] = n.content ?? "";
      }
      setLastSeenFiles(snapshot);
    }
  }, [activeSidebarTab, files]);

  // ── Compute unseen changes count for the sidebar icon badge ───────────────
  const unseenChangesCount = useMemo(() => {
    if (activeSidebarTab === "sourceControl") return 0;

    let count = 0;
    for (const [path, node] of Object.entries(files)) {
      if (node.type !== "file") continue;
      const isChangedFromBaseline = !sessionBaseline[path] || node.content !== sessionBaseline[path]?.content;
      if (!isChangedFromBaseline) continue;

      const lastContent = lastSeenFiles[path];
      if (lastContent === undefined || lastContent !== node.content) {
        count++;
      }
    }

    for (const [path, node] of Object.entries(sessionBaseline)) {
      if (node.type !== "file") continue;
      if (!files[path]) {
        if (lastSeenFiles[path] !== undefined) {
          count++;
        }
      }
    }

    return count;
  }, [files, sessionBaseline, lastSeenFiles, activeSidebarTab]);

  const discardSingleChange = useCallback(
    (path: string, type: "added" | "modified" | "deleted") => {
      if (type === "modified") {
        const baselineContent = sessionBaseline[path]?.content ?? originalContents.current[path] ?? "";

        setFiles((prev) => {
          const existing = prev[path];
          if (!existing) return prev;
          const next = {
            ...prev,
            [path]: { ...existing, content: baselineContent },
          };
          filesRef.current = next;
          persistFiles(next, true);
          saveWorkspaceState({ files: next });
          return next;
        });

        originalContents.current[path] = baselineContent;
        setModifiedFiles((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        setLastSeenFiles((prev) => ({ ...prev, [path]: baselineContent }));

        // Update active Monaco model and editor
        const model = monacoModelsRef.current.get(path);
        if (model && !model.isDisposed()) {
          if (model.getValue() !== baselineContent) {
            model.setValue(baselineContent);
          }
        }
        if (editorRef.current && activeFileRef.current === path) {
          if (editorRef.current.getValue() !== baselineContent) {
            editorRef.current.setValue(baselineContent);
          }
        }
      } else if (type === "added") {
        const fileName = filesRef.current[path]?.name || path;
        if (!window.confirm(`Discarding will permanently delete newly added file "${fileName}". Are you sure?`)) {
          return;
        }
        setFiles((prev) => {
          const next = { ...prev };
          delete next[path];
          filesRef.current = next;
          persistFiles(next, true);
          saveWorkspaceState({ files: next });
          return next;
        });
        setOpenTabs((prev) => prev.filter((t) => t !== path));
        if (activeFileRef.current === path) {
          const remaining = openTabsRef.current.filter((t) => t !== path);
          setActiveFile(remaining[0] || null);
        }
      } else if (type === "deleted") {
        const baselineNode = sessionBaseline[path];
        if (!baselineNode) return;
        const restoredContent = baselineNode.content ?? "";
        setFiles((prev) => {
          const next = { ...prev, [path]: { ...baselineNode } };
          filesRef.current = next;
          persistFiles(next, true);
          saveWorkspaceState({ files: next });
          return next;
        });
        const model = monacoModelsRef.current.get(path);
        if (model && !model.isDisposed()) {
          model.setValue(restoredContent);
        }
      }
    },
    [sessionBaseline, persistFiles, saveWorkspaceState]
  );

  const discardAllChanges = useCallback(() => {
    if (sourceControlChanges.total === 0) return;
    if (!window.confirm("Are you sure you want to discard all uncommitted changes and restore workspace to the latest session snapshot?")) {
      return;
    }

    const restored: FileSystem = {};
    for (const [path, node] of Object.entries(sessionBaseline)) {
      restored[path] = { ...node };
    }

    setFiles(restored);
    filesRef.current = restored;
    persistFiles(restored, true);
    saveWorkspaceState({ files: restored });

    const snapshot: Record<string, string> = {};
    for (const [path, node] of Object.entries(restored)) {
      if (node.type === "file") {
        snapshot[path] = node.content ?? "";
        const model = monacoModelsRef.current.get(path);
        if (model && !model.isDisposed()) {
          model.setValue(node.content ?? "");
        }
      }
    }

    if (editorRef.current && activeFileRef.current && restored[activeFileRef.current]) {
      const activeContent = restored[activeFileRef.current].content ?? "";
      if (editorRef.current.getValue() !== activeContent) {
        editorRef.current.setValue(activeContent);
      }
    }

    setLastSeenFiles(snapshot);
    originalContents.current = snapshot;
    setModifiedFiles(new Set());
  }, [sourceControlChanges.total, sessionBaseline, persistFiles, saveWorkspaceState]);

  // ── Multi-file Real-time Search computation ───────────────────────────────
  type SearchMatch = {
    lineNumber: number;
    lineContent: string;
    matchStart: number;
    matchLength: number;
  };

  type FileSearchResult = {
    path: string;
    name: string;
    matches: SearchMatch[];
    fileNameMatch: boolean;
  };

  const searchResults: FileSearchResult[] = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return [];

    const results: FileSearchResult[] = [];

    let regex: RegExp | null = null;
    try {
      if (searchRegex) {
        regex = new RegExp(query, searchCaseSensitive ? "g" : "gi");
      } else {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = searchWholeWord ? `\\b${escaped}\\b` : escaped;
        regex = new RegExp(pattern, searchCaseSensitive ? "g" : "gi");
      }
    } catch (_) {
      return [];
    }

    for (const [path, node] of Object.entries(files)) {
      if (node.type !== "file") continue;

      const matches: SearchMatch[] = [];
      const content = node.content || "";
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        const lineNum = index + 1;
        let match: RegExpExecArray | null;
        regex!.lastIndex = 0;
        while ((match = regex!.exec(line)) !== null) {
          matches.push({
            lineNumber: lineNum,
            lineContent: line,
            matchStart: match.index,
            matchLength: match[0].length,
          });
          if (!regex!.global) break;
        }
      });

      const fileNameMatch = searchCaseSensitive
        ? node.name.includes(query)
        : node.name.toLowerCase().includes(query.toLowerCase());

      if (matches.length > 0 || fileNameMatch) {
        results.push({
          path,
          name: node.name,
          matches,
          fileNameMatch,
        });
      }
    }

    return results;
  }, [files, searchQuery, searchCaseSensitive, searchWholeWord, searchRegex]);

  const totalSearchMatches = useMemo(() => {
    return searchResults.reduce((acc, r) => acc + r.matches.length + (r.fileNameMatch ? 1 : 0), 0);
  }, [searchResults]);

  // ── Explorer Search / Filter computation ───────────────────────────────────
  const explorerFilteredPaths = useMemo(() => {
    const q = explorerSearchQuery.trim().toLowerCase();
    if (!q) return null;

    const matchedPaths = new Set<string>();

    for (const [path, node] of Object.entries(files)) {
      if (node.name.toLowerCase().includes(q) || path.toLowerCase().includes(q)) {
        matchedPaths.add(path);
        const parts = path.split("/");
        let currentPath = "";
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
          matchedPaths.add(currentPath);
        }
      }
    }

    return matchedPaths;
  }, [files, explorerSearchQuery]);

  // ── Global keyboard shortcuts (VS Code style) ────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl+P / Cmd+P -> Quick Open
      if (isCmdOrCtrl && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpenOpen(true);
        return;
      }

      // Ctrl+S / Cmd+S -> Save Active File (VS Code behavior)
      if (isCmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveFileRef.current?.();
        return;
      }

      // Ctrl+` / Cmd+` -> Toggle Terminal
      if (isCmdOrCtrl && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        setIsBottomPanelOpen((prev) => {
          if (!prev) setBottomPanelTab("terminal");
          return !prev;
        });
        return;
      }

      // Ctrl+Shift+F / Cmd+Shift+F -> Search panel
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setActiveSidebarTab("search");
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 50);
        return;
      }

      // Ctrl+Shift+E -> Explorer panel
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setActiveSidebarTab("explorer");
        return;
      }

      // Ctrl+Shift+G -> Source Control panel
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setActiveSidebarTab("sourceControl");
        return;
      }

      // Ctrl+Shift+X -> Extensions panel
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        setActiveSidebarTab("extensions");
        return;
      }

      // Shift+Alt+F -> Format Document
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleFormatDocument();
        return;
      }

      // Ctrl+Enter / Cmd+Enter / F5 -> Run Code
      if ((isCmdOrCtrl && e.key === "Enter") || e.key === "F5") {
        e.preventDefault();
        handleRunCodeRef.current();
        return;
      }

      // Ctrl+F / Cmd+F -> When active element is NOT inside Monaco editor, switch to Search panel
      if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === "f") {
        const activeEl = document.activeElement;
        const isInsideMonaco = activeEl?.closest(".monaco-editor");
        if (!isInsideMonaco) {
          e.preventDefault();
          setActiveSidebarTab("search");
          setTimeout(() => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
          }, 50);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFormatDocument]);

  // Derived values needed by useEffects - declared early to avoid temporal dead zone
  const currentContent = activeFile ? (files[activeFile]?.content ?? "") : "";
  const currentLanguage = activeFile ? getLanguageFromExtension(activeFile) : "plaintext";
  
  activeFileRef.current = activeFile;
  filesRef.current = files;

  // ── Handle closing tab (VS Code style: removes from openTabs, retains file in workspace) ──
  const handleCloseTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    if (modifiedFiles.has(path)) {
      const confirmClose = window.confirm(`File "${path}" has unsaved changes. Are you sure you want to close it?`);
      if (!confirmClose) return;
    }

    const nextOpenTabs = openTabs.filter((t) => t !== path);
    setOpenTabs(nextOpenTabs);

    if (activeFile === path) {
      if (nextOpenTabs.length > 0) {
        const closedIndex = openTabs.indexOf(path);
        const nextActiveIndex = Math.max(0, closedIndex - 1);
        setActiveFile(nextOpenTabs[nextActiveIndex]);
      } else {
        setActiveFile(null);
      }
    }
  };

  // ── Resolve collaborator names from the room document ────────────────────
  const rawMembers = room?.members ?? [];
  const roomCreator = room?.owner ?? user;
  
  // Create a map of userId to username for online status tracking
  const memberMap = new Map<string, string>();
  rawMembers.forEach((m: any) => {
    const userId = String(m._id || m.userId || m);
    const username = m.username || m;
    memberMap.set(userId, username);
  });
  
  // Add creator to map
  if (roomCreator?._id) {
    memberMap.set(String(roomCreator._id), roomCreator.username || user?.username || "Creator");
  }
  
  // Dynamic list starting with room creator, filtering out duplicates
  const collaboratorsList = Array.from(memberMap.entries()).map(([userId, username]) => {
    const color = getUserColor(userId);
    const isOnline = onlineUsers.has(userId);
    return {
      name: username,
      userId,
      initial: username ? username[0].toUpperCase() : "?",
      isOnline,
      ...color,
    };
  });

  // ── Load room from API ───────────────────────────────────────────────────
  useEffect(() => {
    workspaceReadyRef.current = false;
    async function loadRoom() {
      try {
        const [roomRes, historyRes, messagesRes] = await Promise.all([
          api.get(`/api/rooms/${roomId}`),
          api.get(`/api/rooms/${roomId}/history`).catch(() => ({ data: [] })),
          api.get(`/api/rooms/${roomId}/messages`).catch(() => ({ data: [] })),
        ]);

        setRoom(roomRes.data);
        localStorage.setItem("syncscript_active_roomId", roomId);

        if (Array.isArray(messagesRes.data)) {
          setChatMessages(messagesRes.data.map(formatChatMessage));
        }

        const apiFiles = filesFromApi(roomRes.data.files);

        // 1. Establish sessionBaseline from latest saved snapshot / session history
        let baseline: FileSystem = {};
        const historyList = Array.isArray(historyRes.data) ? historyRes.data : [];
        if (historyList.length > 0) {
          const latestSession = historyList[0];
          if (latestSession.files && Array.isArray(latestSession.files) && latestSession.files.length > 0) {
            baseline = filesFromApi(latestSession.files);
          } else if (latestSession.code) {
            baseline = {
              "main.js": {
                path: "main.js",
                name: "main.js",
                type: "file",
                content: latestSession.code,
              },
            };
          } else {
            baseline = { ...apiFiles };
          }
        } else {
          baseline = { ...apiFiles };
        }
        setSessionBaseline(baseline);

        // 2. Restore workspace persistence if present
        let initialFiles = { ...apiFiles };
        let initialTabs: string[] = [];
        let initialActive: string | null = null;
        let initialCursor: { lineNumber: number; column: number } | null = null;

        try {
          const savedWsRaw = localStorage.getItem(`syncscript_workspace_${roomId}`);
          if (savedWsRaw) {
            const parsedWs = JSON.parse(savedWsRaw);
            if (parsedWs && typeof parsedWs === "object") {
              if (Object.keys(initialFiles).length === 0 && parsedWs.files && typeof parsedWs.files === "object") {
                initialFiles = { ...parsedWs.files };
              }
              if (Array.isArray(parsedWs.expandedFolders)) {
                for (const folderPath of parsedWs.expandedFolders) {
                  if (initialFiles[folderPath]) {
                    initialFiles[folderPath] = { ...initialFiles[folderPath], isOpen: true };
                  }
                }
              }
              if (Array.isArray(parsedWs.openTabs) && parsedWs.openTabs.length > 0) {
                const validTabs = parsedWs.openTabs.filter((t: string) => initialFiles[t]);
                if (validTabs.length > 0) {
                  initialTabs = validTabs;
                }
              }
              if (parsedWs.activeFile && initialFiles[parsedWs.activeFile]) {
                initialActive = parsedWs.activeFile;
              }
              if (parsedWs.cursorPosition && typeof parsedWs.cursorPosition.lineNumber === "number") {
                initialCursor = parsedWs.cursorPosition;
              }
            }
          }
        } catch (_) {}

        if (initialTabs.length === 0) {
          const firstFile = Object.values(initialFiles).find((n) => n.type === "file")?.path ?? null;
          initialTabs = firstFile ? [firstFile] : [];
          if (!initialActive) initialActive = firstFile;
        } else if (!initialActive) {
          initialActive = initialTabs[0] || null;
        }

        setFiles(initialFiles);
        filesRef.current = initialFiles;
        setOpenTabs(initialTabs);
        openTabsRef.current = initialTabs;
        setActiveFile(initialActive);
        activeFileRef.current = initialActive;
        setExplorerSelection(initialActive);
        savedCursorPosRef.current = initialCursor;

        const originals: Record<string, string> = {};
        for (const node of Object.values(baseline)) {
          if (node.type === "file") originals[node.path] = node.content ?? "";
        }
        originalContents.current = originals;
        setLastSeenFiles(originals);
        workspaceReadyRef.current = true;
      } catch (err) {
        console.error("Failed to fetch room details", err);
      } finally {
        setLoading(false);
      }
    }
    loadRoom();
  }, [roomId]);

  // ── Auto-save flush on window beforeunload & unmount ─────────────────────
  useEffect(() => {
    const flushSave = () => {
      if (!workspaceReadyRef.current) return;
      const currentActive = activeFileRef.current;
      const currentFiles = { ...filesRef.current };
      if (currentActive && editorRef.current) {
        const val = editorRef.current.getValue();
        if (currentFiles[currentActive]) {
          currentFiles[currentActive] = { ...currentFiles[currentActive], content: val };
        }
      }
      try {
        const token = localStorage.getItem("token") || "";
        const payload = JSON.stringify({ files: serializeFiles(currentFiles) });
        fetch(`/api/rooms/${roomId}/files`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      } catch (_) {}
    };

    window.addEventListener("beforeunload", flushSave);
    return () => {
      window.removeEventListener("beforeunload", flushSave);
      flushSave();
    };
  }, [roomId]);

  // ── Monaco model management helpers ──────────────────────────────────
  // (declared before applyRemoteFileChange / editor effects use them)
  const getOrCreateMonacoModel = useCallback(
    (monacoInst: Monaco, filePath: string, content: string, language: string) => {
      const uri = monacoInst.Uri.parse(`file:///${filePath}`);
      let model = monacoInst.editor.getModel(uri);

      if (!model || model.isDisposed()) {
        model = monacoInst.editor.createModel(content, language, uri);
      } else {
        const currentLang = model.getLanguageId();
        if (currentLang !== language) {
          monacoInst.editor.setModelLanguage(model, language);
        }
        // If the model was initialized with empty string before file content loaded, update it
        if (model.getValue() === "" && content !== "") {
          model.setValue(content);
        }
      }

      monacoModelsRef.current.set(filePath, model);
      return model;
    },
    []
  );

  const attachModelToEditor = useCallback(
    (targetFile: string | null) => {
      const editor = editorRef.current;
      const monacoInst = monacoRef.current;
      if (!editor || !monacoInst) return;

      if (!targetFile) {
        editor.setModel(null);
        return;
      }

      const content = filesRef.current[targetFile]?.content ?? "";
      const language = getLanguageFromExtension(targetFile);
      const model = getOrCreateMonacoModel(monacoInst, targetFile, content, language);
      if (editor.getModel() !== model) {
        editor.setModel(model);
      }

      if (savedCursorPosRef.current) {
        try {
          const validated = model.validatePosition(savedCursorPosRef.current);
          editor.setPosition(validated);
          editor.revealPositionInCenter(validated);
        } catch (_) {}
      }
    },
    [getOrCreateMonacoModel]
  );

  const applyRemoteFileChange = useCallback((payload: { filePath: string; content: string }) => {
    const { filePath, content } = payload;
    if (!filePath) return;

    const monacoInst = monacoRef.current;
    const editorInst = editorRef.current;
    if (monacoInst) {
      const model = getOrCreateMonacoModel(
        monacoInst,
        filePath,
        content,
        getLanguageFromExtension(filePath),
      );
      if (model && !model.isDisposed() && model.getValue() !== content) {
        isRemoteUpdate.current = true;

        const isActiveModel = editorInst?.getModel() === model;
        const savedPosition = isActiveModel ? editorInst!.getPosition() : null;

        const editOperation: editor.IIdentifiedSingleEditOperation = {
          range: model.getFullModelRange(),
          text: content,
          forceMoveMarkers: true
        };
        model.pushEditOperations([], [editOperation], () => null);

        if (isActiveModel && savedPosition) {
          const validPosition = model.validatePosition(savedPosition);
          editorInst!.setPosition(validPosition);
        }

        isRemoteUpdate.current = false;
      }
    }

    const cachedModel = monacoModelsRef.current.get(filePath);
    const finalContent = (cachedModel && !cachedModel.isDisposed())
      ? cachedModel.getValue()
      : content;
    setFiles((prev) => {
      const existing = prev[filePath];
      if (!existing || existing.type !== "file") return prev;
      if (existing.content === finalContent) return prev;
      return { ...prev, [filePath]: { ...existing, content: finalContent } };
    });
  }, [getOrCreateMonacoModel]);

  const handleRemoteFileCreated = useCallback((payload: { file: { path: string; name: string; type: string; content?: string } }) => {
    const { file } = payload;
    if (!file?.path) return;
    setFiles(prev => ({
      ...prev,
      [file.path]: { path: file.path, name: file.name, type: file.type as "file" | "folder", content: file.content ?? "", isOpen: file.type === "folder" }
    }));
  }, []);

  const handleRemoteFileRenamed = useCallback((payload: { oldPath: string; newPath: string; newName: string }) => {
    const { oldPath, newPath, newName } = payload;
    if (!oldPath || !newPath) return;
    setFiles(prev => {
      const next = { ...prev };
      const node = next[oldPath];
      if (!node) return prev;
      delete next[oldPath];
      next[newPath] = { ...node, name: newName, path: newPath };
      return next;
    });
    if (activeFile === oldPath) {
      setActiveFile(newPath);
    }
  }, [activeFile]);

  const handleRemoteFileDeleted = useCallback((payload: { path: string }) => {
    const { path } = payload;
    if (!path) return;
    setFiles(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setOpenTabs(prev => prev.filter(t => t !== path));
    if (activeFile === path) {
      setActiveFile(null);
    }
  }, [activeFile]);

  const handleRemoteFolderCreated = useCallback((payload: { folder: { path: string; name: string; type: string } }) => {
    const { folder } = payload;
    if (!folder?.path) return;
    setFiles(prev => ({
      ...prev,
      [folder.path]: { path: folder.path, name: folder.name, type: "folder", isOpen: true }
    }));
  }, []);

  const handleRemoteFolderRenamed = useCallback((payload: { oldPath: string; newPath: string; newName: string }) => {
    const { oldPath, newPath, newName } = payload;
    if (!oldPath || !newPath) return;
    setFiles(prev => {
      const next = { ...prev };
      const prefix = oldPath + "/";
      for (const key of Object.keys(next)) {
        if (key === oldPath) {
          const node = next[key];
          delete next[key];
          next[newPath] = { ...node, name: newName, path: newPath };
        } else if (key.startsWith(prefix)) {
          const node = next[key];
          delete next[key];
          const updatedPath = newPath + "/" + key.slice(prefix.length);
          next[updatedPath] = { ...node, path: updatedPath };
        }
      }
      return next;
    });
    if (activeFile && activeFile.startsWith(oldPath + "/")) {
      setActiveFile(newPath + "/" + activeFile.slice(oldPath.length + 1));
    }
  }, [activeFile]);

  const handleRemoteFolderDeleted = useCallback((payload: { path: string }) => {
    const { path } = payload;
    if (!path) return;
    setFiles(prev => {
      const next = { ...prev };
      const prefix = path + "/";
      for (const key of Object.keys(next)) {
        if (key === path || key.startsWith(prefix)) {
          delete next[key];
        }
      }
      return next;
    });
    if (activeFile && (activeFile === path || activeFile.startsWith(path + "/"))) {
      setActiveFile(null);
    }
  }, [activeFile]);

  const handleUserJoined = useCallback((payload: { userId: string; username: string }) => {
    const { userId } = payload;
    if (!userId) return;
    const idStr = String(userId);
    setOnlineUsers(prev => {
      const next = new Set(prev);
      next.add(idStr);
      return next;
    });
  }, []);

  const handleUserLeft = useCallback((payload: { userId: string; username: string }) => {
    const { userId } = payload;
    if (!userId) return;
    const idStr = String(userId);
    setOnlineUsers(prev => {
      const next = new Set(prev);
      next.delete(idStr);
      return next;
    });
    // Remove cursor for this user
    setRemoteCursors(prev => {
      const next = new Map(prev);
      next.delete(idStr);
      return next;
    });
  }, []);

  const handleOnlineUsers = useCallback((users: { userId: string; username: string }[]) => {
    if (!Array.isArray(users)) return;
    const userIds = new Set(users.map(u => String(u.userId)).filter(Boolean));
    setOnlineUsers(userIds);
  }, []);

  const handleCursorUpdate = useCallback((payload: { userId: string; filePath: string; position: { lineNumber: number; column: number } }) => {
    const { userId, filePath, position } = payload;
    if (!userId || !position) return;
    // Don't show own cursor
    if (userId === user?._id) return;
    // Early return if cursor is for a different file - prevents unnecessary state updates and decoration activity
    if (filePath !== activeFileRef.current) {
      // Still store the cursor position for when/if the user switches to this file
      const color = getUserColor(userId);
      setRemoteCursors(prev => {
        const existing = prev.get(userId);
        if (existing &&
            existing.lineNumber === position.lineNumber &&
            existing.column === position.column &&
            existing.filePath === filePath) {
          return prev;
        }
        return new Map(prev).set(userId, { ...position, color: color.hex, filePath });
      });
      return;
    }
    const color = getUserColor(userId);
    setRemoteCursors(prev => {
      const existing = prev.get(userId);
      // Skip state update if nothing changed — prevents unnecessary re-renders and decoration flicker
      if (existing &&
          existing.lineNumber === position.lineNumber &&
          existing.column === position.column &&
          existing.filePath === filePath) {
        return prev;
      }
      return new Map(prev).set(userId, { ...position, color: color.hex, filePath });
    });
  }, [user?._id]);

  const handleWorkspaceFilesSync = useCallback((payload: any) => {
    const rawList = Array.isArray(payload) ? payload : payload?.files;
    if (!Array.isArray(rawList)) return;

    setFiles((prev) => {
      const next: FileSystem = {};
      const newPathSet = new Set<string>();

      for (const item of rawList) {
        if (!item || !item.path) continue;
        newPathSet.add(item.path);

        const existing = prev[item.path];
        const isOpen = item.type === "folder" ? (existing?.isOpen ?? true) : true;
        const content = typeof item.content === "string" ? item.content : (existing?.content ?? "");

        next[item.path] = {
          path: item.path,
          name: item.name || item.path.split("/").pop() || item.path,
          type: (item.type === "folder" ? "folder" : "file") as "file" | "folder",
          content,
          isOpen,
        };

        if (item.type !== "folder" && monacoModelsRef.current) {
          const model = monacoModelsRef.current.get(item.path);
          if (model && !model.isDisposed() && typeof item.content === "string" && model.getValue() !== item.content) {
            isRemoteUpdate.current = true;
            model.setValue(item.content);
            isRemoteUpdate.current = false;
          }
        }
      }

      // Cleanup Monaco models for deleted files
      if (monacoModelsRef.current) {
        for (const [filePath, model] of monacoModelsRef.current.entries()) {
          if (!newPathSet.has(filePath)) {
            if (!model.isDisposed()) {
              model.dispose();
            }
            monacoModelsRef.current.delete(filePath);
          }
        }
      }

      // Close tabs for deleted files
      setOpenTabs((prevTabs) => prevTabs.filter((tabPath) => newPathSet.has(tabPath)));

      // Update active file if current active file was deleted
      setActiveFile((currentActive) => {
        if (currentActive && !newPathSet.has(currentActive)) {
          const remainingTabs = openTabsRef.current.filter((tabPath) => newPathSet.has(tabPath));
          return remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1] : null;
        }
        return currentActive;
      });

      return next;
    });
  }, []);

  const terminalDataListenerRef = useRef<((payload: { terminalId?: string; data: string } | string) => void) | null>(null);
  const registerTerminalDataListener = useCallback((listener: (payload: { terminalId?: string; data: string } | string) => void) => {
    terminalDataListenerRef.current = listener;
    return () => {
      if (terminalDataListenerRef.current === listener) {
        terminalDataListenerRef.current = null;
      }
    };
  }, []);

  const { 
    emitFileChange, 
    emitFileCreated,
    emitFileRenamed,
    emitFileDeleted,
    emitFolderCreated,
    emitFolderRenamed,
    emitFolderDeleted,
    emitCursorMove,
    emitSendMessage,
    emitTerminalStart,
    emitTerminalInput,
    emitTerminalResize,
    emitTerminalClose,
    onlineCount 
  } = useRoomSocket({
    roomId,
    username: user?.username ?? "Anonymous",
    enabled: !loading && !!user,
    onFileChange: applyRemoteFileChange,
    onFileCreated: handleRemoteFileCreated,
    onFileRenamed: handleRemoteFileRenamed,
    onFileDeleted: handleRemoteFileDeleted,
    onFolderCreated: handleRemoteFolderCreated,
    onFolderRenamed: handleRemoteFolderRenamed,
    onFolderDeleted: handleRemoteFolderDeleted,
    onWorkspaceFilesSync: handleWorkspaceFilesSync,
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onOnlineUsers: handleOnlineUsers,
    onCursorUpdate: handleCursorUpdate,
    onChatMessage: handleIncomingChatMessage,
    onTerminalOutput: (payload) => {
      if (terminalDataListenerRef.current) {
        terminalDataListenerRef.current(payload);
      }
    },
    onError: (message) => {
      console.error("Room socket error:", message);
    },
  });

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    emitSendMessage(trimmed);
    setChatInput("");
  };

  // ── Explorer Actions ─────────────────────────────────────────────────────

  const createFile = () => {
    console.log("createFile called");
    const name = window.prompt("New File Name:");
    if (!name) return;
    
    let parentPath = "";
    if (explorerSelection) {
      const selNode = files[explorerSelection];
      if (selNode) {
        if (selNode.type === "folder") {
          parentPath = selNode.path;
        } else {
          parentPath = selNode.path.split("/").slice(0, -1).join("/");
        }
      }
    }
    
    const newPath = parentPath ? `${parentPath}/${name}` : name;
    if (files[newPath]) {
      alert("File already exists!");
      return;
    }
    
    const newFile = { path: newPath, name, type: "file" as const, content: "" };
    setFiles(prev => {
      const updated = { ...prev, [newPath]: newFile };
      persistFiles(updated);
      return updated;
    });
    setActiveFile(newPath);
    setOpenTabs(prev => prev.includes(newPath) ? prev : [...prev, newPath]);
    setExplorerSelection(newPath);
    
    // Emit Socket.io event
    emitFileCreated(newFile);
  };

  const createFolder = () => {
    console.log("createFolder called");
    const name = window.prompt("New Folder Name:");
    if (!name) return;
    
    let parentPath = "";
    if (explorerSelection) {
      const selNode = files[explorerSelection];
      if (selNode) {
        if (selNode.type === "folder") {
          parentPath = selNode.path;
        } else {
          parentPath = selNode.path.split("/").slice(0, -1).join("/");
        }
      }
    }
    
    const newPath = parentPath ? `${parentPath}/${name}` : name;
    if (files[newPath]) {
      alert("Folder already exists!");
      return;
    }
    
    const newFolder = { path: newPath, name, type: "folder" as const };
    setFiles(prev => {
      const updated = { ...prev, [newPath]: { path: newPath, name, type: "folder" as const, isOpen: true } };
      persistFiles(updated);
      return updated;
    });
    setExplorerSelection(newPath);
    
    // Emit Socket.io event
    emitFolderCreated(newFolder);
  };

  const renameFile = () => {
    console.log("renameFile called");
    if (!explorerSelection || files[explorerSelection]?.type !== "file") return;
    
    const newName = window.prompt("Rename File To:", files[explorerSelection].name);
    if (!newName || newName === files[explorerSelection].name) return;
    
    const oldPath = explorerSelection;
    const parentPath = oldPath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    
    if (files[newPath]) {
      alert("A file or folder with that name already exists!");
      return;
    }
    
    setFiles(prev => {
      const next = { ...prev };
      const node = next[oldPath];
      delete next[oldPath];
      next[newPath] = { ...node, name: newName, path: newPath };
      persistFiles(next);
      return next;
    });
    
    if (activeFile === oldPath) {
      setActiveFile(newPath);
    }
    setExplorerSelection(newPath);
    
    // Emit Socket.io event
    emitFileRenamed(oldPath, newPath, newName);
  };

  const renameFolder = () => {
    console.log("renameFolder called");
    if (!explorerSelection || files[explorerSelection]?.type !== "folder") return;
    
    const oldPath = explorerSelection;
    const newName = window.prompt("Rename Folder To:", files[oldPath].name);
    if (!newName || newName === files[oldPath].name) return;
    
    const parentPath = oldPath.split("/").slice(0, -1).join("/");
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    
    if (files[newPath]) {
      alert("A file or folder with that name already exists!");
      return;
    }
    
    setFiles(prev => {
      const next = { ...prev };
      const prefix = oldPath + "/";
      for (const key of Object.keys(next)) {
        if (key === oldPath) {
          const node = next[key];
          delete next[key];
          next[newPath] = { ...node, name: newName, path: newPath };
        } else if (key.startsWith(prefix)) {
          const node = next[key];
          delete next[key];
          const updatedPath = newPath + "/" + key.slice(prefix.length);
          next[updatedPath] = { ...node, path: updatedPath };
        }
      }
      persistFiles(next);
      return next;
    });
    
    if (activeFile && activeFile.startsWith(oldPath + "/")) {
      setActiveFile(newPath + "/" + activeFile.slice(oldPath.length + 1));
    }
    setExplorerSelection(newPath);
    
    // Emit Socket.io event
    emitFolderRenamed(oldPath, newPath, newName);
  };

  const deleteFile = () => {
    console.log("deleteFile called");
    if (!explorerSelection || files[explorerSelection]?.type !== "file") return;
    
    const oldPath = explorerSelection;
    if (!window.confirm(`Are you sure you want to delete ${files[oldPath].name}?`)) return;
    
    setFiles(prev => {
      const next = { ...prev };
      delete next[oldPath];
      persistFiles(next);
      return next;
    });

    setOpenTabs(prev => prev.filter(t => t !== oldPath));
    
    if (activeFile === oldPath) {
      const remainingOpenTabs = openTabs.filter(t => t !== oldPath);
      setActiveFile(remainingOpenTabs.length > 0 ? remainingOpenTabs[remainingOpenTabs.length - 1] : null);
    }
    setExplorerSelection(null);
    
    // Emit Socket.io event
    emitFileDeleted(oldPath);
  };

  const deleteFolder = () => {
    console.log("deleteFolder called");
    if (!explorerSelection || files[explorerSelection]?.type !== "folder") return;
    
    const oldPath = explorerSelection;
    if (!window.confirm(`Are you sure you want to delete the folder ${files[oldPath].name} and all its contents?`)) return;
    
    setFiles(prev => {
      const next = { ...prev };
      const prefix = oldPath + "/";
      for (const key of Object.keys(next)) {
        if (key === oldPath || key.startsWith(prefix)) {
          delete next[key];
        }
      }
      persistFiles(next);
      return next;
    });
    
    if (activeFile && (activeFile === oldPath || activeFile.startsWith(oldPath + "/"))) {
      const remainingFiles = Object.values(files).filter(f => f.type === "file" && !f.path.startsWith(oldPath + "/") && f.path !== oldPath);
      setActiveFile(remainingFiles.length > 0 ? remainingFiles[0].path : null);
    }
    setExplorerSelection(null);
    
    // Emit Socket.io event
    emitFolderDeleted(oldPath);
  };

  const collapseAll = () => {
    console.log("collapseAll called");
    setFiles(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].type === "folder") {
          next[key] = { ...next[key], isOpen: false };
        }
      }
      return next;
    });
  };

  const toggleFolder = (path: string) => {
    setFiles(prev => {
      const next = { ...prev };
      if (next[path] && next[path].type === "folder") {
        next[path] = { ...next[path], isOpen: !next[path].isOpen };
      }
      return next;
    });
  };

  const handleNodeClick = (path: string) => {
    setExplorerSelection(path);
    if (files[path]?.type === "file") {
      handleSelectFile(path);
    } else if (files[path]?.type === "folder") {
      toggleFolder(path);
    }
  };

  // ── Editor change — update only the active file's content ────────────────
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeFile) return;

      // Remote CODE_UPDATE already applied to state; ignore Monaco echo
      // Do NOT clear the flag here — applyRemoteFileChange clears it after setPosition
      if (isRemoteUpdate.current) {
        return;
      }

      // Read content directly from the editor's model instead of relying on the value parameter
      const newContent = editorRef.current?.getValue() ?? "";
      setFiles((prev) => {
        const next = {
          ...prev,
          [activeFile]: { ...prev[activeFile], content: newContent },
        };
        filesRef.current = next;
        persistFiles(next, false); // Debounced auto-save on typing
        return next;
      });
      // Track modified state
      const isModified = newContent !== (originalContents.current[activeFile] ?? "");
      setModifiedFiles((prev) => {
        const next = new Set(prev);
        if (isModified) next.add(activeFile);
        else next.delete(activeFile);
        return next;
      });

      if (!isRemoteUpdate.current) {
        emitFileChange(activeFile, newContent);
      }
    },
    [activeFile, emitFileChange, persistFiles],
  );

  // ── Monaco mount handler ─────────────────────────────────────────────────
  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;
      defineCustomTheme(monaco);
      monaco.editor.setTheme("synscript-dark");

      // Immediately attach model for the active file upon editor mount
      if (activeFileRef.current) {
        attachModelToEditor(activeFileRef.current);
      }

      editorInstance.focus();

      // Register Save File shortcut in Monaco (Cmd+S / Ctrl+S)
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSaveFileRef.current?.();
      });

      // Register Run Code shortcut in Monaco
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        handleRunCodeRef.current?.();
      });
      editorInstance.addCommand(monaco.KeyCode.F5, () => {
        handleRunCodeRef.current?.();
      });

      // Clean up previous cursor listener if exists
      if (cursorChangeListenerRef.current) {
        cursorChangeListenerRef.current.dispose();
        cursorChangeListenerRef.current = null;
      }

      // Track cursor position changes — skip during remote updates to preserve isolation
      cursorChangeListenerRef.current = editorInstance.onDidChangeCursorPosition((e) => {
        if (isRemoteUpdate.current) return;
        const position = e.position;
        if (position) {
          localCursorLineRef.current = position.lineNumber;
          savedCursorPosRef.current = { lineNumber: position.lineNumber, column: position.column };
          saveWorkspaceState({ cursorPosition: { lineNumber: position.lineNumber, column: position.column } });
          if (activeFileRef.current) {
            emitCursorMove(activeFileRef.current, { lineNumber: position.lineNumber, column: position.column });
          }
        }
      });
    },
    [emitCursorMove, attachModelToEditor, saveWorkspaceState]
  );

  // Sanitize userId for use as CSS class names (MongoDB IDs and JWT IDs may contain unsafe chars)
  const sanitizeClassId = useCallback((id: string) => {
    return 'u' + id.replace(/[^a-zA-Z0-9]/g, '_');
  }, []);

  // Track previous cursor positions to skip no-op decoration updates
  const prevCursorPositionsRef = useRef<Map<string, { lineNumber: number; column: number; filePath: string }>>(new Map());

  // Manage Monaco models on activeFile switch
  useEffect(() => {
    const editor = editorRef.current;
    const monacoInst = monacoRef.current;
    if (!editor || !monacoInst) return;

    // Clear all decorations and widgets when switching files
    try {
      for (const [, collection] of remoteDecorationsRef.current) {
        collection.clear();
      }
      for (const [, collection] of remoteLineDecorationsRef.current) {
        collection.clear();
      }
      for (const [, entry] of remoteCaretWidgetsRef.current) {
        editor.removeContentWidget(entry.widget);
      }
    } catch (_) {}
    remoteDecorationsRef.current.clear();
    remoteLineDecorationsRef.current.clear();
    remoteCaretWidgetsRef.current.clear();
    prevCursorPositionsRef.current.clear();

    // Attach model for active file
    attachModelToEditor(activeFile);
  }, [activeFile, attachModelToEditor]);

  // Update Monaco decoration-based remote cursors (visual only, no editor state modification)
  useEffect(() => {
    const editor = editorRef.current;
    const monacoInst = monacoRef.current;
    if (!editor || !monacoInst || !activeFile) return;
    const currentModel = editor.getModel();
    if (!currentModel || currentModel.isDisposed()) return;

    // Remove decorations and widgets for users who disconnected or are in a different file
    for (const [userId, collection] of remoteDecorationsRef.current) {
      const cursor = remoteCursors.get(userId);
      if (!cursor || cursor.filePath !== activeFile) {
        collection.clear();
        remoteDecorationsRef.current.delete(userId);
        prevCursorPositionsRef.current.delete(userId);
      }
    }
    for (const [userId, collection] of remoteLineDecorationsRef.current) {
      const cursor = remoteCursors.get(userId);
      if (!cursor || cursor.filePath !== activeFile) {
        collection.clear();
        remoteLineDecorationsRef.current.delete(userId);
      }
    }
    for (const [userId, entry] of remoteCaretWidgetsRef.current) {
      const cursor = remoteCursors.get(userId);
      if (!cursor || cursor.filePath !== activeFile) {
        try {
          editor.removeContentWidget(entry.widget);
        } catch (_) {}
        remoteCaretWidgetsRef.current.delete(userId);
      }
    }

    // Inject/update per-user CSS for cursor colors
    if (!cursorStyleElRef.current) {
      const style = document.createElement('style');
      style.id = 'remote-cursor-styles';
      document.head.appendChild(style);
      cursorStyleElRef.current = style;
    }
    let css = '';
    remoteCursors.forEach((cursor, userId) => {
      const safeId = sanitizeClassId(userId);
      css += `.rc-line-${safeId}{background:${cursor.color}0c !important;}`;
    });
    cursorStyleElRef.current.textContent = css;

    // Only show cursors for the currently active file
    remoteCursors.forEach((cursor, userId) => {
      if (cursor.filePath !== activeFile) return;
      const { lineNumber, column } = cursor;

      // Skip if position hasn't changed — prevents unnecessary clear+append flicker
      const prev = prevCursorPositionsRef.current.get(userId);
      if (prev && prev.lineNumber === lineNumber && prev.column === column && prev.filePath === cursor.filePath) {
        return;
      }
      prevCursorPositionsRef.current.set(userId, { lineNumber, column, filePath: cursor.filePath });

      // Create/update line highlight decoration (separate collection)
      let lineCollection = remoteLineDecorationsRef.current.get(userId);
      if (!lineCollection) {
        lineCollection = editor.createDecorationsCollection([]);
        remoteLineDecorationsRef.current.set(userId, lineCollection);
      }
      
      const safeId = sanitizeClassId(userId);

      // Update line highlight — skip if same line as local cursor to avoid visual collision
      if (lineNumber === localCursorLineRef.current) {
        lineCollection.clear();
      } else {
        lineCollection.set([
          {
            range: new monacoInst.Range(lineNumber, 1, lineNumber, Number.MAX_SAFE_INTEGER),
            options: { isWholeLine: true, className: `rc-line-${safeId}`, stickiness: 1 },
          },
        ]);
      }
      
      // Create or update caret as a content widget (absolute overlay, not in text layout flow)
      let entry = remoteCaretWidgetsRef.current.get(userId);
      if (!entry) {
        const domNode = document.createElement('div');
        domNode.style.cssText = `width:2px;height:1.4em;position:absolute;pointer-events:none;z-index:10;`;
        const widget: editor.IContentWidget = {
          getId: () => `rc-caret-${userId}`,
          getDomNode: () => domNode,
          getPosition: () => {
            return {
              position: { lineNumber, column },
              preference: [monacoInst.editor.ContentWidgetPositionPreference.EXACT],
            };
          },
        };
        try {
          editor.addContentWidget(widget);
        } catch (_) {}
        entry = { widget, domNode };
        remoteCaretWidgetsRef.current.set(userId, entry);
      }
      entry.domNode.style.backgroundColor = cursor.color;
      entry.widget.getPosition = () => {
        return {
          position: { lineNumber, column },
          preference: [monacoInst.editor.ContentWidgetPositionPreference.EXACT],
        };
      };
      try {
        editor.layoutContentWidget(entry.widget);
      } catch (_) {}
    });
  }, [remoteCursors, activeFile, sanitizeClassId]);

  // Cleanup cursor styles, listeners, widgets and models on unmount
  useEffect(() => {
    return () => {
      // Clean up cursor listener
      if (cursorChangeListenerRef.current) {
        cursorChangeListenerRef.current.dispose();
        cursorChangeListenerRef.current = null;
      }
      
      // Clean up cursor styles
      cursorStyleElRef.current?.remove();
      cursorStyleElRef.current = null;
      
      // Clean up all decorations and content widgets
      for (const [, collection] of remoteDecorationsRef.current) {
        collection.clear();
      }
      for (const [, collection] of remoteLineDecorationsRef.current) {
        collection.clear();
      }
      if (editorRef.current) {
        for (const [, entry] of remoteCaretWidgetsRef.current) {
          try {
            editorRef.current.removeContentWidget(entry.widget);
          } catch (_) {}
        }
      }
      remoteDecorationsRef.current.clear();
      remoteLineDecorationsRef.current.clear();
      remoteCaretWidgetsRef.current.clear();
      
      // Clean up all Monaco models
      for (const [, model] of monacoModelsRef.current) {
        if (!model.isDisposed()) {
          model.dispose();
        }
      }
      monacoModelsRef.current.clear();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  // ── Save modal state ────────────────────────────────────────────────────
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // ── Save — opens the name modal ──────────────────────────────────────────
  const handleSave = () => {
    if (!activeFile) return;
    setSnapshotName("");
    setSaveModalOpen(true);
  };

  // ── Confirm save — sends snapshot to backend ─────────────────────────────
  const confirmSave = async () => {
    if (!activeFile) return;
    const codeText = files[activeFile]?.content ?? "";
    setSaveLoading(true);
    try {
      await api.post(`/api/rooms/${roomId}/save`, {
        code: codeText,
        language: getLanguageFromExtension(activeFile),
        label: snapshotName.trim() || undefined,
        files: serializeFiles(files),
      });
      setSessionBaseline({ ...files });
      const snapshot: Record<string, string> = {};
      for (const [p, n] of Object.entries(files)) {
        if (n.type === "file") snapshot[p] = n.content ?? "";
      }
      setLastSeenFiles(snapshot);
      originalContents.current = snapshot;
      setModifiedFiles(new Set());
      saveWorkspaceState({ files });
      setSaveModalOpen(false);
      setSnapshotName("");
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to save session");
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppShell className="bg-[#0B0E14]">
        <div className="flex h-screen items-center justify-center text-[#adc6ff]">
          <div className="text-center space-y-4">
            <span className="material-symbols-outlined text-4xl animate-spin">
              sync
            </span>
            <p className="font-mono text-sm">LOADING ROOM ENVIRONMENT...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Derived editor values ────────────────────────────────────────────────
  const fileList = Object.values(files).filter(f => f.type === "file");
  const isCurrentModified = activeFile ? modifiedFiles.has(activeFile) : false;

  // Sort paths to render tree
  const sortedPaths = Object.keys(files).sort();
  // Filter visible paths (hide children of closed folders)
  const visiblePaths = sortedPaths.filter(path => {
    const parts = path.split("/");
    let currentPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      const folder = files[currentPath];
      if (folder && folder.type === "folder" && !folder.isOpen) {
        return false;
      }
    }
    return true;
  });

  // ── Render ───────────────────────────────────────────────────────────────

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AppShell className="bg-[#0B0E14]">
      <div className="relative flex flex-col h-screen overflow-hidden">
        {/* ── Dedicated Workspace Top Bar ───────────────────────────────── */}
        <header className="h-12 bg-[#0e1117] border-b border-white/5 px-4 flex flex-wrap items-center justify-between gap-3 shrink-0 z-30">
          {/* Left: Room Badge + Language */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-[#e1e2eb] shadow-sm">
              <span className="material-symbols-outlined text-[16px] text-[#3B82F6]">meeting_room</span>
              <span className="truncate max-w-[140px] sm:max-w-[200px] md:max-w-[260px]" title={room?.name || roomId}>
                {room?.name || roomId}
              </span>
            </div>
            {room?.language && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#3B82F6]/10 text-[#adc6ff] border border-[#3B82F6]/20 hidden sm:inline-block">
                {room.language}
              </span>
            )}
          </div>

          {/* Right: Actions (Run Button, Terminal Button, Online Count, Save, Invite, Chat Toggle, Back) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunCode}
              disabled={isExecuting}
              title="Run Code (Ctrl+Enter / Cmd+Enter / F5)"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                isExecuting
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-wait"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 cursor-pointer shadow-emerald-950/40"
              }`}
            >
              <span className={`material-symbols-outlined text-[16px] ${isExecuting ? "animate-spin" : ""}`}>
                {isExecuting ? "sync" : "play_arrow"}
              </span>
              <span>{isExecuting ? "Running..." : "Run"}</span>
            </button>

            <button
              onClick={() => {
                if (!isBottomPanelOpen) {
                  setIsBottomPanelOpen(true);
                  setBottomPanelTab("terminal");
                } else if (bottomPanelTab === "terminal") {
                  setIsBottomPanelOpen(false);
                } else {
                  setBottomPanelTab("terminal");
                }
              }}
              title={isBottomPanelOpen && bottomPanelTab === "terminal" ? "Hide Terminal Panel" : "Show Terminal Panel"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                isBottomPanelOpen && bottomPanelTab === "terminal"
                  ? "bg-[#3B82F6]/20 border-[#3B82F6]/40 text-[#adc6ff]"
                  : "bg-white/5 border-white/10 text-[#c2c6d6] hover:bg-white/10"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              <span className="hidden sm:inline">Terminal</span>
            </button>

            <span className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-[#adc6ff] hidden sm:inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Online: {onlineCount}
            </span>

            <button
              onClick={handleSave}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Save Snapshot"
            >
              <span className="material-symbols-outlined text-[16px] text-emerald-400">save</span>
              <span className="hidden sm:inline">Save Snapshot</span>
            </button>

            <div className="relative">
              <button
                onClick={() => { setInviteOpen((o) => !o); setInviteStatus(null); }}
                className="px-3 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563eb] text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Invite Collaborator"
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                <span className="hidden sm:inline">Invite</span>
              </button>
              {inviteOpen && (
                <form
                  onSubmit={handleSendInvite}
                  className="absolute top-12 right-0 w-72 p-4 rounded-xl bg-[#0F1219] border border-white/10 shadow-2xl space-y-2 z-50"
                >
                  <div className="text-sm font-semibold text-white">Invite collaborator</div>
                  <input
                    autoFocus
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-md px-3 py-2 text-sm focus:border-[#3B82F6] outline-none text-[#e1e2eb]"
                  />
                  {inviteStatus && (
                    <div className={`text-xs px-2 py-1.5 rounded-md ${
                      inviteStatus.type === "success"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {inviteStatus.message}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={inviteSending}
                    className="w-full px-3 py-2 rounded-md bg-[#3B82F6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2"
                  >
                    {inviteSending && <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>}
                    {inviteSending ? "Sending..." : "Send invite"}
                  </button>
                </form>
              )}
            </div>

            <button
              onClick={() => setIsChatOpen((o) => !o)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                isChatOpen
                  ? "bg-[#3B82F6]/20 border-[#3B82F6]/40 text-[#adc6ff]"
                  : "bg-white/5 border-white/10 text-[#c2c6d6] hover:bg-white/10"
              }`}
              title={isChatOpen ? "Collapse Live Chat" : "Open Live Chat"}
            >
              <span className="material-symbols-outlined text-[16px]">forum</span>
              <span className="hidden md:inline">Chat</span>
            </button>

            <button
              onClick={() => {
                localStorage.removeItem("syncscript_active_roomId");
                navigate({ to: "/rooms" });
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-[#c2c6d6] hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 transition-colors flex items-center gap-1"
              title="Leave Room & Return to My Rooms"
            >
              <span className="material-symbols-outlined text-[14px]">logout</span>
              <span className="hidden md:inline">Exit Room</span>
            </button>
          </div>
        </header>

        {/* ── Workspace Main Body ───────────────────────────────────────── */}
        <main className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Left Sidebar: Activity Bar + File Explorer ───────────────── */}
          <aside className="flex w-[280px] flex-shrink-0 bg-sidebar-bg border-r border-white/5">

            {/* Activity Bar (slim icon strip) */}
            <div className="w-12 flex flex-col items-center py-4 gap-4 border-r border-white/5 bg-[#0e1117]">
              <button 
                onClick={() => setActiveSidebarTab("explorer")}
                title="Explorer (Ctrl+Shift+E)"
                className={`w-full flex justify-center py-2.5 transition-all relative ${
                  activeSidebarTab === "explorer" 
                    ? "text-[#3B82F6] border-l-2 border-[#3B82F6] bg-white/5" 
                    : "text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">description</span>
              </button>
              <button 
                onClick={() => {
                  setActiveSidebarTab("search");
                  setTimeout(() => {
                    searchInputRef.current?.focus();
                    searchInputRef.current?.select();
                  }, 50);
                }}
                title="Search (Ctrl+Shift+F)"
                className={`w-full flex justify-center py-2.5 transition-all relative ${
                  activeSidebarTab === "search" 
                    ? "text-[#3B82F6] border-l-2 border-[#3B82F6] bg-white/5" 
                    : "text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">search</span>
              </button>
              <button 
                onClick={() => setActiveSidebarTab("sourceControl")}
                title="Source Control (Ctrl+Shift+G)"
                className={`w-full flex justify-center py-2.5 transition-all relative ${
                  activeSidebarTab === "sourceControl" 
                    ? "text-[#3B82F6] border-l-2 border-[#3B82F6] bg-white/5" 
                    : "text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">account_tree</span>
                {unseenChangesCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[#3B82F6] text-white text-[9px] font-bold flex items-center justify-center animate-in fade-in">
                    {unseenChangesCount}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveSidebarTab("extensions")}
                title="Extensions (Ctrl+Shift+X)"
                className={`w-full flex justify-center py-2.5 transition-all relative ${
                  activeSidebarTab === "extensions" 
                    ? "text-[#3B82F6] border-l-2 border-[#3B82F6] bg-white/5" 
                    : "text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">extension</span>
              </button>
              <div className="mt-auto flex flex-col gap-2 pb-2 w-full">
                <button 
                  onClick={() => setActiveSidebarTab("settings")}
                  title="Settings"
                  className={`w-full flex justify-center py-2.5 transition-all relative ${
                    activeSidebarTab === "settings" 
                      ? "text-[#3B82F6] border-l-2 border-[#3B82F6] bg-white/5" 
                      : "text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/5 border-l-2 border-transparent"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                </button>
              </div>
            </div>

            {/* Active Sidebar Tab Panels */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Explorer Panel */}
              {activeSidebarTab === "explorer" && (
                <>
                  <div className="px-4 py-3 flex justify-between items-center border-b border-white/5">
                    <span className="text-label-caps text-outline uppercase font-semibold">Explorer</span>
                    <div className="flex items-center gap-1">
                      <button onClick={createFile} className="text-outline hover:text-primary transition-colors p-1 flex items-center justify-center" title="New File">
                        <span className="material-symbols-outlined text-[16px]">note_add</span>
                      </button>
                      <button onClick={createFolder} className="text-outline hover:text-primary transition-colors p-1 flex items-center justify-center" title="New Folder">
                        <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                      </button>
                      <button onClick={explorerSelection && files[explorerSelection]?.type === 'file' ? renameFile : renameFolder} className={`transition-colors p-1 flex items-center justify-center ${explorerSelection ? 'text-outline hover:text-primary' : 'text-white/20'}`} title="Rename" disabled={!explorerSelection}>
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button onClick={explorerSelection && files[explorerSelection]?.type === 'file' ? deleteFile : deleteFolder} className={`transition-colors p-1 flex items-center justify-center ${explorerSelection ? 'text-outline hover:text-status-error' : 'text-white/20'}`} title="Delete" disabled={!explorerSelection}>
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                      <button onClick={collapseAll} className="text-outline hover:text-primary transition-colors p-1 flex items-center justify-center" title="Collapse All">
                        <span className="material-symbols-outlined text-[16px]">collapse_all</span>
                      </button>
                    </div>
                  </div>

                  {/* Feature 2: Explorer File Search Filter Box */}
                  <div className="px-3 py-2 border-b border-white/5 bg-[#0e1117]/60">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[14px]">search</span>
                      <input
                        type="text"
                        placeholder="Filter files in workspace..."
                        value={explorerSearchQuery}
                        onChange={(e) => setExplorerSearchQuery(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 rounded-md pl-7 pr-7 py-1 text-xs text-white placeholder-[#8c909f] focus:outline-none focus:border-[#3B82F6] transition-all font-mono"
                      />
                      {explorerSearchQuery && (
                        <button
                          onClick={() => setExplorerSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-white text-[12px]"
                          title="Clear filter"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* File list */}
                    <div className="mb-4">
                      {visiblePaths.map((path) => {
                        const node = files[path];
                        if (!node) return null;
                        const isActiveFile = activeFile === path;
                        const isSelected = explorerSelection === path;
                        const isModified = modifiedFiles.has(path);
                        const depth = path.split("/").length - 1;
                        const indent = depth * 16 + 16;
                        
                        if (node.type === "folder") {
                          return (
                            <button
                              key={path}
                              onClick={() => handleNodeClick(path)}
                              style={{ paddingLeft: `${indent}px` }}
                              className={[
                                "w-full flex items-center gap-2 pr-4 py-1.5 cursor-pointer transition-all text-left",
                                isSelected
                                  ? "bg-primary/20 text-on-surface border-l-2 border-primary font-medium"
                                  : "text-on-surface-variant hover:bg-surface-variant/50 border-l-2 border-transparent",
                              ].join(" ")}
                            >
                              <span className="material-symbols-outlined text-[16px] text-yellow-600">
                                {node.isOpen ? "folder_open" : "folder"}
                              </span>
                              <span className="text-body-sm font-medium flex-1 truncate">
                                <HighlightText text={node.name} query={explorerSearchQuery} />
                              </span>
                            </button>
                          );
                        }
                        
                        // File
                        const fileIcon = getFileIcon(node.name);
                        return (
                          <button
                            key={path}
                            onClick={() => handleNodeClick(path)}
                            style={{ paddingLeft: `${indent}px` }}
                            className={[
                              "w-full flex items-center gap-2 pr-4 py-1.5 cursor-pointer transition-all text-left",
                              isActiveFile
                                ? "bg-primary/15 text-primary border-l-2 border-primary font-medium"
                                : isSelected
                                ? "bg-primary/10 text-on-surface border-l-2 border-primary/50"
                                : "text-on-surface-variant hover:bg-surface-variant/50 border-l-2 border-transparent",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "material-symbols-outlined text-[16px]",
                                isActiveFile ? "text-primary" : fileIcon.color,
                              ].join(" ")}
                            >
                              {fileIcon.icon}
                            </span>
                            <span className="text-body-sm flex-1 truncate">
                              <HighlightText text={node.name} query={explorerSearchQuery} />
                            </span>
                            {isModified && (
                              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Modified" />
                            )}
                          </button>
                        );
                      })}
                      {visiblePaths.length === 0 && (
                        <div className="px-4 py-6 text-outline-variant text-xs text-center italic">
                          {explorerSearchQuery ? `No files matching "${explorerSearchQuery}"` : "Workspace is empty"}
                        </div>
                      )}
                    </div>

                    {/* Collaborators section */}
                    <div className="mt-8">
                      <div className="px-4 py-2 border-t border-white/5">
                        <span className="text-label-caps text-outline uppercase font-semibold">Collaborators</span>
                      </div>
                      <div className="space-y-1 mt-2">
                        {collaboratorsList.map((c) => (
                          <div
                            key={c.name}
                            className="flex items-center justify-between px-4 py-1.5 hover:bg-surface-variant/30 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="relative flex-shrink-0">
                                <div className={`w-6 h-6 rounded-full ${c.bg} flex items-center justify-center text-[10px] font-bold ${c.text} border ${c.border}`}>
                                  {c.initial}
                                </div>
                                {c.isOnline && (
                                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-status-active border border-sidebar-bg" />
                                )}
                              </div>
                              <span className="text-body-sm text-on-surface-variant truncate">{c.name}</span>
                            </div>
                            <span className={`text-[10px] ${c.label} font-mono flex-shrink-0 ml-2`}>{c.labelText}</span>
                          </div>
                        ))}
                        {collaboratorsList.length === 0 && (
                          <div className="px-4 py-3 text-[#8c909f] text-xs italic text-center">
                            No collaborators yet
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Feature 1: Workspace Search Panel */}
              {activeSidebarTab === "search" && (
                <div className="flex-1 flex flex-col overflow-hidden p-3">
                  <div className="text-label-caps text-outline uppercase font-semibold mb-2">Search</div>
                  
                  {/* Search Input Box + Filter Controls */}
                  <div className="relative mb-2">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">search</span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search files & code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#0B0E14] border border-white/10 rounded-lg pl-8 pr-20 py-2 text-xs text-white placeholder-[#8c909f] focus:outline-none focus:border-[#3B82F6] transition-all font-mono"
                    />
                    
                    {/* Toggle Buttons (Match Case, Whole Word, Regex) */}
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        onClick={() => setSearchCaseSensitive((v) => !v)}
                        title="Match Case (Alt+C)"
                        className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                          searchCaseSensitive ? "bg-[#3B82F6] text-white" : "text-[#8c909f] hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        Aa
                      </button>
                      <button
                        onClick={() => setSearchWholeWord((v) => !v)}
                        title="Match Whole Word (Alt+W)"
                        className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                          searchWholeWord ? "bg-[#3B82F6] text-white" : "text-[#8c909f] hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        \b
                      </button>
                      <button
                        onClick={() => setSearchRegex((v) => !v)}
                        title="Use Regular Expression (Alt+R)"
                        className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                          searchRegex ? "bg-[#3B82F6] text-white" : "text-[#8c909f] hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        .*
                      </button>
                    </div>
                  </div>

                  {/* Search Results Summary */}
                  {searchQuery.trim() !== "" && (
                    <div className="text-[11px] text-[#8c909f] mb-2 px-1 flex items-center justify-between">
                      <span>
                        {totalSearchMatches} {totalSearchMatches === 1 ? "result" : "results"} in {searchResults.length} {searchResults.length === 1 ? "file" : "files"}
                      </span>
                      {searchResults.length > 0 && (
                        <button
                          onClick={() => {
                            const allExpanded = searchResults.every((r) => searchExpandedFiles[r.path] !== false);
                            const nextState: Record<string, boolean> = {};
                            searchResults.forEach((r) => {
                              nextState[r.path] = !allExpanded;
                            });
                            setSearchExpandedFiles(nextState);
                          }}
                          className="text-[10px] text-[#3B82F6] hover:underline"
                        >
                          {searchResults.every((r) => searchExpandedFiles[r.path] !== false) ? "Collapse All" : "Expand All"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Search Results List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                    {searchQuery.trim() !== "" ? (
                      searchResults.length > 0 ? (
                        searchResults.map((result) => {
                          const icon = getFileIcon(result.name);
                          const isExpanded = searchExpandedFiles[result.path] !== false;
                          const totalItemMatches = result.matches.length + (result.fileNameMatch ? 1 : 0);

                          return (
                            <div key={result.path} className="rounded-lg bg-[#141820] border border-white/5 overflow-hidden">
                              {/* File Header */}
                              <div
                                onClick={() => {
                                  setSearchExpandedFiles((prev) => ({
                                    ...prev,
                                    [result.path]: !isExpanded,
                                  }));
                                }}
                                className="flex items-center justify-between p-2 hover:bg-[#1c222d] cursor-pointer transition-colors select-none"
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className="material-symbols-outlined text-[14px] text-[#8c909f]">
                                    {isExpanded ? "expand_more" : "chevron_right"}
                                  </span>
                                  <span className={`material-symbols-outlined text-[16px] ${icon.color}`}>
                                    {icon.icon}
                                  </span>
                                  <span className="text-xs font-semibold text-white truncate">{result.name}</span>
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#3B82F6]/20 text-[#adc6ff] shrink-0">
                                  {totalItemMatches}
                                </span>
                              </div>

                              {/* Matching Lines */}
                              {isExpanded && (
                                <div className="border-t border-white/5 bg-[#0d1017]/80 divide-y divide-white/5">
                                  {result.matches.map((m, idx) => (
                                    <div
                                      key={`${result.path}-${m.lineNumber}-${idx}`}
                                      onClick={() => jumpToLocation(result.path, m.lineNumber, m.matchStart + 1)}
                                      className="flex items-start gap-2 px-3 py-1.5 hover:bg-[#3B82F6]/10 cursor-pointer transition-colors group"
                                    >
                                      <span className="text-[10px] font-mono text-[#8c909f] group-hover:text-[#adc6ff] shrink-0 pt-0.5 w-6 text-right">
                                        {m.lineNumber}:
                                      </span>
                                      <p className="text-[11px] font-mono text-[#c2c6d6] truncate flex-1">
                                        <HighlightText text={m.lineContent} query={searchQuery} />
                                      </p>
                                    </div>
                                  ))}
                                  {result.matches.length === 0 && result.fileNameMatch && (
                                    <div
                                      onClick={() => jumpToLocation(result.path, 1, 1)}
                                      className="px-3 py-1.5 text-[11px] text-[#8c909f] hover:bg-[#3B82F6]/10 cursor-pointer italic"
                                    >
                                      File name matched
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-[#8c909f] text-center italic mt-6">
                          No matching files or code lines found
                        </div>
                      )
                    ) : (
                      <div className="text-xs text-[#8c909f] text-center italic mt-6">
                        Type keyword to search workspace files and code...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Feature 3: Source Control Panel */}
              {activeSidebarTab === "sourceControl" && (
                <div className="flex-1 flex flex-col overflow-hidden p-3">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-label-caps text-outline uppercase font-semibold">Source Control</span>
                    <span className="text-xs font-mono font-bold bg-[#3B82F6]/20 text-[#3B82F6] px-2 py-0.5 rounded">
                      {sourceControlChanges.total} Changes
                    </span>
                  </div>

                  {/* Actions Header Bar */}
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
                    <button
                      onClick={handleSave}
                      className="flex-1 py-1 px-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563eb] text-white text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-sm shadow-[#3B82F6]/20"
                      title="Commit changes as snapshot"
                    >
                      <span className="material-symbols-outlined text-[14px]">save</span>
                      <span>Save Snapshot</span>
                    </button>
                    {sourceControlChanges.total > 0 && (
                      <button
                        onClick={discardAllChanges}
                        className="py-1 px-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1 transition-all"
                        title="Discard All Workspace Changes"
                      >
                        <span className="material-symbols-outlined text-[14px]">undo</span>
                        <span>Discard All</span>
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                    {sourceControlChanges.total > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase font-mono tracking-wider text-[#8c909f] mb-1 px-1">
                          Changed Files ({sourceControlChanges.total})
                        </div>

                        {/* Modified files */}
                        {sourceControlChanges.modified.map((path) => {
                          const icon = getFileIcon(files[path]?.name || "");
                          const isExpanded = expandedDiffs[path] ?? true;
                          const oldContent = sessionBaseline[path]?.content || "";
                          const newContent = files[path]?.content || "";
                          const diff = computeLineDiff(oldContent, newContent);

                          return (
                            <div
                              key={path}
                              className="rounded-lg bg-[#141820] border border-white/5 overflow-hidden group transition-all"
                            >
                              <div className="flex items-center justify-between p-2 hover:bg-[#1c222d] transition-colors">
                                <div
                                  onClick={() => {
                                    handleNodeClick(path);
                                    setExpandedDiffs((prev) => ({ ...prev, [path]: !(prev[path] ?? true) }));
                                  }}
                                  className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer select-none"
                                >
                                  <span className="material-symbols-outlined text-[14px] text-[#8c909f]">
                                    {isExpanded ? "expand_more" : "chevron_right"}
                                  </span>
                                  <span className={`material-symbols-outlined text-[16px] ${icon.color}`}>{icon.icon}</span>
                                  <span className="text-xs text-white truncate font-mono">{files[path]?.name || path}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => discardSingleChange(path, "modified")}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-[#8c909f] hover:text-white transition-all"
                                    title="Discard Changes"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">undo</span>
                                  </button>
                                  <span className="text-[10px] font-bold font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                                    M
                                  </span>
                                </div>
                              </div>

                              {/* Diff Viewer for Modified File */}
                              {isExpanded && (
                                <div className="border-t border-white/5 bg-[#0d1017] p-2 space-y-2 text-[11px] font-mono overflow-x-auto select-text max-h-56 custom-scrollbar">
                                  {diff.hunks.length > 0 ? (
                                    diff.hunks.map((hunk, hIdx) => (
                                      <div key={hIdx} className="space-y-0.5 rounded overflow-hidden border border-white/5 bg-[#141820]/50">
                                        <div className="bg-white/5 text-[#8c909f] px-2 py-0.5 text-[10px] font-bold flex justify-between">
                                          <span>Line {hunk.newStart || hunk.oldStart}:</span>
                                          <span className="text-[9px] text-[#8c909f]/70">hunk #{hIdx + 1}</span>
                                        </div>
                                        {hunk.lines.map((dl, lIdx) => (
                                          <div
                                            key={lIdx}
                                            className={`px-2 py-0.5 flex gap-2 leading-relaxed ${
                                              dl.type === "added"
                                                ? "bg-emerald-500/15 text-emerald-300 font-medium"
                                                : dl.type === "deleted"
                                                ? "bg-rose-500/15 text-rose-300 font-medium"
                                                : "text-[#8c909f] opacity-70"
                                            }`}
                                          >
                                            <span className="select-none opacity-60 w-3 text-center">
                                              {dl.type === "added" ? "+" : dl.type === "deleted" ? "-" : " "}
                                            </span>
                                            <span className="whitespace-pre overflow-x-auto flex-1">{dl.content || " "}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-[10px] text-[#8c909f] italic px-1">Whitespace / encoding differences</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Added files */}
                        {sourceControlChanges.added.map((path) => {
                          const icon = getFileIcon(files[path]?.name || "");
                          const isExpanded = expandedDiffs[path] ?? false;
                          const content = files[path]?.content || "";
                          const lines = content.split("\n");

                          return (
                            <div
                              key={path}
                              className="rounded-lg bg-[#141820] border border-white/5 overflow-hidden group transition-all"
                            >
                              <div className="flex items-center justify-between p-2 hover:bg-[#1c222d] transition-colors">
                                <div
                                  onClick={() => {
                                    handleNodeClick(path);
                                    setExpandedDiffs((prev) => ({ ...prev, [path]: !(prev[path] ?? false) }));
                                  }}
                                  className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer select-none"
                                >
                                  <span className="material-symbols-outlined text-[14px] text-[#8c909f]">
                                    {isExpanded ? "expand_more" : "chevron_right"}
                                  </span>
                                  <span className={`material-symbols-outlined text-[16px] ${icon.color}`}>{icon.icon}</span>
                                  <span className="text-xs text-white truncate font-mono">{files[path]?.name || path}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => discardSingleChange(path, "added")}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-[#8c909f] hover:text-white transition-all"
                                    title="Delete Added File"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">undo</span>
                                  </button>
                                  <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded">
                                    A
                                  </span>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-white/5 bg-[#0d1017] p-2 space-y-0.5 text-[11px] font-mono overflow-x-auto select-text max-h-48 custom-scrollbar">
                                  <div className="bg-white/5 text-[#8c909f] px-2 py-0.5 text-[10px] font-bold">New File Preview</div>
                                  {lines.slice(0, 30).map((l, lIdx) => (
                                    <div key={lIdx} className="px-2 py-0.5 flex gap-2 leading-relaxed bg-emerald-500/15 text-emerald-300 font-medium">
                                      <span className="select-none opacity-60 w-3 text-center">+</span>
                                      <span className="whitespace-pre overflow-x-auto flex-1">{l || " "}</span>
                                    </div>
                                  ))}
                                  {lines.length > 30 && (
                                    <div className="text-[10px] text-[#8c909f] italic px-2 py-1">... +{lines.length - 30} more lines</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Deleted files */}
                        {sourceControlChanges.deleted.map((path) => {
                          const name = path.split("/").pop() || path;
                          const icon = getFileIcon(name);
                          const isExpanded = expandedDiffs[path] ?? false;
                          const oldContent = sessionBaseline[path]?.content || "";
                          const lines = oldContent.split("\n");

                          return (
                            <div
                              key={path}
                              className="rounded-lg bg-[#141820]/60 border border-white/5 overflow-hidden group transition-all opacity-80"
                            >
                              <div className="flex items-center justify-between p-2 hover:bg-[#1c222d] transition-colors">
                                <div
                                  onClick={() => setExpandedDiffs((prev) => ({ ...prev, [path]: !(prev[path] ?? false) }))}
                                  className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer select-none line-through text-[#8c909f]"
                                >
                                  <span className="material-symbols-outlined text-[14px] text-[#8c909f]">
                                    {isExpanded ? "expand_more" : "chevron_right"}
                                  </span>
                                  <span className={`material-symbols-outlined text-[16px] ${icon.color}`}>{icon.icon}</span>
                                  <span className="text-xs truncate font-mono">{name}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => discardSingleChange(path, "deleted")}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-[#8c909f] hover:text-white transition-all"
                                    title="Restore Deleted File"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">undo</span>
                                  </button>
                                  <span className="text-[10px] font-bold font-mono text-rose-400 bg-rose-400/10 border border-rose-400/20 px-1.5 py-0.5 rounded">
                                    D
                                  </span>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-white/5 bg-[#0d1017] p-2 space-y-0.5 text-[11px] font-mono overflow-x-auto select-text max-h-48 custom-scrollbar">
                                  <div className="bg-white/5 text-[#8c909f] px-2 py-0.5 text-[10px] font-bold">Deleted File Content</div>
                                  {lines.slice(0, 30).map((l, lIdx) => (
                                    <div key={lIdx} className="px-2 py-0.5 flex gap-2 leading-relaxed bg-rose-500/15 text-rose-300 font-medium">
                                      <span className="select-none opacity-60 w-3 text-center">-</span>
                                      <span className="whitespace-pre overflow-x-auto flex-1">{l || " "}</span>
                                    </div>
                                  ))}
                                  {lines.length > 30 && (
                                    <div className="text-[10px] text-[#8c909f] italic px-2 py-1">... -{lines.length - 30} more lines</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-[#8c909f] text-center italic mt-8">
                        No uncommitted changes in workspace session
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Feature 4: Extensions Panel */}
              {activeSidebarTab === "extensions" && (
                <div className="flex-1 flex flex-col overflow-hidden p-3">
                  <div className="text-label-caps text-outline uppercase font-semibold mb-2">Extensions</div>
                  
                  {/* Search marketplace */}
                  <div className="relative mb-2">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">search</span>
                    <input
                      type="text"
                      placeholder="Search Extensions in Marketplace..."
                      value={extensionsSearch}
                      onChange={(e) => setExtensionsSearch(e.target.value)}
                      className="w-full bg-[#0B0E14] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#8c909f] focus:outline-none focus:border-[#3B82F6] transition-all font-mono"
                    />
                  </div>

                  {/* Filter Pills: All / Installed / Enabled */}
                  <div className="flex gap-1 mb-3 pb-2 border-b border-white/5">
                    {(["all", "installed", "enabled"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setExtensionsActiveCategory(cat)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold capitalize transition-all ${
                          extensionsActiveCategory === cat
                            ? "bg-[#3B82F6] text-white"
                            : "bg-white/5 text-[#8c909f] hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Extension list */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                    {extensions
                      .filter((e) => {
                        const matchesSearch =
                          e.name.toLowerCase().includes(extensionsSearch.toLowerCase()) ||
                          e.publisher.toLowerCase().includes(extensionsSearch.toLowerCase()) ||
                          e.desc.toLowerCase().includes(extensionsSearch.toLowerCase());
                        if (!matchesSearch) return false;
                        if (extensionsActiveCategory === "installed") return e.installed;
                        if (extensionsActiveCategory === "enabled") return e.installed && e.enabled;
                        return true;
                      })
                      .map((ext) => (
                        <div
                          key={ext.id}
                          className="p-3 rounded-xl bg-[#141820] border border-white/5 flex flex-col gap-2.5 hover:border-white/10 transition-all overflow-hidden"
                        >
                          {/* Header: Icon + Name + Version */}
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 text-[#3B82F6] flex items-center justify-center shrink-0 border border-[#3B82F6]/20 mt-0.5">
                              <span className="material-symbols-outlined text-[18px]">{ext.icon}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
                                <h4 className="text-xs font-bold text-white leading-snug break-words">{ext.name}</h4>
                                <span className="text-[9px] font-mono text-[#8c909f] bg-white/5 px-1.5 py-0.5 rounded border border-white/5 shrink-0">
                                  {ext.version}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-[#8c909f]">{ext.publisher}</span>
                                <span className="text-[9px] text-[#3B82F6] font-mono bg-[#3B82F6]/10 px-1.5 py-0.5 rounded border border-[#3B82F6]/20">
                                  {ext.category}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Description with proper text wrapping */}
                          <p className="text-[11px] text-[#c2c6d6] leading-relaxed break-words whitespace-normal">
                            {ext.desc}
                          </p>

                          {/* Action Toolbar - guaranteed to stay inside card */}
                          <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                            {ext.installed ? (
                              <div className="flex items-center gap-2 w-full">
                                <button
                                  onClick={() =>
                                    updateExtensions((prev) =>
                                      prev.map((e) => (e.id === ext.id ? { ...e, enabled: !e.enabled } : e))
                                    )
                                  }
                                  className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all text-center border ${
                                    ext.enabled
                                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                                      : "bg-gray-500/15 text-gray-400 border-gray-500/30 hover:bg-gray-500/25"
                                  }`}
                                >
                                  {ext.enabled ? "Enabled" : "Disabled"}
                                </button>
                                <button
                                  onClick={() =>
                                    updateExtensions((prev) =>
                                      prev.map((e) => (e.id === ext.id ? { ...e, installed: false, enabled: false } : e))
                                    )
                                  }
                                  className="flex-1 py-1 px-2 rounded-lg text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-all text-center"
                                >
                                  Uninstall
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() =>
                                  updateExtensions((prev) =>
                                    prev.map((e) => (e.id === ext.id ? { ...e, installed: true, enabled: true } : e))
                                  )
                                }
                                className="w-full py-1.5 px-3 rounded-lg text-xs font-bold bg-[#3B82F6] hover:bg-[#2563eb] text-white transition-all shadow-md shadow-[#3B82F6]/20 flex items-center justify-center gap-1.5"
                              >
                                <span className="material-symbols-outlined text-[14px]">download</span>
                                <span>Install Extension</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Settings Panel */}
              {activeSidebarTab === "settings" && (
                <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
                  <div className="text-label-caps text-outline uppercase font-semibold mb-4">Workspace Settings</div>
                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="text-white font-medium block mb-1">Editor Font Size</label>
                      <input type="number" defaultValue={14} className="w-full bg-[#0B0E14] border border-white/10 rounded px-3 py-1.5 text-white" />
                    </div>
                    <div>
                      <label className="text-white font-medium block mb-1">Tab Size</label>
                      <input type="number" defaultValue={2} className="w-full bg-[#0B0E14] border border-white/10 rounded px-3 py-1.5 text-white" />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-white font-medium">Auto Save</span>
                      <input type="checkbox" defaultChecked className="rounded accent-[#3B82F6]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── Main Editor Section ────────────────────────────────────────── */}
          <section className="flex-1 flex flex-col min-w-0 bg-editor-bg">

            {/* Tab bar — open tabs + Extensions action toolbar */}
            <div className="flex items-center justify-between bg-surface-container-low h-9 border-b border-white/5 flex-shrink-0">
              {/* File tabs */}
              <div className="flex h-full overflow-x-auto flex-1 custom-scrollbar">
                {openTabs.map((path) => {
                  const file = files[path];
                  if (!file) return null;
                  const isActive = activeFile === path;
                  const tabIcon = getFileIcon(file.name);
                  const isModified = modifiedFiles.has(path);
                  return (
                    <div
                      key={path}
                      onClick={() => handleNodeClick(path)}
                      className={[
                        "group flex items-center px-3 gap-2 h-full cursor-pointer transition-colors border-r border-white/5 flex-shrink-0 select-none",
                        isActive
                          ? "bg-editor-bg border-t-2 border-primary text-on-surface"
                          : "hover:bg-surface-container text-outline hover:text-on-surface-variant",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "material-symbols-outlined text-[14px]",
                          isActive ? tabIcon.color : "text-outline",
                        ].join(" ")}
                      >
                        {tabIcon.icon}
                      </span>
                      <span className="text-body-sm">{file.name}</span>
                      {isModified && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 group-hover:hidden" title="Unsaved changes" />
                      )}
                      <button
                        onClick={(e) => handleCloseTab(e, path)}
                        title="Close Tab"
                        className={`p-0.5 rounded hover:bg-white/10 text-outline hover:text-white transition-colors ${
                          isModified ? "group-hover:inline-flex hidden" : "opacity-0 group-hover:opacity-100"
                        } ${isActive ? "opacity-100" : ""}`}
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  );
                })}
                {openTabs.length === 0 && (
                  <div className="flex items-center px-4 text-xs text-[#8c909f] italic">
                    No tabs open
                  </div>
                )}
              </div>

              {/* Right Toolbar: Prettier Format Document & Markdown Live Preview Buttons */}
              <div className="flex items-center gap-1.5 px-2">
                {/* Format Document with Prettier */}
                {extensions.some((e) => e.id === "prettier" && e.installed && e.enabled) && (
                  <button
                    onClick={handleFormatDocument}
                    title="Format Document with Prettier (Shift+Alt+F)"
                    className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[#adc6ff] hover:text-white text-[11px] font-medium border border-white/5 transition-all"
                  >
                    <span className="material-symbols-outlined text-[14px] text-yellow-400">auto_fix_high</span>
                    <span className="hidden md:inline">Format</span>
                  </button>
                )}

                {/* Markdown Live Preview Button */}
                {activeFile?.endsWith(".md") && extensions.some((e) => e.id === "markdown" && e.installed && e.enabled) && (
                  <button
                    onClick={() => setIsPreviewingMarkdown((p) => !p)}
                    title={isPreviewingMarkdown ? "Switch to Markdown Code Editor" : "Open Live Markdown Preview"}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-all ${
                      isPreviewingMarkdown
                        ? "bg-[#3B82F6]/20 border-[#3B82F6]/40 text-white"
                        : "bg-white/5 border-white/5 text-[#adc6ff] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px] text-cyan-400">
                      {isPreviewingMarkdown ? "edit_note" : "visibility"}
                    </span>
                    <span>{isPreviewingMarkdown ? "Editor" : "Preview"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Monaco Editor Container / Markdown Live Preview Container */}
            <div className="flex-1 overflow-hidden monaco-editor-wrapper relative" ref={editorContainerRef}>
              {isPreviewingMarkdown && activeFile?.endsWith(".md") ? (
                <div className="w-full h-full bg-[#0B0E14] overflow-y-auto">
                  <MarkdownViewer content={currentContent} />
                </div>
              ) : (
                <div className={`w-full h-full ${activeFile ? "block" : "hidden"}`}>
                  <Editor
                    language={currentLanguage}
                    onChange={handleEditorChange}
                    theme="synscript-dark"
                    options={EDITOR_OPTIONS}
                    onMount={handleEditorDidMount}
                    loading={
                      <div className="flex items-center justify-center h-full bg-[#0d1117] text-[#8c909f] text-sm">
                        <span className="material-symbols-outlined text-2xl animate-spin mr-2">sync</span>
                        Loading editor…
                      </div>
                    }
                  />
                </div>
              )}
              {!activeFile && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-outline-variant bg-editor-bg z-10">
                  <span className="material-symbols-outlined text-5xl mb-4 text-white/5">code</span>
                  <p className="text-sm">Select or create a file to edit</p>
                  <p className="text-xs text-[#8c909f] mt-2">Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Ctrl+P</kbd> to Quick Open</p>
                </div>
              )}
            </div>

            {/* ── Collapsible & Resizable Bottom Panel (VS Code style) ──────── */}
            {isBottomPanelOpen && (
              <div
                style={{ height: isPanelMaximized ? "60vh" : `${bottomPanelHeight}px` }}
                className="border-t border-white/10 bg-editor-bg flex flex-col flex-shrink-0 relative transition-[height] duration-75"
              >
                {/* Drag handle for resizing */}
                <div
                  onMouseDown={handleResizeMouseDown}
                  className="h-1.5 w-full bg-white/5 hover:bg-primary/50 cursor-ns-resize transition-colors flex items-center justify-center group flex-shrink-0 select-none"
                  title="Drag to resize console"
                >
                  <div className="w-8 h-0.5 rounded-full bg-white/20 group-hover:bg-primary transition-colors" />
                </div>

                {/* Panel header with tabs and action buttons */}
                <div className="flex items-center h-8 px-3 bg-surface-container-low/80 border-b border-white/5 gap-1 flex-shrink-0 select-none">
                  <button
                    onClick={() => setBottomPanelTab("output")}
                    className={`flex items-center gap-1.5 h-full px-3 text-xs font-medium border-b-2 transition-colors ${
                      bottomPanelTab === "output"
                        ? "text-primary border-primary bg-white/5"
                        : "text-outline hover:text-on-surface border-transparent"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">output</span>
                    <span>Output</span>
                    {isExecuting && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping ml-0.5" />
                    )}
                  </button>

                  <button
                    onClick={() => setBottomPanelTab("terminal")}
                    className={`flex items-center gap-1.5 h-full px-3 text-xs font-medium border-b-2 transition-colors ${
                      bottomPanelTab === "terminal"
                        ? "text-primary border-primary bg-white/5"
                        : "text-outline hover:text-on-surface border-transparent"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">terminal</span>
                    <span>Terminal</span>
                  </button>

                  <button
                    onClick={() => setBottomPanelTab("debug")}
                    className={`flex items-center gap-1.5 h-full px-3 text-xs font-medium border-b-2 transition-colors ${
                      bottomPanelTab === "debug"
                        ? "text-primary border-primary bg-white/5"
                        : "text-outline hover:text-on-surface border-transparent"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">bug_report</span>
                    <span>Debug Console</span>
                  </button>

                  {/* Status Indicator */}
                  {bottomPanelTab === "output" && executionStatus !== "idle" && (
                    <div className="flex items-center gap-2 ml-3">
                      {executionStatus === "running" && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px]">
                          <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                          <span>Running {executedFileName}...</span>
                        </div>
                      )}
                      {executionStatus === "success" && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px]">
                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                          <span>Completed {executionDuration !== null ? `(${executionDuration}ms)` : ""}</span>
                        </div>
                      )}
                      {executionStatus === "error" && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px]">
                          <span className="material-symbols-outlined text-[13px]">error</span>
                          <span>Failed {executionDuration !== null ? `(${executionDuration}ms)` : ""}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Right Header Action Icons */}
                  <div className="ml-auto flex items-center gap-1">
                    {bottomPanelTab === "output" && (
                      <button
                        onClick={() => {
                          setExecutionOutput("");
                          setExecutionError("");
                          setExecutionStatus("idle");
                          setExecutionDuration(null);
                        }}
                        title="Clear Output"
                        className="p-1 rounded text-outline hover:text-on-surface hover:bg-white/5 transition-colors flex items-center"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                      </button>
                    )}
                    <button
                      onClick={() => setIsPanelMaximized(!isPanelMaximized)}
                      title={isPanelMaximized ? "Restore Height" : "Maximize Panel"}
                      className="p-1 rounded text-outline hover:text-on-surface hover:bg-white/5 transition-colors flex items-center"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isPanelMaximized ? "unfold_less" : "unfold_more"}
                      </span>
                    </button>
                    <button
                      onClick={() => setIsBottomPanelOpen(false)}
                      title="Close Panel"
                      className="p-1 rounded text-outline hover:text-on-surface hover:bg-white/5 transition-colors flex items-center"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Panel Content Body */}
                <div className={`flex-1 min-h-0 ${bottomPanelTab === "terminal" ? "overflow-hidden flex flex-col p-0" : "overflow-y-auto p-4"} font-mono text-xs custom-scrollbar bg-editor-bg`}>
                  {bottomPanelTab === "output" && (
                    <div className="space-y-3">
                      {/* Meta banner */}
                      {executedFileName && (
                        <div className="flex items-center justify-between text-[11px] text-outline-variant pb-2 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-semibold">[SynScript Execution Engine]</span>
                            <span>{executedFileName}</span>
                            <span className="text-outline">({executedLanguage})</span>
                          </div>
                          {executionTimestamp && (
                            <span className="text-outline">{executionTimestamp}</span>
                          )}
                        </div>
                      )}

                      {/* Loading state */}
                      {isExecuting && (
                        <div className="flex items-center gap-2 py-4 text-amber-300">
                          <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                          <span>Executing program in child process...</span>
                        </div>
                      )}

                      {/* Standard Output */}
                      {executionOutput && (
                        <div>
                          <div className="text-[10px] uppercase font-bold text-outline mb-1 tracking-wider">Output (stdout)</div>
                          <pre className="text-[#e1e2eb] whitespace-pre-wrap font-mono select-text bg-[#080a0f] p-3 rounded-lg border border-white/5 leading-relaxed">
                            {executionOutput}
                          </pre>
                        </div>
                      )}

                      {/* Standard Error */}
                      {executionError && (
                        <div>
                          <div className="text-[10px] uppercase font-bold text-rose-400 mb-1 tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">warning</span>
                            <span>Error (stderr)</span>
                          </div>
                          <pre className="text-rose-300 whitespace-pre-wrap font-mono select-text bg-rose-950/20 p-3 rounded-lg border border-rose-800/30 leading-relaxed">
                            {executionError}
                          </pre>
                        </div>
                      )}

                      {/* Empty State */}
                      {!isExecuting && !executionOutput && !executionError && (
                        <div className="flex flex-col items-center justify-center py-8 text-outline text-center">
                          <span className="material-symbols-outlined text-3xl mb-2 text-white/10">play_circle</span>
                          <p className="text-xs">No execution output yet.</p>
                          <p className="text-[11px] text-outline/60 mt-1">
                            Click <strong className="text-emerald-400 font-semibold">Run</strong> in the toolbar or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Ctrl+Enter</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">F5</kbd> to execute the active file.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`h-full w-full flex-1 min-h-0 ${bottomPanelTab === "terminal" ? "block" : "hidden"}`}>
                    <TerminalPanel
                      roomId={roomId}
                      roomName={room?.name || "Workspace"}
                      isVisible={isBottomPanelOpen && bottomPanelTab === "terminal"}
                      onInput={emitTerminalInput}
                      onResize={emitTerminalResize}
                      onStart={emitTerminalStart}
                      onClose={emitTerminalClose}
                      onRegisterDataListener={registerTerminalDataListener}
                    />
                  </div>

                  {bottomPanelTab === "debug" && (
                    <div className="text-outline italic text-xs py-4 text-center">
                      Debug console ready. Set breakpoints in the editor to inspect variables.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Collapsed Console Strip */}
            {!isBottomPanelOpen && (
              <div className="h-6 border-t border-white/5 bg-surface-container-low flex items-center justify-between px-3 flex-shrink-0 select-none text-[11px]">
                <button
                  onClick={() => {
                    setIsBottomPanelOpen(true);
                    setBottomPanelTab("output");
                  }}
                  className="flex items-center gap-1.5 text-outline hover:text-on-surface transition-colors"
                  title="Open Output Panel"
                >
                  <span className="material-symbols-outlined text-[14px]">output</span>
                  <span>Output</span>
                  {executionStatus === "success" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                  {executionStatus === "error" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  )}
                </button>

                <div className="flex items-center gap-3 text-outline/60 text-[10px]">
                  <span>Run: <kbd className="bg-white/10 px-1 py-0.5 rounded text-white">Ctrl+Enter</kbd></span>
                  <button
                    onClick={() => setIsBottomPanelOpen(true)}
                    className="hover:text-white transition-colors"
                    title="Expand Panel"
                  >
                    <span className="material-symbols-outlined text-[14px]">expand_less</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Right Sidebar: Collapsible Live Chat ────────────────────── */}
          {isChatOpen ? (
            <aside className="w-80 bg-sidebar-bg border-l border-white/5 flex flex-col shrink-0 transition-all duration-200">
              <div className="px-4 py-3 flex justify-between items-center border-b border-white/5 bg-[#0e1117]/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#3B82F6]">forum</span>
                  <span className="text-label-caps text-outline uppercase font-semibold text-xs tracking-wider">Team Chat</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    {onlineCount} online
                  </span>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-1 rounded hover:bg-white/10 text-[#8c909f] hover:text-white transition-colors"
                  title="Collapse Chat"
                >
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#8c909f]">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                      <span className="material-symbols-outlined text-2xl text-[#adc6ff]">chat_bubble</span>
                    </div>
                    <p className="text-xs font-semibold text-white">No messages yet</p>
                    <p className="text-[11px] text-[#8c909f] mt-1 max-w-[180px]">
                      Send a message to start collaborating with your team!
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => {
                    const isMe =
                      Boolean(user?._id && msg.senderId && String(user._id) === String(msg.senderId)) ||
                      Boolean(user?.id && msg.senderId && String(user.id) === String(msg.senderId)) ||
                      Boolean(user?.username && msg.senderUsername && msg.senderUsername.toLowerCase() === user.username.toLowerCase());
                    const colorScheme = getUserColor(msg.senderUsername || msg.senderId);
                    const initial = msg.senderUsername
                      ? msg.senderUsername.charAt(0).toUpperCase()
                      : (isMe && user?.username ? user.username.charAt(0).toUpperCase() : "U");

                    return (
                      <div key={msg._id || i} className="flex gap-2.5 items-start">
                        {/* Avatar */}
                        {msg.senderAvatar ? (
                          <img
                            src={msg.senderAvatar}
                            alt={msg.senderUsername}
                            className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/10 shadow-sm"
                          />
                        ) : (
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold border ${colorScheme.bg} ${colorScheme.text} ${colorScheme.border}`}
                            title={msg.senderUsername}
                          >
                            {initial}
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                              {msg.senderUsername}
                              {isMe && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-medium">
                                  You
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-[#8c909f] shrink-0">{msg.time}</span>
                          </div>

                          <div
                            className={`p-2.5 rounded-xl text-xs leading-relaxed break-words ${
                              isMe
                                ? "bg-[#1E293B] text-white border border-[#3B82F6]/30 rounded-tl-none"
                                : "bg-[#161B26] text-[#e1e2eb] border border-white/5 rounded-tl-none"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Chat input */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-white/5 bg-[#0e1117]/50">
                <div className="flex items-center gap-2 bg-[#0B0E14] border border-white/10 focus-within:border-primary/60 rounded-xl p-1.5 transition-colors">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1 bg-transparent border-none px-2 py-1.5 text-xs text-white placeholder-[#8c909f] focus:outline-none resize-none custom-scrollbar max-h-24"
                    placeholder="Type a message (Enter to send)..."
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="w-8 h-8 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-30 disabled:hover:bg-primary text-white flex items-center justify-center shrink-0 transition-all shadow-md shadow-primary/20 active:scale-95"
                    title="Send Message (Enter)"
                  >
                    <span className="material-symbols-outlined text-[16px]">send</span>
                  </button>
                </div>
              </form>
            </aside>
          ) : (
            <aside className="w-11 bg-sidebar-bg border-l border-white/5 flex flex-col items-center py-3 justify-between shrink-0 transition-all duration-200">
              <button
                onClick={() => setIsChatOpen(true)}
                className="p-2 rounded-lg hover:bg-white/10 text-[#adc6ff] hover:text-white transition-all flex flex-col items-center gap-2"
                title="Open Live Chat"
              >
                <span className="material-symbols-outlined text-[20px]">forum</span>
                <span className="[writing-mode:vertical-lr] text-[10px] uppercase font-mono tracking-widest text-[#8c909f]">
                  Chat
                </span>
              </button>
            </aside>
          )}
        </main>

        {/* Decorative ambient blobs — pointer-events-none, preserved from original */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20 overflow-hidden">
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-secondary rounded-full blur-[100px]" />
        </div>

        {/* ── Save Snapshot Modal ───────────────────────────────────────── */}
        {saveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-[420px] rounded-2xl bg-[#0F1219] border border-white/10 shadow-2xl shadow-black/60 overflow-hidden">
              {/* Modal header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-gradient-to-r from-emerald-600/10 to-transparent">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px] text-emerald-400">save</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Save Snapshot</div>
                  <div className="text-[11px] text-[#8c909f]">Name this version for easy reference later</div>
                </div>
              </div>

              {/* Modal body */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#c2c6d6] mb-2 uppercase tracking-wider">
                    Snapshot Name
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmSave(); if (e.key === "Escape") setSaveModalOpen(false); }}
                    placeholder='e.g. "Before Refactor", "Socket Fix", "v1.0"'
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8c909f] focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {["Before Refactor", "Socket Fix", "Working Build", "Version 1"].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setSnapshotName(suggestion)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#8c909f] hover:text-white border border-white/10 transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-white/5 flex gap-3 justify-end">
                <button
                  onClick={() => setSaveModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm text-[#8c909f] hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSave}
                  disabled={saveLoading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
                >
                  {saveLoading ? (
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">save</span>
                  )}
                  {saveLoading ? "Saving…" : "Save Snapshot"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Quick Open File Picker Modal (Ctrl+P / Cmd+P) ─────────────── */}
        <QuickOpenModal
          isOpen={quickOpenOpen}
          onClose={() => setQuickOpenOpen(false)}
          files={Object.values(files)}
          onSelectFile={(selectedPath) => {
            handleSelectFile(selectedPath);
          }}
          getFileIcon={getFileIcon}
        />
      </div>
    </AppShell>
  );
}
