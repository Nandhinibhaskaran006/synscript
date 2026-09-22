import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

type UseRoomSocketOptions = {
  roomId: string;
  username: string;
  enabled?: boolean;
  /** Per-file update: called when CODE_UPDATE fires */
  onFileChange?: (payload: { filePath: string; content: string }) => void;
  /** Live user count update */
  onUsersChange?: (count: number) => void;
  onRoomJoined?: (payload: { roomId: string }) => void;
  onError?: (message: string) => void;
  /** File/folder operations */
  onFileCreated?: (payload: { file: { path: string; name: string; type: string; content?: string } }) => void;
  onFileRenamed?: (payload: { oldPath: string; newPath: string; newName: string }) => void;
  onFileDeleted?: (payload: { path: string }) => void;
  onFolderCreated?: (payload: { folder: { path: string; name: string; type: string } }) => void;
  onFolderRenamed?: (payload: { oldPath: string; newPath: string; newName: string }) => void;
  onFolderDeleted?: (payload: { path: string }) => void;
  /** Presence events */
  onUserJoined?: (payload: { userId: string; username: string }) => void;
  onUserLeft?: (payload: { userId: string; username: string }) => void;
  onOnlineUsers?: (users: { userId: string; username: string }[]) => void;
  /** Workspace File System Sync */
  onWorkspaceFilesSync?: (files: Array<{ path: string; name: string; type: string; content?: string; isOpen?: boolean }>) => void;
  /** Terminal events */
  onTerminalOutput?: (payload: { terminalId?: string; data: string }) => void;
  /** Chat events */
  onChatMessage?: (payload: {
    _id?: string;
    roomId?: string;
    senderId?: string;
    userId?: string;
    sender?: string;
    senderUsername?: string;
    username?: string;
    senderName?: string;
    senderAvatar?: string;
    avatar?: string;
    message?: string;
    text?: string;
    createdAt?: string;
  }) => void;
};

export function useRoomSocket({
  roomId,
  username,
  enabled = true,
  onFileChange,
  onUsersChange,
  onRoomJoined,
  onError,
  onFileCreated,
  onFileRenamed,
  onFileDeleted,
  onFolderCreated,
  onFolderRenamed,
  onFolderDeleted,
  onUserJoined,
  onUserLeft,
  onOnlineUsers,
  onCursorUpdate,
  onWorkspaceFilesSync,
  onTerminalOutput,
  onChatMessage,
}: UseRoomSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);

  const onFileChangeRef = useRef(onFileChange);
  const onUsersChangeRef = useRef(onUsersChange);
  const onRoomJoinedRef = useRef(onRoomJoined);
  const onErrorRef = useRef(onError);
  const onFileCreatedRef = useRef(onFileCreated);
  const onFileRenamedRef = useRef(onFileRenamed);
  const onFileDeletedRef = useRef(onFileDeleted);
  const onFolderCreatedRef = useRef(onFolderCreated);
  const onFolderRenamedRef = useRef(onFolderRenamed);
  const onFolderDeletedRef = useRef(onFolderDeleted);
  const onUserJoinedRef = useRef(onUserJoined);
  const onUserLeftRef = useRef(onUserLeft);
  const onOnlineUsersRef = useRef(onOnlineUsers);
  const onCursorUpdateRef = useRef(onCursorUpdate);
  const onWorkspaceFilesSyncRef = useRef(onWorkspaceFilesSync);
  const onTerminalOutputRef = useRef(onTerminalOutput);
  const onChatMessageRef = useRef(onChatMessage);

  onFileChangeRef.current = onFileChange;
  onUsersChangeRef.current = onUsersChange;
  onRoomJoinedRef.current = onRoomJoined;
  onErrorRef.current = onError;
  onFileCreatedRef.current = onFileCreated;
  onFileRenamedRef.current = onFileRenamed;
  onFileDeletedRef.current = onFileDeleted;
  onFolderCreatedRef.current = onFolderCreated;
  onFolderRenamedRef.current = onFolderRenamed;
  onFolderDeletedRef.current = onFolderDeleted;
  onUserJoinedRef.current = onUserJoined;
  onUserLeftRef.current = onUserLeft;
  onOnlineUsersRef.current = onOnlineUsers;
  onCursorUpdateRef.current = onCursorUpdate;
  onWorkspaceFilesSyncRef.current = onWorkspaceFilesSync;
  onTerminalOutputRef.current = onTerminalOutput;
  onChatMessageRef.current = onChatMessage;

  /** Emit per-file CODE_CHANGE from local edits only */
  const emitFileChange = useCallback(
    (filePath: string, content: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;

      console.log("CODE_CHANGE", { roomId, filePath, contentLen: content.length });
      socket.emit("CODE_CHANGE", { roomId, filePath, content });
    },
    [roomId],
  );

  /** Emit file/folder operations */
  const emitFileCreated = useCallback(
    (file: { path: string; name: string; type: string; content?: string }) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      console.log("FILE_CREATED", { roomId, file });
      socket.emit("FILE_CREATED", { roomId, file });
    },
    [roomId],
  );

  const emitFileRenamed = useCallback(
    (oldPath: string, newPath: string, newName: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      console.log("FILE_RENAMED", { roomId, oldPath, newPath, newName });
      socket.emit("FILE_RENAMED", { roomId, oldPath, newPath, newName });
    },
    [roomId],
  );

  const emitFileDeleted = useCallback(
    (path: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      console.log("FILE_DELETED", { roomId, path });
      socket.emit("FILE_DELETED", { roomId, path });
    },
    [roomId],
  );

  const emitFolderCreated = useCallback(
    (folder: { path: string; name: string; type: string }) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      console.log("FOLDER_CREATED", { roomId, folder });
      socket.emit("FOLDER_CREATED", { roomId, folder });
    },
    [roomId],
  );

  const emitFolderRenamed = useCallback(
    (oldPath: string, newPath: string, newName: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      console.log("FOLDER_RENAMED", { roomId, oldPath, newPath, newName });
      socket.emit("FOLDER_RENAMED", { roomId, oldPath, newPath, newName });
    },
    [roomId],
  );

  const emitFolderDeleted = useCallback(
    (path: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      console.log("FOLDER_DELETED", { roomId, path });
      socket.emit("FOLDER_DELETED", { roomId, path });
    },
    [roomId],
  );

  // Throttled cursor emit
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emitCursorMove = useCallback(
    (filePath: string, position: { lineNumber: number; column: number }) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      
      if (cursorThrottleRef.current) {
        clearTimeout(cursorThrottleRef.current);
      }
      
      cursorThrottleRef.current = setTimeout(() => {
        console.log("CURSOR_MOVE", { roomId, filePath, position });
        socket.emit("CURSOR_MOVE", { roomId, filePath, position });
        cursorThrottleRef.current = null;
      }, 100);
    },
    [roomId],
  );

  const emitSendMessage = useCallback(
    (message: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      if (!message || !message.trim()) return;
      socket.emit("send-message", { roomId, message: message.trim() });
    },
    [roomId]
  );

  /** Emit terminal commands with multi-tab support */
  const emitTerminalStart = useCallback(
    (cols?: number, rows?: number, roomName?: string, terminalId: string = "1") => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      console.log("terminal:start", { roomId, cols, rows, roomName, terminalId });
      socket.emit("terminal:start", { roomId, cols, rows, roomName, terminalId });
    },
    [roomId]
  );

  const emitTerminalInput = useCallback(
    (data: string, terminalId: string = "1") => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("terminal:input", { roomId, terminalId, data });
    },
    [roomId]
  );

  const emitTerminalResize = useCallback(
    (cols: number, rows: number, terminalId: string = "1") => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      socket.emit("terminal:resize", { roomId, terminalId, cols, rows });
    },
    [roomId]
  );

  const emitTerminalClose = useCallback((terminalId?: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("terminal:close", { roomId, terminalId });
  }, [roomId]);

  useEffect(() => {
    if (!enabled || !roomId || !username) return;

    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token, username },
      autoConnect: true,
    });
    socketRef.current = socket;

    const handleConnect = () => {
      console.log("JOIN_ROOM", { roomId, username });
      socket.emit("JOIN_ROOM", { roomId, username });
    };

    const handleCodeUpdate = ({ filePath, content }: { filePath: string; content: string }) => {
      console.log("CODE_UPDATE", { filePath, contentLen: content?.length ?? 0 });
      onFileChangeRef.current?.({ filePath, content });
    };

    const handleRoomUsers = (users: { userId: string; username: string }[]) => {
      if (!Array.isArray(users)) return;
      const uniqueMap = new Map<string, { userId: string; username: string }>();
      for (const u of users) {
        if (u && u.userId) {
          uniqueMap.set(String(u.userId), u);
        }
      }
      const uniqueList = Array.from(uniqueMap.values());
      const count = uniqueList.length;
      setOnlineCount(count);
      onUsersChangeRef.current?.(count);
      onOnlineUsersRef.current?.(uniqueList);
    };

    const handleOnlineCount = ({ count }: { count: number }) => {
      const validCount = typeof count === "number" ? Math.max(0, count) : 0;
      setOnlineCount(validCount);
      onUsersChangeRef.current?.(validCount);
    };

    const handleRoomJoined = (payload: { roomId: string }) => {
      onRoomJoinedRef.current?.(payload);
    };

    const handleFileCreated = (payload: { file: { path: string; name: string; type: string; content?: string } }) => {
      console.log("FILE_CREATED received", payload);
      onFileCreatedRef.current?.(payload);
    };

    const handleFileRenamed = (payload: { oldPath: string; newPath: string; newName: string }) => {
      console.log("FILE_RENAMED received", payload);
      onFileRenamedRef.current?.(payload);
    };

    const handleFileDeleted = (payload: { path: string }) => {
      console.log("FILE_DELETED received", payload);
      onFileDeletedRef.current?.(payload);
    };

    const handleFolderCreated = (payload: { folder: { path: string; name: string; type: string } }) => {
      console.log("FOLDER_CREATED received", payload);
      onFolderCreatedRef.current?.(payload);
    };

    const handleFolderRenamed = (payload: { oldPath: string; newPath: string; newName: string }) => {
      console.log("FOLDER_RENAMED received", payload);
      onFolderRenamedRef.current?.(payload);
    };

    const handleFolderDeleted = (payload: { path: string }) => {
      console.log("FOLDER_DELETED received", payload);
      onFolderDeletedRef.current?.(payload);
    };

    const handleUserJoined = (payload: { userId: string; username: string }) => {
      console.log("🔔 USER_JOINED received", payload);
      onUserJoinedRef.current?.(payload);
    };

    const handleUserLeft = (payload: { userId: string; username: string }) => {
      console.log("🔔 USER_LEFT received", payload);
      onUserLeftRef.current?.(payload);
    };

    const handleOnlineUsers = (users: { userId: string; username: string }[]) => {
      console.log("🔔 ONLINE_USERS received", users);
      if (!Array.isArray(users)) return;
      const uniqueMap = new Map<string, { userId: string; username: string }>();
      for (const u of users) {
        if (u && u.userId) {
          uniqueMap.set(String(u.userId), u);
        }
      }
      const uniqueList = Array.from(uniqueMap.values());
      const count = uniqueList.length;
      setOnlineCount(count);
      onUsersChangeRef.current?.(count);
      onOnlineUsersRef.current?.(uniqueList);
    };

    const handleCursorUpdate = (payload: { userId: string; filePath: string; position: { lineNumber: number; column: number } }) => {
      onCursorUpdateRef.current?.(payload);
    };

    const handleReceiveMessage = (payload: any) => {
      console.log("🔔 receive-message received", payload);
      onChatMessageRef.current?.(payload);
    };

    const handleTerminalOutput = (payload: { terminalId?: string; data: string }) => {
      onTerminalOutputRef.current?.(payload);
    };

    const handleWorkspaceFilesSync = (payload: any) => {
      console.log("📂 WORKSPACE_FILES_SYNC received", payload);
      const list = Array.isArray(payload) ? payload : payload?.files;
      if (Array.isArray(list)) {
        onWorkspaceFilesSyncRef.current?.(list);
      }
    };

    const handleDisconnect = () => {
      console.log("DISCONNECT");
    };

    const handleError = ({ message }: { message: string }) => {
      onErrorRef.current?.(message);
    };

    socket.on("connect", handleConnect);
    socket.on("CODE_UPDATE", handleCodeUpdate);
    socket.on("room-users", handleRoomUsers);
    socket.on("ONLINE_COUNT", handleOnlineCount);
    socket.on("room-joined", handleRoomJoined);
    socket.on("FILE_CREATED", handleFileCreated);
    socket.on("FILE_RENAMED", handleFileRenamed);
    socket.on("FILE_DELETED", handleFileDeleted);
    socket.on("FOLDER_CREATED", handleFolderCreated);
    socket.on("FOLDER_RENAMED", handleFolderRenamed);
    socket.on("FOLDER_DELETED", handleFolderDeleted);
    socket.on("USER_JOINED", handleUserJoined);
    socket.on("USER_LEFT", handleUserLeft);
    socket.on("ONLINE_USERS", handleOnlineUsers);
    socket.on("CURSOR_UPDATE", handleCursorUpdate);
    socket.on("receive-message", handleReceiveMessage);
    socket.on("terminal:output", handleTerminalOutput);
    socket.on("WORKSPACE_FILES_SYNC", handleWorkspaceFilesSync);
    socket.on("disconnect", handleDisconnect);
    socket.on("error", handleError);

    return () => {
      console.log("LEAVE_ROOM", roomId);
      socket.emit("LEAVE_ROOM", roomId);
      socket.off("connect", handleConnect);
      socket.off("CODE_UPDATE", handleCodeUpdate);
      socket.off("room-users", handleRoomUsers);
      socket.off("ONLINE_COUNT", handleOnlineCount);
      socket.off("room-joined", handleRoomJoined);
      socket.off("FILE_CREATED", handleFileCreated);
      socket.off("FILE_RENAMED", handleFileRenamed);
      socket.off("FILE_DELETED", handleFileDeleted);
      socket.off("FOLDER_CREATED", handleFolderCreated);
      socket.off("FOLDER_RENAMED", handleFolderRenamed);
      socket.off("FOLDER_DELETED", handleFolderDeleted);
      socket.off("USER_JOINED", handleUserJoined);
      socket.off("USER_LEFT", handleUserLeft);
      socket.off("ONLINE_USERS", handleOnlineUsers);
      socket.off("CURSOR_UPDATE", handleCursorUpdate);
      socket.off("receive-message", handleReceiveMessage);
      socket.off("terminal:output", handleTerminalOutput);
      socket.off("WORKSPACE_FILES_SYNC", handleWorkspaceFilesSync);
      socket.off("disconnect", handleDisconnect);
      socket.off("error", handleError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, username, enabled]);

  return { 
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
    onlineCount,
    socketRef,
  };
}
