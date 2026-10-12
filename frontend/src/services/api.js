const API_URL = import.meta.env.VITE_BACKEND_URL;

export const createRoom = async () => {
  const response = await fetch(`${API_URL}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to create room");
  }

  return response.json();
};

export const getRoom = async (roomId) => {
  const response = await fetch(`${API_URL}/api/rooms/${roomId}`);

  if (!response.ok) {
    throw new Error("Room not found");
  }

  return response.json();
};

export const checkRoomExists = async (roomId) => {
  const res = await fetch(`${API_URL}/api/rooms/${roomId}`);

  if (!res.ok) {
    return false;
  }

  const data = await res.json();
  return !!data?.success;
};
