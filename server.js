// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const { v4: uuidv4 } = require('uuid');

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server);

// // Serve static frontend
// app.use(express.static('public'));

// // API endpoint to generate a new room ID
// app.get('/generate-room', (req, res) => {
//   const roomId = uuidv4();
//   res.send({ roomId });
// });

// // Socket.IO signaling logic
// io.on('connection', socket => {
//   socket.on('join-room', roomId => {
//     socket.join(roomId);
//     socket.to(roomId).emit('user-connected');

//     socket.on('offer', offer => {
//       socket.to(roomId).emit('offer', offer);
//     });

//     socket.on('answer', answer => {
//       socket.to(roomId).emit('answer', answer);
//     });

//     socket.on('ice-candidate', candidate => {
//       socket.to(roomId).emit('ice-candidate', candidate);
//     });

//     socket.on('disconnect', () => {
//       socket.to(roomId).emit('user-disconnected');
//     });
//   });
// });

// // Start server on LAN IP
// const PORT = 3000;
// const LAN_IP = '192.168.0.141'; // Replace with your actual LAN IP if needed
// server.listen(PORT, LAN_IP, () => {
//   console.log(`🚀 Server running at http://${LAN_IP}:${PORT}`);
// });


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Keep track of active rooms
const rooms = {};

app.get('/generate-room', (req, res) => {
  const roomId = uuidv4();
  rooms[roomId] = true;  // Mark room as active
  res.send({ roomId });
});

// Serve the room page only if room exists and active
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (rooms[roomId]) {
    res.sendFile(__dirname + '/public/index.html');
  } else {
    res.status(404).send('Room expired or does not exist.');
  }
});

io.on('connection', socket => {
  let currentRoom = null;

  socket.on('join-room', roomId => {
    if (!rooms[roomId]) {
      socket.emit('room-expired');
      return;
    }
    currentRoom = roomId;
    socket.join(roomId);
    socket.to(roomId).emit('user-connected');

    socket.on('offer', offer => {
      socket.to(roomId).emit('offer', offer);
    });

    socket.on('answer', answer => {
      socket.to(roomId).emit('answer', answer);
    });

    socket.on('ice-candidate', candidate => {
      socket.to(roomId).emit('ice-candidate', candidate);
    });

    socket.on('end-call', () => {
      // Inform others and expire room
      socket.to(roomId).emit('force-disconnect');
      delete rooms[roomId];
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected');
    });
  });
});

const PORT = 3000;
const LAN_IP = '192.168.0.141';
server.listen(PORT, LAN_IP, () => {
  console.log(`🚀 Server running at http://${LAN_IP}:${PORT}`);
});

