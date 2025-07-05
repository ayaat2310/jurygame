const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Multer setup for file uploads (stores files in /uploads)
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB
  fileFilter: (req, file, cb) => {
    // Accept pdf, images, txt, docx, etc.
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type.'));
    }
  }
});

app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Game state
let players = []; // { socketId, username, jurorNumber, role, evidence: [] }
let gmId = null;
let phaseIndex = -1;
let votes = [];
const MAX_JURORS = 12;
const TOTAL_GAME_TIME_SEC = 2 * 60 * 60; // 2 hours

const phases = [
  "Case Overview",
  "Discussion",
  "First Vote",
  "Evidence Review",
  "Final Vote"
];

const rolesPool = [
  ...Array(4).fill("Guilty Jury"),
  ...Array(4).fill("Not Guilty Jury"),
  ...Array(4).fill("Neutral Jury")
];

// Assign random role from remaining roles pool
function assignRole() {
  if (rolesPool.length === 0) return null;
  const idx = Math.floor(Math.random() * rolesPool.length);
  return rolesPool.splice(idx, 1)[0];
}

// Broadcast current players to GM
function updateGM() {
  if (gmId) {
    io.to(gmId).emit('gmUpdate', players);
  }
}

// Broadcast votes to all
function broadcastVotes() {
  io.emit('updateVotes', votes);
}

// Broadcast current phase to all
function broadcastPhase() {
  if (phaseIndex < 0 || phaseIndex >= phases.length) return;
  io.emit('phaseUpdated', phases[phaseIndex]);
}

// Timer for the 2-hour game session
let gameTimer = null;
let timeLeft = TOTAL_GAME_TIME_SEC;

function startGameTimer() {
  clearInterval(gameTimer);
  timeLeft = TOTAL_GAME_TIME_SEC;
  gameTimer = setInterval(() => {
    timeLeft--;
    io.emit('timerUpdate', timeLeft);
    if (timeLeft <= 0) {
      clearInterval(gameTimer);
      io.emit('gameEnded');
    }
  }, 1000);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', (username) => {
    if (!username) {
      socket.emit('error', 'Username required');
      return;
    }

    // GM joins
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: phases[phaseIndex], players });
      return;
    }

    // Player joins
    if (players.length >= MAX_JURORS) {
      socket.emit('error', 'Court is full. Maximum 12 jurors allowed.');
      return;
    }

    // Assign juror number and role
    const jurorNumber = players.length + 1;
    const role = assignRole();
    if (!role) {
      socket.emit('error', 'No roles available.');
      return;
    }

    const player = { socketId: socket.id, username, jurorNumber, role, evidence: [] };
    players.push(player);

    socket.emit('joinedPlayer', {
      jurorNumber,
      role,
      phase: phases[phaseIndex],
      votes
    });

    io.emit('playerListUpdate', players.map(p => ({ jurorNumber: p.jurorNumber, username: p.username })));

    // Notify when full
    if (players.length === MAX_JURORS) {
      io.emit('courtInSession', 'All 12 jurors have joined. Court is now in session.');
      startGameTimer();
    }

    updateGM();
  });

  socket.on('nextPhase', () => {
    if (socket.id !== gmId) return;
    phaseIndex++;
    if (phaseIndex >= phases.length) phaseIndex = phases.length - 1;
    votes = []; // reset votes each phase
    broadcastPhase();
    broadcastVotes();
  });

  socket.on('sendEvidence', ({ text, recipient }) => {
    if (socket.id !== gmId) return;

    if (recipient === 'all') {
      players.forEach(p => {
        io.to(p.socketId).emit('newEvidence', { text, fromGM: true });
      });
    } else {
      // recipient jurorNumber
      const juror = players.find(p => p.jurorNumber == recipient);
      if (juror) {
        io.to(juror.socketId).emit('newEvidence', { text, fromGM: true });
      }
    }
  });

  socket.on('submitVote', ({ jurorNumber, username, vote }) => {
    if (!jurorNumber || !username || !vote) return;
    const voteText = `Juror ${jurorNumber} (${username}): ${vote}`;
    votes.push(voteText);
    broadcastVotes();
  });

  socket.on('sendMessage', ({ username, message }) => {
    if (!username || !message) return;
    io.emit('newMessage', { username, message });
  });

  // File upload handler (only GM can upload)
  app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.headers['x-socket-id'] || req.headers['x-socket-id'] !== gmId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Send file info to all players
    const fileUrl = `/uploads/${req.file.filename}`;
    io.emit('newFile', { originalname: req.file.originalname, url: fileUrl });
    res.json({ success: true });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;
    updateGM();
    io.emit('playerListUpdate', players.map(p => ({ jurorNumber: p.jurorNumber, username: p.username })));
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
