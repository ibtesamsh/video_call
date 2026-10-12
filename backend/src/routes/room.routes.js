const express = require("express");

const { createRoom, getRoom } = require("../services/room.service");

const router = express.Router();

// Create a new room
router.post("/", (req, res) => {
  const roomId = createRoom();

  res.status(201).json({
    success: true,
    roomId,
  });
});

// Get room
router.get("/:roomId", (req, res) => {
  const { roomId } = req.params;

  const room = getRoom(roomId);

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found",
    });
  }

  res.json({
    success: true,
    roomId: room.roomId,
  });
});

module.exports = router;
