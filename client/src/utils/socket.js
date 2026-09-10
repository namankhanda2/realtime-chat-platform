import { io } from "socket.io-client";
import { getTokens } from "./api";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  const { access } = getTokens();
  socket = io("/", {
    autoConnect: false,
    auth: (cb) => cb({ token: access || getTokens().access }),
    transports: ["websocket", "polling"],
  });
  return socket;
}

export function destroySocket() {
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
}