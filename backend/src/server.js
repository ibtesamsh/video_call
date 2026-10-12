require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { getRoom, deleteRoom } = require("./services/room.service");
const roomRoutes = require("./routes/room.routes");

const app = express();
const server = http.createServer(app);

const allowedOrigins = (
  process.env.FRONTEND_URL || "http://localhost:5173"
)
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""));


const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());
app.use("/api/rooms", roomRoutes);

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Video call backend is running",
  });
});

// Shared cleanup used by both explicit "leave-room" and disconnects
function leaveRoom(io, socket, roomId) {
  const room = getRoom(roomId);

  if (!room) return;

  if (!room.participants.has(socket.id)) return;

  room.participants.delete(socket.id);

  // Tell the remaining participant(s) this peer is gone
  socket.to(roomId).emit("user-disconnected", {
    socketId: socket.id,
  });

  socket.leave(roomId);

  console.log(`Socket ${socket.id} left room ${roomId}`);

  if (room.participants.size === 0) {
    deleteRoom(roomId);
    console.log(`Room ${roomId} is empty — destroyed`);
  }
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-room", ({ roomId }) => {
    console.log(`Socket ${socket.id} wants to join room ${roomId}`);

    const room = getRoom(roomId);

    if (!room) {
      socket.emit("room-error", {
        message: "Room not found",
      });

      return;
    }

    if (room.participants.has(socket.id)) {
      console.log(`Socket ${socket.id} is already in room ${roomId}`);

      socket.emit("room-joined", {
        roomId,
        socketId: socket.id,
        participants: Array.from(room.participants),
      });

      return;
    }

    const existingUsers = room.participants;

    socket.join(roomId);

    existingUsers.forEach((userId) => {
      io.to(userId).emit("user-connected", {
        socketId: socket.id,
      });
    });

    existingUsers.add(socket.id);

    console.log(`Socket ${socket.id} joined room ${roomId}`);

    socket.emit("room-joined", {
      roomId,
      socketId: socket.id,
      participants: Array.from(existingUsers),
    });
  });

  socket.on("offer", ({ roomId, offer }) => {
    console.log(`Offer received from ${socket.id}`);

    socket.to(roomId).emit("offer", {
      offer,
      senderId: socket.id,
    });
  });

  socket.on("answer", ({ roomId, answer, targetSocketId }) => {
    console.log(`Answer received from ${socket.id}`);

    io.to(targetSocketId).emit("answer", {
      answer,
      senderId: socket.id,
    });
  });

  socket.on("ice-candidate", ({ roomId, candidate, targetSocketId }) => {
    console.log(`ICE candidate received from ${socket.id}`);

    io.to(targetSocketId).emit("ice-candidate", {
      candidate,
      senderId: socket.id,
    });
  });

  // Explicit "End Call" button — clean leave, no need to wait for a timeout
  socket.on("leave-room", ({ roomId }) => {
    console.log(`Socket ${socket.id} explicitly left room ${roomId}`);
    leaveRoom(io, socket, roomId);
  });

  // Tab closed, network dropped, browser crashed, etc.
  // "disconnecting" fires BEFORE socket.rooms is cleared, so we can
  // still see which room(s) this socket was in.
  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue; // skip the socket's own private room
      leaveRoom(io, socket, roomId);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
