import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { addMemberToRoom, getUserRooms } from "../lib/user-rooms";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useRoomSocket } from "../hooks/useRoomSocket";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

// ── Types ──────────────────────────────────────────────────────────────────
type FileNode = {
  path: string;
  name: string;
  type: "file" | "folder";
  content?: string;
  isOpen?: boolean; // For folders
};
type FileSystem = Record<string, FileNode>;

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
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true },
  matchBrackets: "always",
  // Formatting
  formatOnPaste: true,
  formatOnType: true,
  // Code folding
  folding: true,
  foldingStrategy: "indentation",
  // Hover & errors
  hover: { enabled: true as const },
  renderValidationDecorations: "on" as const,
  // Visual polish
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  smoothScrolling: true,
  renderLineHighlight: "all",
  padding: { top: 16 },
};

// ── Custom Monaco theme definition ─────────────────────────────────────────
function defineCustomTheme(monaco: Monaco) {
  monaco.editor.defineTheme("synscript-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "d0bcff" },
      { token: "keyword.control", foreground: "d0bcff" },
      { token: "string", foreground: "25C2A0" },
      { token: "string.value", foreground: "25C2A0" },
      { token: "number", foreground: "ffb786" },
      { token: "comment", foreground: "8c909f", fontStyle: "italic" },
      { token: "function", foreground: "adc6ff" },
      { token: "type", foreground: "7dd3fc" },
      { token: "type.identifier", foreground: "7dd3fc" },
      { token: "variable", foreground: "e1e2eb" },
      { token: "tag", foreground: "f472b6" },
      { token: "tag.html", foreground: "f472b6" },
      { token: "attribute.name", foreground: "adc6ff" },
      { token: "attribute.name.html", foreground: "adc6ff" },
      { token: "attribute.value", foreground: "25C2A0" },
      { token: "attribute.value.html", foreground: "25C2A0" },
      { token: "delimiter", foreground: "8c909f" },
      { token: "delimiter.html", foreground: "8c909f" },
      { token: "metatag", foreground: "8c909f" },
      { token: "metatag.html", foreground: "8c909f" },
      { token: "metatag.content.html", foreground: "25C2A0" },
      { token: "operator", foreground: "c9d1d9" },
      { token: "regexp", foreground: "ffb786" },
      { token: "annotation", foreground: "d0bcff" },
      { token: "constant", foreground: "ffb786" },
    ],
    colors: {
      "editor.background": "#0d1117",
      "editor.foreground": "#e1e2eb",
      "editor.lineHighlightBackground": "#1d202640",
      "editorCursor.foreground": "#adc6ff",
      "editor.selectionBackground": "#3B82F640",
      "editorLineNumber.foreground": "#8c909f",
      "editorLineNumber.activeForeground": "#adc6ff",
      "editorIndentGuide.background": "#1d2026",
      "editorIndentGuide.activeBackground": "#32353c",
      "editorBracketMatch.background": "#3B82F630",
      "editorBracketMatch.border": "#3B82F680",
      "minimap.background": "#0d1117",
      "editorGutter.background": "#0d1117",
      "editorWidget.background": "#161b22",
      "editorWidget.border": "#30363d",
      "editorSuggestWidget.background": "#161b22",
      "editorSuggestWidget.border": "#30363d",
      "editorSuggestWidget.selectedBackground": "#1d202680",
      "editorSuggestWidget.highlightForeground": "#adc6ff",
      "editorHoverWidget.background": "#161b22",
      "editorHoverWidget.border": "#30363d",
      "input.background": "#0d1117",
      "input.border": "#30363d",
      "input.foreground": "#e1e2eb",
      "scrollbarSlider.background": "#32353c60",
      "scrollbarSlider.hoverBackground": "#42475480",
      "scrollbarSlider.activeBackground": "#52576490",
    },
  });
}

// ── Default file set ────────────────────────────────────────────────────────
const DEFAULT_FILES: FileSystem = {};

// Shared document synced in real time across collaborators
const SYNC_FILE = "index.js";

// ── Room members fallback map ───────────────────────────────────────────────
const ROOM_MEMBERS: Record<string, [string, string, string]> = {
  "auth-microservice": ["Sarah", "Alex", "Mia"],
  "data-pipeline-v3": ["Jordan", "Priya", "Devon"],
  "frontend-revamp": ["Mia", "Devon", "Sarah"],
  "go-scraper": ["Devon", "Kai", "Leo"],
  "ss-49x-z2": ["Alex", "Sarah", "Mia"],
};

export const Route = createFileRoute("/room/$roomId")({
  head: ({ params }) => ({
    meta: [{ title: `Room ${params.roomId} | SYNCSCRIPT` }],
  }),
  component: RoomPage,
});

type Msg = { role: "user" | "ai"; text: string };


function RoomPage() {
  const { roomId } = Route.useParams();
  const { user } = useAuth();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ── Sidebar active tab state ─────────────────────────────────────────────
  const [activeSidebarTab, setActiveSidebarTab] = useState<"explorer" | "search" | "sourceControl" | "extensions" | "settings">("explorer");
  const [searchQuery, setSearchQuery] = useState("");
  const [extensionsSearch, setExtensionsSearch] = useState("");
  const [extensions, setExtensions] = useState([
    { id: "prettier", name: "Prettier - Code formatter", publisher: "Prettier", desc: "Code formatter using opinionated code style", installed: true, enabled: true, icon: "auto_fix_high" },
    { id: "eslint", name: "ESLint", publisher: "Microsoft", desc: "Integrates ESLint JavaScript into VS Code", installed: true, enabled: true, icon: "fact_check" },
    { id: "python", name: "Python", publisher: "Microsoft", desc: "IntelliSense, Linting, Debugging, code browsing", installed: false, enabled: false, icon: "terminal" },
    { id: "java", name: "Language Support for Java", publisher: "Red Hat", desc: "Java Linting, IntelliSense, formatting", installed: false, enabled: false, icon: "code" },
    { id: "live-server", name: "Live Server", publisher: "Ritwick Dey", desc: "Launch a local development server with live reload", installed: false, enabled: false, icon: "wifi_tethering" },
  ]);

  // ── Active file system state & Open Tabs state ─────────────────────────────
  const [files, setFiles] = useState<FileSystem>(DEFAULT_FILES);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [explorerSelection, setExplorerSelection] = useState<string | null>(null);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const originalContents = useRef<Record<string, string>>({});
  const isRemoteUpdate = useRef(false);

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

  // ── Resolve collaborator names (dynamic) ───────────────────────────────────
  const userRoom = getUserRooms().find((r) => r.id === roomId) as any;
  const rawMembers = room?.members?.map((m: any) => m.username || m) ?? userRoom?.members ?? [];
  const roomCreator = room?.owner?.username ?? userRoom?.owner ?? user?.username ?? "Creator";
  
  // Dynamic list starting with room creator, filtering out duplicates
  const dynamicMembersList = Array.from(new Set([roomCreator, ...rawMembers]));
  const collaboratorsList = dynamicMembersList.map((username, index) => {
    const colors = [
      { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/30", label: "text-cyan-500", labelText: "Cyan" },
      { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", label: "text-green-500", labelText: "Green" },
      { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/30", label: "text-violet-500", labelText: "Violet" },
      { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30", label: "text-amber-500", labelText: "Amber" },
    ];
    const style = colors[index % colors.length];
    return {
      name: username,
      initial: username ? username[0].toUpperCase() : "?",
      ...style,
    };
  });

  // ── Load room from API ───────────────────────────────────────────────────
  useEffect(() => {
    async function loadRoom() {
      try {
        const res = await api.get(`/api/rooms/${roomId}`);
        setRoom(res.data);
        localStorage.setItem("syncscript_active_roomId", roomId);
        // Load shared document for real-time sync
        if (Object.keys(DEFAULT_FILES).length === 0) {
          const content = res.data.currentCode ?? "";
          setFiles({
            [SYNC_FILE]: {
              path: SYNC_FILE,
              name: SYNC_FILE,
              type: "file",
              content,
            },
          });
          originalContents.current[SYNC_FILE] = content;
          setActiveFile(SYNC_FILE);
          setOpenTabs([SYNC_FILE]);
        }
      } catch (err) {
        console.error("Failed to fetch room details", err);
      } finally {
        setLoading(false);
      }
    }
    loadRoom();
  }, [roomId]);

  const applyRemoteCode = useCallback((code: string) => {
    isRemoteUpdate.current = true;

    setFiles((prev) => {
      const existing = prev[SYNC_FILE];
      if (existing) {
        return {
          ...prev,
          [SYNC_FILE]: { ...existing, content: code },
        };
      }

      return {
        ...prev,
        [SYNC_FILE]: {
          path: SYNC_FILE,
          name: SYNC_FILE,
          type: "file",
          content: code,
        },
      };
    });

    setActiveFile((current) => current ?? SYNC_FILE);

    window.setTimeout(() => {
      isRemoteUpdate.current = false;
    }, 0);
  }, []);

  const { emitCodeChange } = useRoomSocket({
    roomId,
    username: user?.username ?? "Anonymous",
    enabled: !loading && !!user,
    onCodeChange: applyRemoteCode,
    onError: (message) => {
      console.error("Room socket error:", message);
    },
  });

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
    
    setFiles(prev => ({
      ...prev,
      [newPath]: { path: newPath, name, type: "file", content: "" }
    }));
    setActiveFile(newPath);
    setOpenTabs(prev => prev.includes(newPath) ? prev : [...prev, newPath]);
    setExplorerSelection(newPath);
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
    
    setFiles(prev => ({
      ...prev,
      [newPath]: { path: newPath, name, type: "folder", isOpen: true }
    }));
    setExplorerSelection(newPath);
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
      return next;
    });
    
    if (activeFile === oldPath) {
      setActiveFile(newPath);
    }
    setExplorerSelection(newPath);
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
      return next;
    });
    
    if (activeFile && activeFile.startsWith(oldPath + "/")) {
      setActiveFile(newPath + "/" + activeFile.slice(oldPath.length + 1));
    }
    setExplorerSelection(newPath);
  };

  const deleteFile = () => {
    console.log("deleteFile called");
    if (!explorerSelection || files[explorerSelection]?.type !== "file") return;
    
    const oldPath = explorerSelection;
    if (!window.confirm(`Are you sure you want to delete ${files[oldPath].name}?`)) return;
    
    setFiles(prev => {
      const next = { ...prev };
      delete next[oldPath];
      return next;
    });

    setOpenTabs(prev => prev.filter(t => t !== oldPath));
    
    if (activeFile === oldPath) {
      const remainingOpenTabs = openTabs.filter(t => t !== oldPath);
      setActiveFile(remainingOpenTabs.length > 0 ? remainingOpenTabs[remainingOpenTabs.length - 1] : null);
    }
    setExplorerSelection(null);
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
      return next;
    });
    
    if (activeFile && (activeFile === oldPath || activeFile.startsWith(oldPath + "/"))) {
      const remainingFiles = Object.values(files).filter(f => f.type === "file" && !f.path.startsWith(oldPath + "/") && f.path !== oldPath);
      setActiveFile(remainingFiles.length > 0 ? remainingFiles[0].path : null);
    }
    setExplorerSelection(null);
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
      setActiveFile(path);
      setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    } else if (files[path]?.type === "folder") {
      toggleFolder(path);
    }
  };

  // ── Editor change — update only the active file's content ────────────────
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeFile) return;
      const newContent = value ?? "";
      setFiles((prev) => ({
        ...prev,
        [activeFile]: { ...prev[activeFile], content: newContent },
      }));
      // Track modified state
      const isModified = newContent !== (originalContents.current[activeFile] ?? "");
      setModifiedFiles((prev) => {
        const next = new Set(prev);
        if (isModified) next.add(activeFile);
        else next.delete(activeFile);
        return next;
      });

      if (!isRemoteUpdate.current && activeFile === SYNC_FILE) {
        emitCodeChange(newContent);
      }
    },
    [activeFile, emitCodeChange],
  );

  // ── Monaco mount handler ─────────────────────────────────────────────────
  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editorInstance;
      defineCustomTheme(monaco);
      monaco.editor.setTheme("synscript-dark");
      editorInstance.focus();
    },
    []
  );

  // ── Save — sends active file content to backend ──────────────────────────
  const handleSave = async () => {
    if (!activeFile) return;
    const codeText = files[activeFile]?.content ?? "";
    try {
      await api.post(`/api/rooms/${roomId}/save`, {
        code: codeText,
        language: getLanguageFromExtension(activeFile),
      });
      alert("Session saved successfully!");
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to save session");
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
  const currentContent = activeFile ? (files[activeFile]?.content ?? "") : "";
  const currentLanguage = activeFile ? getLanguageFromExtension(activeFile) : "plaintext";
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
      <div className="relative">
        {/* ── Workspace Layout ──────────────────────────────────────────── */}
        <main className="flex h-screen">

          {/* ── Left Sidebar: Activity Bar + File Explorer ───────────────── */}
          <aside className="flex w-[260px] flex-shrink-0 bg-sidebar-bg border-r border-white/5">

            {/* Activity Bar (slim icon strip) */}
            <div className="w-12 flex flex-col items-center py-4 gap-4 border-r border-white/5 bg-[#0e1117]">
              <button 
                onClick={() => setActiveSidebarTab("explorer")}
                title="Explorer"
                className={`w-full flex justify-center py-2.5 transition-all relative ${
                  activeSidebarTab === "explorer" 
                    ? "text-[#3B82F6] border-l-2 border-[#3B82F6] bg-white/5" 
                    : "text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">description</span>
              </button>
              <button 
                onClick={() => setActiveSidebarTab("search")}
                title="Search"
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
                title="Source Control"
                className={`w-full flex justify-center py-2.5 transition-all relative ${
                  activeSidebarTab === "sourceControl" 
                    ? "text-[#3B82F6] border-l-2 border-[#3B82F6] bg-white/5" 
                    : "text-[#8c909f] hover:text-[#e1e2eb] hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">account_tree</span>
              </button>
              <button 
                onClick={() => setActiveSidebarTab("extensions")}
                title="Extensions"
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

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* File list */}
                    <div className="mb-4">
                      {visiblePaths.map((path) => {
                        const node = files[path];
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
                              <span className="text-body-sm font-medium flex-1">{node.name}</span>
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
                            <span className="text-body-sm flex-1">{node.name}</span>
                            {isModified && (
                              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Modified" />
                            )}
                          </button>
                        );
                      })}
                      {visiblePaths.length === 0 && (
                        <div className="px-4 py-3 text-outline-variant text-sm text-center">
                          Workspace is empty
                        </div>
                      )}
                    </div>

                    {/* Collaborators section */}
                    <div className="mt-8">
                      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-label-caps text-outline uppercase font-semibold">Collaborators</span>
                        <span className="text-[10px] font-bold bg-[#3B82F6]/20 text-[#3B82F6] px-1.5 py-0.5 rounded">
                          {collaboratorsList.length}
                        </span>
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
                                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-status-active border border-sidebar-bg" />
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

              {/* Search Panel */}
              {activeSidebarTab === "search" && (
                <div className="flex-1 flex flex-col overflow-hidden p-4">
                  <div className="text-label-caps text-outline uppercase font-semibold mb-3">Search</div>
                  <div className="relative mb-4">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
                    <input
                      type="text"
                      placeholder="Search files and content..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#0B0E14] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-[#8c909f] focus:outline-none focus:border-[#3B82F6] transition-all"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                    {searchQuery.trim() !== "" ? (
                      (() => {
                        const q = searchQuery.toLowerCase();
                        const matchingFiles = Object.values(files).filter(
                          (f) => f.type === "file" && (f.name.toLowerCase().includes(q) || (f.content && f.content.toLowerCase().includes(q)))
                        );

                        if (matchingFiles.length === 0) {
                          return <div className="text-xs text-[#8c909f] text-center italic mt-4">No matching files or content found</div>;
                        }

                        return matchingFiles.map((file) => {
                          const icon = getFileIcon(file.name);
                          const isContentMatch = file.content && file.content.toLowerCase().includes(q);
                          return (
                            <div
                              key={file.path}
                              onClick={() => handleNodeClick(file.path)}
                              className="p-2 rounded-lg bg-[#181c24] hover:bg-[#202632] border border-white/5 cursor-pointer transition-all"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`material-symbols-outlined text-[16px] ${icon.color}`}>{icon.icon}</span>
                                <span className="text-xs font-semibold text-white">{file.name}</span>
                              </div>
                              {isContentMatch && (
                                <p className="text-[11px] text-[#8c909f] font-mono line-clamp-2 bg-[#0d1117] p-1.5 rounded mt-1">
                                  {file.content}
                                </p>
                              )}
                            </div>
                          );
                        });
                      })()
                    ) : (
                      <div className="text-xs text-[#8c909f] text-center italic mt-4">Type to search workspace files and code...</div>
                    )}
                  </div>
                </div>
              )}

              {/* Source Control Panel */}
              {activeSidebarTab === "sourceControl" && (
                <div className="flex-1 flex flex-col overflow-hidden p-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-label-caps text-outline uppercase font-semibold">Source Control</span>
                    <span className="text-xs font-mono font-bold bg-[#3B82F6]/20 text-[#3B82F6] px-2 py-0.5 rounded">
                      {modifiedFiles.size} Changes
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {modifiedFiles.size > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs uppercase font-mono tracking-wider text-[#8c909f] mb-2">Staged Changes</div>
                        {Array.from(modifiedFiles).map((path) => {
                          const icon = getFileIcon(files[path]?.name || "");
                          return (
                            <div
                              key={path}
                              onClick={() => handleNodeClick(path)}
                              className="flex items-center justify-between p-2 rounded-lg bg-[#181c24] hover:bg-[#202632] border border-white/5 cursor-pointer transition-all"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`material-symbols-outlined text-[16px] ${icon.color}`}>{icon.icon}</span>
                                <span className="text-xs text-white truncate">{files[path]?.name || path}</span>
                              </div>
                              <span className="text-[10px] font-bold font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">M</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-[#8c909f] text-center italic mt-8">No uncommitted changes in workspace</div>
                    )}
                  </div>
                </div>
              )}

              {/* Extensions Panel */}
              {activeSidebarTab === "extensions" && (
                <div className="flex-1 flex flex-col overflow-hidden p-4">
                  <div className="text-label-caps text-outline uppercase font-semibold mb-3">Extensions</div>
                  <div className="relative mb-4">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
                    <input
                      type="text"
                      placeholder="Search Extensions in Marketplace..."
                      value={extensionsSearch}
                      onChange={(e) => setExtensionsSearch(e.target.value)}
                      className="w-full bg-[#0B0E14] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-[#8c909f] focus:outline-none focus:border-[#3B82F6] transition-all"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                    {extensions
                      .filter((e) => e.name.toLowerCase().includes(extensionsSearch.toLowerCase()) || e.publisher.toLowerCase().includes(extensionsSearch.toLowerCase()))
                      .map((ext) => (
                        <div key={ext.id} className="p-3 rounded-xl bg-[#181c24] border border-white/5 flex flex-col justify-between">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/10 text-[#3B82F6] flex items-center justify-center shrink-0 border border-[#3B82F6]/20">
                              <span className="material-symbols-outlined text-[18px]">{ext.icon}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-white truncate">{ext.name}</h4>
                              <p className="text-[10px] text-[#8c909f]">{ext.publisher}</p>
                              <p className="text-[11px] text-[#c2c6d6] mt-1 line-clamp-2">{ext.desc}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-white/5">
                            {ext.installed ? (
                              <>
                                <button
                                  onClick={() =>
                                    setExtensions((prev) =>
                                      prev.map((e) => (e.id === ext.id ? { ...e, enabled: !e.enabled } : e))
                                    )
                                  }
                                  className={`text-[10px] px-2 py-1 rounded font-bold transition-all ${
                                    ext.enabled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                                  }`}
                                >
                                  {ext.enabled ? "Enabled" : "Disabled"}
                                </button>
                                <button
                                  onClick={() =>
                                    setExtensions((prev) =>
                                      prev.map((e) => (e.id === ext.id ? { ...e, installed: false, enabled: false } : e))
                                    )
                                  }
                                  className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded font-bold hover:bg-red-500/30 transition-all"
                                >
                                  Uninstall
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() =>
                                  setExtensions((prev) =>
                                    prev.map((e) => (e.id === ext.id ? { ...e, installed: true, enabled: true } : e))
                                  )
                                }
                                className="text-[10px] bg-[#3B82F6] hover:bg-[#2563eb] text-white px-3 py-1 rounded font-bold transition-all shadow-md shadow-[#3B82F6]/20"
                              >
                                Install
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

            {/* Tab bar — open tabs */}
            <div className="flex bg-surface-container-low h-9 border-b border-white/5 overflow-x-auto flex-shrink-0">
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

            {/* Editor header bar — file info + language + modified status */}
            {activeFile && (
              <div className="flex items-center h-7 px-4 bg-[#0d1117] border-b border-white/5 gap-3 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className={`material-symbols-outlined text-[14px] ${getFileIcon(files[activeFile]?.name || "").color}`}>
                    {getFileIcon(files[activeFile]?.name || "").icon}
                  </span>
                  <span className="text-[12px] text-on-surface font-medium">{activeFile}</span>
                </div>
                <span className="text-[12px] text-outline">|</span>
                <span className="text-[12px] text-outline-variant">{getLanguageLabel(currentLanguage)}</span>
                {isCurrentModified && (
                  <>
                    <span className="text-[12px] text-outline">|</span>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span className="text-[12px] text-amber-400">Modified</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Monaco Editor */}
            {activeFile ? (
              <div className="flex-1 overflow-hidden monaco-editor-wrapper">
                <Editor
                  language={currentLanguage}
                  value={currentContent}
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
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-outline-variant bg-editor-bg">
                <span className="material-symbols-outlined text-5xl mb-4 text-white/5">code</span>
                <p className="text-sm">Select or create a file to edit</p>
              </div>
            )}


            {/* Integrated Terminal (static chrome, preserved from original) */}
            <div className="h-48 border-t border-white/10 bg-editor-bg flex flex-col flex-shrink-0">
              <div className="flex items-center h-8 px-4 bg-surface-container-low/50 gap-4">
                <button className="text-label-caps text-primary border-b-2 border-primary h-full px-2">
                  Terminal
                </button>
                <button className="text-label-caps text-outline hover:text-on-surface h-full px-2">
                  Output
                </button>
                <button className="text-label-caps text-outline hover:text-on-surface h-full px-2">
                  Debug Console
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface cursor-pointer">add</span>
                  <span className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface cursor-pointer">delete</span>
                  <span className="material-symbols-outlined text-[16px] text-outline hover:text-on-surface cursor-pointer">close</span>
                </div>
              </div>
              <div className="flex-1 p-4 font-code-sm text-on-surface overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-status-active">➜</span>
                  <span className="text-primary">{room?.name ?? roomId}</span>
                  <span className="text-syntax-pink">git:(main)</span>
                  <span className="text-on-surface-variant">npm start</span>
                </div>
                <div className="text-outline-variant mb-1">
                  &gt; {room?.name ?? roomId}@1.0.0 start
                </div>
                <div className="text-outline-variant mb-1">&gt; ts-node src/index.ts</div>
                <div className="text-outline-variant mb-1">&nbsp;</div>
                <div className="text-status-active flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>[Ready] Server is listening on port 3000</span>
                </div>
                <div className="text-status-active flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>[Success] Database connected (PostgreSQL)</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Right Sidebar: Live Chat ───────────────────────────────────── */}
          <aside className="w-72 bg-sidebar-bg border-l border-white/5 flex flex-col">
            <div className="px-4 py-3 flex justify-between items-center border-b border-white/5">
              <span className="text-label-caps text-outline uppercase">Live Chat</span>
              <span className="material-symbols-outlined text-[18px] text-outline">forum</span>
            </div>

            {/* Static chat messages — preserved from original design */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-bold text-violet-400">{collaboratorsList[0]?.name || "System"}</span>
                  <span className="text-[10px] text-outline-variant">14:22</span>
                </div>
                <div className="bg-surface-container-high p-3 rounded-xl rounded-tl-none border border-white/5">
                  <p className="text-body-sm text-on-surface">
                    Working on the session logic, room environment initialized.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-bold text-orange-400">{collaboratorsList[1]?.name || "Alex"}</span>
                  <span className="text-[10px] text-outline-variant">14:24</span>
                </div>
                <div className="bg-surface-container-high p-3 rounded-xl rounded-tl-none border border-white/5">
                  <p className="text-body-sm text-on-surface">
                    Just pushed the updates for the project files. Check it out in{" "}
                    <span className="text-primary">index.js</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-bold text-cyan-400">{collaboratorsList[2]?.name || "Sarah"}</span>
                  <span className="text-[10px] text-outline-variant">14:25</span>
                </div>
                <div className="bg-surface-container-high p-3 rounded-xl rounded-tl-none border border-white/5">
                  <p className="text-body-sm text-on-surface">
                    Looks good! Testing real-time collaboration.
                  </p>
                </div>
              </div>
            </div>

            {/* Chat input */}
            <div className="p-4 border-t border-white/5">
              <div className="relative">
                <textarea
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-3 pr-10 text-body-sm focus:outline-none focus:border-primary transition-colors resize-none custom-scrollbar"
                  placeholder="Type a message..."
                  rows={2}
                />
                <button className="absolute right-3 bottom-3 text-primary hover:scale-110 active:scale-95 transition-all">
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
          </aside>
        </main>

        {/* Decorative ambient blobs — pointer-events-none, preserved from original */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20 overflow-hidden">
          <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-secondary rounded-full blur-[100px]" />
        </div>

        {/* Floating action buttons + AI Copilot (unchanged sub-components) */}
        <RoomFloatingActions roomId={roomId} onSave={handleSave} />
        <AICopilot roomId={roomId} />
      </div>
    </AppShell>
  );
}

// ── RoomFloatingActions — unchanged ────────────────────────────────────────
function RoomFloatingActions({ roomId, onSave }: { roomId: string; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addMemberToRoom(roomId, name.trim());
    setName("");
    setOpen(false);
    alert(`Invited ${name} to ${roomId}`);
  };
  return (
    <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
      <Link
        to="/rooms"
        className="px-3 py-1.5 rounded-md bg-[#1d2026] border border-white/10 text-xs text-[#c2c6d6] hover:bg-white/10"
      >
        ← Rooms
      </Link>
      <button
        onClick={onSave}
        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[16px]" style={{ color: "white" }}>
          save
        </span>
        Save
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-md bg-[#3B82F6] hover:bg-[#2563eb] text-white text-xs font-bold flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[16px]" style={{ color: "white" }}>
          person_add
        </span>
        Invite
      </button>
      {open && (
        <form
          onSubmit={add}
          className="absolute top-12 right-0 w-72 p-4 rounded-xl bg-[#0F1219] border border-white/10 shadow-2xl space-y-2"
        >
          <div className="text-sm font-semibold">Add collaborator</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Username or email"
            className="w-full bg-[#0B0E14] border border-white/10 rounded-md px-3 py-2 text-sm focus:border-[#3B82F6] outline-none"
          />
          <button
            type="submit"
            className="w-full px-3 py-2 rounded-md bg-[#3B82F6] hover:bg-[#2563eb] text-white text-sm font-bold"
          >
            Send invite
          </button>
        </form>
      )}
    </div>
  );
}

// ── AICopilot — unchanged ──────────────────────────────────────────────────
function AICopilot({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: `Hi! I'm your AI Copilot for ${roomId}. Ask me to explain code, write functions, debug errors, or generate tests.`,
    },
  ]);
  const [input, setInput] = useState("");

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    const reply = fakeReply(t);
    setMsgs((m) => [...m, { role: "user", text: t }, { role: "ai", text: reply }]);
    setInput("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#3B82F6] hover:bg-[#2563eb] text-white shadow-2xl shadow-[#3B82F6]/40 flex items-center justify-center btn-flashlight"
      >
        <span className="material-symbols-outlined" style={{ color: "white" }}>
          smart_toy
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] h-[480px] flex flex-col rounded-2xl bg-[#0F1219] border border-[#3B82F6]/30 shadow-2xl shadow-[#3B82F6]/20 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-[#3B82F6]/20 to-transparent border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-[#3B82F6] flex items-center justify-center">
          <span className="material-symbols-outlined text-[18px]" style={{ color: "white" }}>
            smart_toy
          </span>
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold">AI Copilot</div>
          <div className="text-[10px] text-[#8c909f]">Online · GPT-style assistant</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-[#8c909f] hover:text-white text-xl leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                m.role === "user"
                  ? "bg-[#3B82F6] text-white rounded-br-sm"
                  : "bg-[#1d2026] text-[#e1e2eb] rounded-bl-sm border border-white/5"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="p-3 border-t border-white/5 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the AI Copilot..."
          className="flex-1 bg-[#0B0E14] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[#3B82F6] outline-none"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563eb] text-white text-sm font-bold"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// ── fakeReply — unchanged ──────────────────────────────────────────────────
function fakeReply(q: string): string {
  const l = q.toLowerCase();
  if (l.includes("explain"))
    return "Sure — this code defines a function. Walk through it line by line: declarations first, then the main logic, then the return value.";
  if (l.includes("test"))
    return "Here's a quick test scaffold:\n\n```ts\ntest('works', () => { expect(fn(1)).toBe(2); });\n```";
  if (l.includes("bug") || l.includes("error"))
    return "Try logging your inputs first. Most bugs at this layer come from null/undefined or off-by-one indices.";
  if (l.includes("hello") || l.includes("hi"))
    return "Hey! Ready when you are — share a snippet or describe what you're building.";
  return "Got it. Want me to refactor, write a unit test, or generate a function for that?";
}
