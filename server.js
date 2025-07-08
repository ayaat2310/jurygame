const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ dest: 'uploads/' });

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

let players = []; // { socketId, username, jurorNumber, role, votes: [] }
let gmId = null;

const phases = [
  { name: "Case Overview", duration: 25 * 60 },
  { name: "Evidence Selection Vote", duration: 10 * 60 },
  { name: "Evidence Showcase", duration: 5 * 60 },
  { name: "Discussion & First Vote", duration: 10 * 60 },
  { name: "Additional Phases...", duration: 25 * 60 } // add as needed
];
let currentPhase = -1;
let timeLeft = 0;
let phaseTimer = null;

const rolesPool = [
  ...Array(4).fill("Guilty Jury"),
  ...Array(4).fill("Not Guilty Jury"),
  ...Array(4).fill("Neutral Jury")
];

function assignRole() {
  const idx = Math.floor(Math.random() * rolesPool.length);
  return rolesPool.splice(idx, 1)[0];
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: currentPhase >= 0 ? phases[currentPhase].name : null });
    } else {
      if (rolesPool.length === 0) {
        socket.emit('error', 'No more juror slots.');
        return;
      }
      const jurorNumber = players.length + 1;
      const role = assignRole();
      const player = { socketId: socket.id, username, jurorNumber, role, votes: [] };
      players.push(player);

      socket.emit('joinedPlayer', {
        jurorNumber,
        role,
        phase: currentPhase >= 0 ? phases[currentPhase].name : null
      });

      if (players.length === 12) {
        io.emit('courtInSession');
      }

      updateGM();
    }
  });

  socket.on('startTimer', () => {
    if (socket.id === gmId) {
      if (phaseTimer) return; // already running
      startNextPhase();
    }
  });

  socket.on('nextPhase', () => {
    if (socket.id === gmId) {
      startNextPhase();
    }
  });

  function startNextPhase() {
    currentPhase++;
    if (currentPhase >= phases.length) {
      io.emit('phaseUpdated', 'All phases complete.');
      clearInterval(phaseTimer);
      return;
    }

    timeLeft = phases[currentPhase].duration;
    io.emit('phaseUpdated', phases[currentPhase].name);

    if (phaseTimer) clearInterval(phaseTimer);

    phaseTimer = setInterval(() => {
      timeLeft--;
      io.emit('timeUpdate', timeLeft);
      if (timeLeft <= 0) {
        clearInterval(phaseTimer);
        startNextPhase();
      }
    }, 1000);
  }

  socket.on('chatMessage', (msg) => {
    io.emit('chatMessage', msg);
  });

  socket.on('submitVote', ({ jurorNumber, username, vote }) => {
    const player = players.find(p => p.jurorNumber === jurorNumber);
    if (player) {
      player.votes.push(vote);
      const opinionHistory = player.votes.join(' → ');
      io.emit('voteUpdate', `Juror ${jurorNumber} (${username}): ${opinionHistory}`);
    }
  });

  socket.on('sendEvidence', ({ text, recipient }) => {
    if (socket.id !== gmId) return;

    if (recipient === 'all') {
      players.forEach(p => io.to(p.socketId).emit('newEvidence', text));
    } else {
      const target = players.find(p => p.jurorNumber == recipient);
      if (target) {
        io.to(target.socketId).emit('newEvidence', text);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;
    updateGM();
  });

  function updateGM() {
    if (gmId) {
      io.to(gmId).emit('gmUpdate', players);
    }
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ fileUrl: `/uploads/${req.file.filename}` });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
