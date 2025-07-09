// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Multer setup for GM uploads only
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  res.send('File uploaded!');
});

// State
let players = [];  // { socketId, username, jurorNumber, role, votes: [] }
let gmId = null;
let rolesPool = [
  ...Array(4).fill('Guilty Jury'),
  ...Array(4).fill('Not Guilty Jury'),
  ...Array(4).fill('Neutral Jury')
];
let votes = [];
let phaseIndex = -1;
let timer = null;
let timeLeft = 7200; // 2 hours in seconds
const phases = [
  "Case Overview",
  "Evidence Selection & Voting",
  "Evidence Showcase",
  "Discussion & Vote",
  "Final Vote"
];

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('join', (username) => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phases, players });
    } else {
      if (rolesPool.length === 0) {
        socket.emit('full');
        return;
      }
      const jurorNumber = players.length + 1;
      const idx = Math.floor(Math.random() * rolesPool.length);
      const role = rolesPool.splice(idx, 1)[0];
      const player = { socketId: socket.id, username, jurorNumber, role, votes: [] };
      players.push(player);

      socket.emit('joinedPlayer', { jurorNumber, role });

      io.emit('updatePlayers', players.length);

      if (players.length === 12) {
        io.emit('message', 'Court is in session!');
      }
    }
  });

  socket.on('startGame', () => {
    if (socket.id !== gmId) return;

    phaseIndex = 0;
    io.emit('phaseChanged', phases[phaseIndex]);

    timer = setInterval(() => {
      timeLeft--;
      io.emit('timer', timeLeft);

      if (timeLeft <= 0) {
        clearInterval(timer);
        io.emit('message', 'Session Ended');
      }
    }, 1000);
  });

  socket.on('nextPhase', () => {
    if (socket.id !== gmId) return;

    if (phaseIndex < phases.length - 1) {
      phaseIndex++;
      io.emit('phaseChanged', phases[phaseIndex]);
    }
  });

  socket.on('submitVote', ({ jurorNumber, vote }) => {
    const player = players.find(p => p.jurorNumber === jurorNumber);
    if (!player) return;

    const lastVote = player.votes[player.votes.length - 1];
    if (lastVote && lastVote !== vote) {
      player.votes.push(vote);
      io.emit('voteUpdate', `Juror ${jurorNumber} changed mind to ${vote}`);
    } else if (!lastVote) {
      player.votes.push(vote);
      io.emit('voteUpdate', `Juror ${jurorNumber} voted ${vote}`);
    }
  });

  socket.on('sendEvidence', ({ text, recipient }) => {
    if (socket.id !== gmId) return;

    if (recipient === 'all') {
      players.forEach(p => io.to(p.socketId).emit('newEvidence', text));
    } else {
      const juror = players.find(p => p.jurorNumber == recipient);
      if (juror) io.to(juror.socketId).emit('newEvidence', text);
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;
  });
});

server.listen(PORT, () => console.log(`Server running on ${PORT}`));
