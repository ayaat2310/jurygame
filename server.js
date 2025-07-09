const express = require('express');
const socketIO = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = require('http').createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Multer setup for GM file uploads
const upload = multer({ dest: 'public/uploads/' });
app.use(express.static('public'));

// Game state
const gameState = {
  players: [],
  phase: 'waiting',
  timer: 7200, // 2 hours in seconds
  roles: []
};

// Assign roles (4 Guilty, 4 Not Guilty, 4 Neutral)
function assignRoles() {
  const roles = [];
  for (let i = 0; i < 4; i++) roles.push('guilty', 'not_guilty', 'neutral');
  return roles.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Player joins
  socket.on('join', (username) => {
    const isGM = username.toLowerCase() === 'ayaatgm';
    const player = { id: socket.id, username, isGM, jurorNumber: gameState.players.length + 1 };
    
    if (isGM) {
      gameState.roles = assignRoles();
      player.role = 'gm';
    } else if (gameState.players.length < 12) {
      player.role = gameState.roles.pop();
    } else {
      socket.emit('error', 'Room full (max 12 jurors)');
      return;
    }

    gameState.players.push(player);
    io.emit('playerUpdate', gameState.players);
    socket.emit('roleAssigned', { jurorNumber: player.jurorNumber, role: player.role });

    if (gameState.players.length === 13) {
      io.emit('systemMessage', 'Court is in session!');
    }
  });

  // GM controls
  socket.on('startGame', () => {
    gameState.phase = 'overview';
    io.emit('phaseChange', gameState.phase);
  });

  socket.on('nextPhase', () => {
    // Phase rotation logic here
    io.emit('phaseChange', gameState.phase);
  });

  // File upload (GM only)
  socket.on('uploadEvidence', upload.single('evidence'), (file) => {
    if (file) {
      io.emit('newEvidence', { name: file.originalname, path: `/uploads/${file.filename}` });
    }
  });

  // Chat
  socket.on('sendMessage', (msg) => {
    io.emit('newMessage', { user: msg.user, text: msg.text });
  });

  socket.on('disconnect', () => {
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    io.emit('playerUpdate', gameState.players);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
