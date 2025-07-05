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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload config
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  if (req.file) {
    const fileUrl = `/uploads/${req.file.filename}`;
    io.emit('newFile', fileUrl);
    res.send({ fileUrl });
  } else {
    res.status(400).send('No file uploaded.');
  }
});

// Game state
let players = [];
let gmId = null;
let phaseIndex = -1;
const phases = ['Case Overview', 'Discussion', 'First Vote', 'Evidence Review', 'Final Vote'];

const rolesPool = [
  ...Array(4).fill("Guilty Jury"),
  ...Array(4).fill("Not Guilty Jury"),
  ...Array(4).fill("Neutral Jury")
];

function assignRole() {
  const idx = Math.floor(Math.random() * rolesPool.length);
  return rolesPool.splice(idx, 1)[0];
}

let votes = [];
let gameTimer = null;
let timeLeft = 2 * 60 * 60;

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join', (username) => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: phases[phaseIndex] });
    } else {
      if (rolesPool.length === 0) {
        socket.emit('error', 'No more juror slots.');
        return;
      }
      const jurorNumber = players.length + 1;
      const role = assignRole();
      const player = { socketId: socket.id, username, jurorNumber, role, evidence: [] };
      players.push(player);

      socket.emit('joinedPlayer', {
        jurorNumber,
        role,
        phase: phases[phaseIndex],
        publicVotes: votes
      });

      io.emit('playerList', players.map(p => ({
        jurorNumber: p.jurorNumber,
        username: p.username
      })));

      if (players.length === 12) {
        io.emit('courtStart');
      }

      updateGM();
    }
  });

  socket.on('nextPhase', () => {
    if (socket.id === gmId) {
      phaseIndex++;
      if (phaseIndex >= phases.length) phaseIndex = phases.length - 1;
      io.emit('phaseUpdated', phases[phaseIndex]);
    }
  });

  socket.on('sendEvidence', ({ text, recipient }) => {
    if (socket.id !== gmId) return;
    if (recipient === 'all') {
      players.forEach(p => {
        io.to(p.socketId).emit('newEvidence', text);
      });
    } else {
      const juror = players.find(p => p.jurorNumber == recipient);
      if (juror) io.to(juror.socketId).emit('newEvidence', text);
    }
  });

  socket.on('submitVote', ({ jurorNumber, username, vote }) => {
    const voteText = `Juror ${jurorNumber} (${username}): ${vote}`;
    votes.push(voteText);
    io.emit('updateVotes', votes);
  });

  socket.on('startTimer', () => {
    if (socket.id === gmId && !gameTimer) {
      timeLeft = 2 * 60 * 60;
      gameTimer = setInterval(() => {
        timeLeft--;
        io.emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
          clearInterval(gameTimer);
          io.emit('gameEnded');
        }
      }, 1000);
    }
  });

  function updateGM() {
    if (gmId) {
      io.to(gmId).emit('gmUpdate', players);
    }
  }

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;
    updateGM();
  });
});

server.listen(PORT, () => console.log(`Server running on ${PORT}`));

