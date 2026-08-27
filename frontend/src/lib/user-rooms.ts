// Local persistence for user-created rooms + invites
export type UserRoom = {
  id: string;
  name: string;
  lang: string;
  members: string[];
  capacity: number;
  createdAt: number;
};

const ROOMS_KEY = "syncscript_user_rooms";
const INVITES_RECV_KEY = "syncscript_invites_received";
const INVITES_SENT_KEY = "syncscript_invites_sent";

function read<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(k) ?? "") as T; } catch { return fallback; }
}
function write<T>(k: string, v: T) {
  if (typeof window !== "undefined") window.localStorage.setItem(k, JSON.stringify(v));
}

export function getUserRooms(): UserRoom[] { return read<UserRoom[]>(ROOMS_KEY, []); }
export function addUserRoom(r: UserRoom) { write(ROOMS_KEY, [r, ...getUserRooms()]); }
export function addMemberToRoom(id: string, name: string) {
  const list = getUserRooms().map(r => r.id === id && !r.members.includes(name) ? { ...r, members: [...r.members, name] } : r);
  write(ROOMS_KEY, list);
}

export type Invite = { id: string; from: string; to: string; roomId: string; roomName: string; status: "pending" | "accepted" | "declined"; createdAt: number };

export function getReceivedInvites(): Invite[] {
  const seed: Invite[] = read(INVITES_RECV_KEY, [
    { id: "inv-1", from: "Sarah Chen", to: "you", roomId: "auth-microservice", roomName: "auth-microservice", status: "pending", createdAt: Date.now() - 3600_000 },
    { id: "inv-2", from: "Devon Lee", to: "you", roomId: "go-scraper", roomName: "go-scraper", status: "pending", createdAt: Date.now() - 86400_000 },
  ]);
  if (typeof window !== "undefined" && !window.localStorage.getItem(INVITES_RECV_KEY)) write(INVITES_RECV_KEY, seed);
  return seed;
}
export function updateReceivedInvite(id: string, status: Invite["status"]) {
  write(INVITES_RECV_KEY, getReceivedInvites().map(i => i.id === id ? { ...i, status } : i));
}
export function getSentInvites(): Invite[] { return read<Invite[]>(INVITES_SENT_KEY, []); }
export function addSentInvite(i: Invite) { write(INVITES_SENT_KEY, [i, ...getSentInvites()]); }
