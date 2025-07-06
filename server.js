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

app.use(express.static('public'));

// ========= File Upload ==========
const upload = multer({ dest: path.join(__dirname, 'uploads/') });
app.post('/upload', upload.single('file'), (req, res) => {
  console.log('File uploaded:', req.file);
  res.send({ filename: req.file.filename, originalname: req.file.originalname });
});

// ========= Game State ===========
let players = [];
let gmId = null;
const rolesPool = [
  ...Array(4).fill('Guilty Jury'),
  ...Array(4).fill('Not Guilty Jury'),
  ...Array(4).fill('Neutral Jury')
];

const phases = [
  { name: 'Case Overview', duration: 25 * 60 },
  { name: 'Round 1', duration: 25 * 60 },
  { name: 'Round 2', duration: 25 * 60 },
  { name: 'Round 3', duration: 25 * 60 },
  { name: 'Round 4', duration: 25 * 60 }
];

let currentPhase = 0;
let masterTime = 2 * 60 * 60;
let masterTimer = null;
let chat = [];
let votes = [];

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('join', username => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: phases[currentPhase], masterTime, players, chat, votes });
    } else {
      if (rolesPool.length === 0) {
        socket.emit('error', 'No more juror slots.');
        return;
      }
      const jurorNumber = players.length + 1;
      const idx = Math.floor(Math.random() * rolesPool.length);
      const role = rolesPool.splice(idx, 1)[0];
      players.push({ socketId: socket.id, username, jurorNumber, role, voteHistory: [] });

      socket.emit('joinedPlayer', {
        jurorNumber,
        phase: phases[currentPhase],
        masterTime,
        chat,
        votes
      });

      io.emit('playersUpdate', players.map(p => ({ username: p.username, jurorNumber: p.jurorNumber })));

      if (players.length === 12) io.emit('courtInSession');
    }
  });

  socket.on('startMasterTimer', () => {
    if (socket.id === gmId && !masterTimer) {
      masterTimer = setInterval(() => {
        masterTime--;
        if (masterTime <= 0) clearInterval(masterTimer);
        io.emit('masterTimeUpdate', masterTime);
      }, 1000);
    }
  });

  socket.on('nextPhase', () => {
    if (socket.id === gmId) {
      currentPhase++;
      if (currentPhase >= phases.length) currentPhase = phases.length - 1;
      io.emit('phaseUpdated', phases[currentPhase]);
    }
  });

  socket.on('submitVote', ({ jurorNumber, vote }) => {
    const player = players.find(p => p.jurorNumber === jurorNumber);
    if (player) {
      player.voteHistory.push(vote);
      io.emit('votesUpdated', players.map(p => ({
        jurorNumber: p.jurorNumber,
        username: p.username,
        history: p.voteHistory
      })));
    }
  });

  socket.on('chatMessage', msg => {
    chat.push(msg);
    io.emit('chatUpdate', chat);
  });

  socket.on('sendEvidence', ({ text, recipient }) => {
    if (socket.id !== gmId) return;
    if (recipient === 'all') {
      players.forEach(p => io.to(p.socketId).emit('newEvidence', text));
    } else {
      const target = players.find(p => p.jurorNumber == recipient);
      if (target) io.to(target.socketId).emit('newEvidence', text));
    }
  });

  socket.on('disconnect', () => {
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;
    io.emit('playersUpdate', players.map(p => ({ username: p.username, jurorNumber: p.jurorNumber })));
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
