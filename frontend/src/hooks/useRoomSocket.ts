import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const CODE_CHANGE_DEBOUNCE_MS = 300;

type UseRoomSocketOptions = {
  roomId: string;
  username: string;
  enabled?: boolean;
  /** Legacy: called when receive-code-change fires (single shared doc) */
  onCodeChange?: (code: string) => void;
  /** Per-file update: called when CODE_UPDATE fires */
  onFileChange?: (payload: { filePath: string; content: string }) => void;
  /** Live user count update */
  onUsersChange?: (count: number) => void;
  onRoomJoined?: (payload: { roomId: string }) => void;
  onError?: (message: string) => void;
};

export function useRoomSocket({
  roomId,
  username,
  enabled = true,
  onCodeChange,
  onFileChange,
  onUsersChange,
  onRoomJoined,
  onError,
}: UseRoomSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);

  const onCodeChangeRef = useRef(onCodeChange);
  const onFileChangeRef = useRef(onFileChange);
  const onUsersChangeRef = useRef(onUsersChange);
  const onRoomJoinedRef = useRef(onRoomJoined);
  const onErrorRef = useRef(onError);

  onCodeChangeRef.current = onCodeChange;
  onFileChangeRef.current = onFileChange;
  onUsersChangeRef.current = onUsersChange;
  onRoomJoinedRef.current = onRoomJoined;
  onErrorRef.current = onError;

  /** Emit per-file CODE_CHANGE (debounced) */
  const emitFileChange = useCallback(
    (filePath: string, content: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        console.log("[Socket] CODE_CHANGE emitted", { filePath, contentLen: content.length });
        socket.emit("CODE_CHANGE", { roomId, filePath, content });
      }, CODE_CHANGE_DEBOUNCE_MS);
    },
    [roomId],
  );

  /** Legacy: emit code-change for single shared doc (kept for backward compat) */
  const emitCodeChange = useCallback(
    (code: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        socket.emit("code-change", { roomId, code });
      }, CODE_CHANGE_DEBOUNCE_MS);
    },
    [roomId],
  );

  useEffect(() => {
    if (!enabled || !roomId || !username) return;

    const token =
      typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
    });
    socketRef.current = socket;

    const handleConnect = () => {
      console.log("[Socket] JOIN_ROOM →", roomId);
      socket.emit("JOIN_ROOM", { roomId, username });
      // Also emit legacy join-room for backward compat
      socket.emit("join-room", { roomId, username });
    };

    const handleReceiveCodeChange = ({ code }: { code: string }) => {
      onCodeChangeRef.current?.(code ?? "");
    };

    const handleCodeUpdate = ({ filePath, content }: { filePath: string; content: string }) => {
      console.log("[Socket] CODE_UPDATE received", { filePath, contentLen: content.length });
      onFileChangeRef.current?.({ filePath, content });
    };

    const handleRoomUsers = (users: { userId: string; username: string }[]) => {
      const count = users.length;
      console.log("[Socket] room-users →", count, "online");
      setOnlineCount(count);
      onUsersChangeRef.current?.(count);
    };

    const handleOnlineCount = ({ count }: { count: number }) => {
      console.log("[Socket] ONLINE_COUNT →", count);
      setOnlineCount(count);
      onUsersChangeRef.current?.(count);
    };

    const handleRoomJoined = (payload: { roomId: string }) => {
      onRoomJoinedRef.current?.(payload);
    };

    const handleDisconnect = () => {
      console.log("[Socket] DISCONNECT");
    };

    const handleError = ({ message }: { message: string }) => {
      onErrorRef.current?.(message);
    };

    socket.on("connect", handleConnect);
    socket.on("receive-code-change", handleReceiveCodeChange);
    socket.on("CODE_UPDATE", handleCodeUpdate);
    socket.on("room-users", handleRoomUsers);
    socket.on("ONLINE_COUNT", handleOnlineCount);
    socket.on("room-joined", handleRoomJoined);
    socket.on("disconnect", handleDisconnect);
    socket.on("error", handleError);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      console.log("[Socket] LEAVE_ROOM cleanup");
      socket.emit("LEAVE_ROOM", { roomId });
      socket.off("connect", handleConnect);
      socket.off("receive-code-change", handleReceiveCodeChange);
      socket.off("CODE_UPDATE", handleCodeUpdate);
      socket.off("room-users", handleRoomUsers);
      socket.off("ONLINE_COUNT", handleOnlineCount);
      socket.off("room-joined", handleRoomJoined);
      socket.off("disconnect", handleDisconnect);
      socket.off("error", handleError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, username, enabled]);

  return { emitCodeChange, emitFileChange, onlineCount };
}
