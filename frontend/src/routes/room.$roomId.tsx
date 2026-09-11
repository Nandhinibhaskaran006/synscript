import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { addMemberToRoom } from "../lib/user-rooms";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useRoomSocket } from "../hooks/useRoomSocket";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor, IDisposable } from "monaco-editor";
import { defineCustomTheme } from "../lib/monaco-theme";

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
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceReadyRef = useRef(false);
  const cursorChangeListenerRef = useRef<IDisposable | null>(null);
  const localCursorLineRef = useRef<number>(0);
  const monacoModelsRef = useRef<Map<string, editor.ITextModel>>(new Map());
  
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

  const isDraggingPanelRef = useRef(false);
  const startDragYRef = useRef(0);
  const startHeightRef = useRef(240);
  const handleRunCodeRef = useRef<() => void>(() => {});

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

  // Global shortcut for running code (Ctrl+Enter / Cmd+Enter / F5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunCodeRef.current();
      } else if (e.key === "F5") {
        e.preventDefault();
        handleRunCodeRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Derived values needed by useEffects - declared early to avoid temporal dead zone
  const currentContent = activeFile ? (files[activeFile]?.content ?? "") : "";
  const currentLanguage = activeFile ? getLanguageFromExtension(activeFile) : "plaintext";
  
  activeFileRef.current = activeFile;
  filesRef.current = files;

  // Deterministic color assignment based on userId hash
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
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % colors.length;
    const color = colors[index];

    return color;
  }

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
    const userId = m._id || m.userId || m;
    const username = m.username || m;
    memberMap.set(userId, username);
  });
  
  // Add creator to map
  if (roomCreator?._id) {
    memberMap.set(roomCreator._id, roomCreator.username || user?.username || "Creator");
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
        const res = await api.get(`/api/rooms/${roomId}`);
        setRoom(res.data);
        localStorage.setItem("syncscript_active_roomId", roomId);

        const loaded = filesFromApi(res.data.files);
        setFiles(loaded);
        filesRef.current = loaded;

        const originals: Record<string, string> = {};
        for (const node of Object.values(loaded)) {
          if (node.type === "file") originals[node.path] = node.content ?? "";
        }
        originalContents.current = originals;

        const firstFile = Object.values(loaded).find((n) => n.type === "file")?.path ?? null;
        setActiveFile(firstFile);
        setOpenTabs(firstFile ? [firstFile] : []);
        setExplorerSelection(firstFile);
        workspaceReadyRef.current = true;
      } catch (err) {
        console.error("Failed to fetch room details", err);
      } finally {
        setLoading(false);
      }
    }
    loadRoom();
  }, [roomId]);

  const persistFiles = useCallback(
    (nextFiles: FileSystem, immediate = false) => {
      if (!workspaceReadyRef.current) return;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const write = () => {
        api.put(`/api/rooms/${roomId}/files`, { files: serializeFiles(nextFiles) }).catch((err) => {
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
    setOnlineUsers(prev => {
      const next = new Set([...prev, userId]);
      return next;
    });
  }, []);

  const handleUserLeft = useCallback((payload: { userId: string; username: string }) => {
    const { userId } = payload;
    if (!userId) return;
    setOnlineUsers(prev => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    // Remove cursor for this user
    setRemoteCursors(prev => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const handleOnlineUsers = useCallback((users: { userId: string; username: string }[]) => {
    if (!users || users.length === 0) return;
    const userIds = new Set(users.map(u => u.userId));
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

  const { 
    emitFileChange, 
    emitFileCreated,
    emitFileRenamed,
    emitFileDeleted,
    emitFolderCreated,
    emitFolderRenamed,
    emitFolderDeleted,
    emitCursorMove,
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
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onOnlineUsers: handleOnlineUsers,
    onCursorUpdate: handleCursorUpdate,
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

      // Remote CODE_UPDATE already applied to state; ignore Monaco echo
      // Do NOT clear the flag here — applyRemoteFileChange clears it after setPosition
      if (isRemoteUpdate.current) {
        return;
      }

      // Read content directly from the editor's model instead of relying on the value parameter
      const newContent = editorRef.current?.getValue() ?? "";
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

      if (!isRemoteUpdate.current) {
        emitFileChange(activeFile, newContent);
      }
    },
    [activeFile, emitFileChange],
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
        // console.log(`CURSOR_POSITION_CHANGED line=${e.position?.lineNumber} col=${e.position?.column} isRemote=${isRemoteUpdate.current} reason=${Number(e.reason)}`);
        if (isRemoteUpdate.current) return;
        const position = e.position;
        if (position) {
          localCursorLineRef.current = position.lineNumber;
          if (activeFileRef.current) {
            emitCursorMove(activeFileRef.current, { lineNumber: position.lineNumber, column: position.column });
          }
        }
      });
    },
    [emitCursorMove, attachModelToEditor]
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
      });
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

            {/* Editor header bar — file info + language + modified status + Run button */}
            {activeFile && (
              <div className="flex items-center justify-between h-8 px-4 bg-[#0d1117] border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-3">
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

                {/* Editor Actions: Run Code & Toggle Output */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunCode}
                    disabled={isExecuting}
                    title="Run Code (Ctrl+Enter / Cmd+Enter / F5)"
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all shadow-sm ${
                      isExecuting
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-wait"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 active:scale-95 cursor-pointer"
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[15px] ${isExecuting ? "animate-spin" : ""}`}>
                      {isExecuting ? "sync" : "play_arrow"}
                    </span>
                    <span>{isExecuting ? "Running..." : "Run"}</span>
                  </button>

                  <button
                    onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
                    title={isBottomPanelOpen ? "Hide Bottom Panel" : "Show Bottom Panel"}
                    className={`p-1 rounded text-outline hover:text-on-surface hover:bg-white/5 transition-colors flex items-center ${
                      isBottomPanelOpen ? "text-primary" : ""
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">terminal</span>
                  </button>
                </div>
              </div>
            )}

            {/* Monaco Editor Container - kept permanently mounted to avoid disposed model errors and expensive re-initializations */}
            <div className="flex-1 overflow-hidden monaco-editor-wrapper relative" ref={editorContainerRef}>
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
              {!activeFile && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-outline-variant bg-editor-bg z-10">
                  <span className="material-symbols-outlined text-5xl mb-4 text-white/5">code</span>
                  <p className="text-sm">Select or create a file to edit</p>
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
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs custom-scrollbar bg-editor-bg">
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

                  {bottomPanelTab === "terminal" && (
                    <div className="font-code-sm text-on-surface">
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
                  )}

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

          {/* ── Right Sidebar: Live Chat ───────────────────────────────────── */}
          <aside className="w-72 bg-sidebar-bg border-l border-white/5 flex flex-col">
            {/* Top padding so fixed floating action buttons (z-50, top-3) never overlap this header */}
            <div className="h-10 flex-shrink-0" />
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

        {/* Floating action buttons + AI Copilot (unchanged sub-components) */}
        <RoomFloatingActions roomId={roomId} onSave={handleSave} onlineCount={onlineCount} />
        <AICopilot roomId={roomId} />
      </div>
    </AppShell>
  );
}

// ── RoomFloatingActions ────────────────────────────────────────────────────
function RoomFloatingActions({
  roomId,
  onSave,
  onlineCount,
}: {
  roomId: string;
  onSave: () => void;
  onlineCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setInviteStatus(null);
    try {
      const res = await api.post("/api/invitations/send", {
        roomId,
        inviteeEmail: trimmed,
      });
      setInviteStatus({ type: "success", message: res.data.message || "Invitation sent!" });
      setEmail("");
    } catch (err: any) {
      setInviteStatus({
        type: "error",
        message: err.response?.data?.message || "Failed to send invitation.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed top-3 right-4 z-50 flex flex-wrap items-center justify-end gap-2 max-w-[calc(100vw-2rem)]">
      <span className="px-3 py-1.5 rounded-md bg-[#1d2026] border border-white/10 text-xs font-semibold text-[#adc6ff]">
        Online: {onlineCount}
      </span>
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
        onClick={() => { setOpen((o) => !o); setInviteStatus(null); }}
        className="px-3 py-1.5 rounded-md bg-[#3B82F6] hover:bg-[#2563eb] text-white text-xs font-bold flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[16px]" style={{ color: "white" }}>
          person_add
        </span>
        Invite
      </button>
      {open && (
        <form
          onSubmit={sendInvite}
          className="absolute top-12 right-0 w-72 p-4 rounded-xl bg-[#0F1219] border border-white/10 shadow-2xl space-y-2"
        >
          <div className="text-sm font-semibold">Invite collaborator</div>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full bg-[#0B0E14] border border-white/10 rounded-md px-3 py-2 text-sm focus:border-[#3B82F6] outline-none"
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
            disabled={sending}
            className="w-full px-3 py-2 rounded-md bg-[#3B82F6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2"
          >
            {sending && <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>}
            {sending ? "Sending..." : "Send invite"}
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
