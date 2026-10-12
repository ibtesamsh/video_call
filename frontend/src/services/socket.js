import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL;

const socket = io(SOCKET_URL, {
  autoConnect: false,
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};

export default socket;
