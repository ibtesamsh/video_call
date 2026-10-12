const { v4: uuidv4 } = require("uuid");

const rooms = new Map();

const createRoom = () => {
  const roomId = uuidv4();

  rooms.set(roomId, {
    roomId,
    createdAt: new Date(),
    participants: new Set(),
  });

  return roomId;
};

const getRoom = (roomId) => {
  return rooms.get(roomId);
};

const deleteRoom = (roomId) => {
  rooms.delete(roomId);
};

module.exports = {
  createRoom,
  getRoom,
  deleteRoom,
};