const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// File upload config
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// In-memory state
let players = [];
let gmId = null;
let jurorCounter = 0;
const rolesPool = [
  ...Array(4).fill("Guilty Jury"),
  ...Array(4).fill("Not Guilty Jury"),
  ...Array(4).fill("Neutral Jury")
];

let votes = [];
let phaseIndex = -1;
const phases = [
  "Case Overview",
  "Discussion",
  "First Vote",
  "Evidence Review",
  "Final Vote"
];

// Timer: 2 hours
let totalSeconds = 2 * 60 * 60;
setInterval(() => {
  if (totalSeconds > 0) {
    totalSeconds--;
    io.emit('timerUpdate', totalSeconds);
  }
}, 1000);

function assignRole() {
  const idx = Math.floor(Math.random() * rolesPool.length);
  return rolesPool.splice(idx, 1)[0];
}

function broadcastPlayerList() {
  io.emit('playerList', players);
  if (players.length === 12) {
    io.emit('courtSession', "Court is in session!");
  }
}

io.on('connection', socket => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', username => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: phases[phaseIndex] });
    } else {
      if (rolesPool.length === 0) {
        socket.emit('error', 'No more juror slots.');
        return;
      }
      jurorCounter++;
      const role = assignRole();
      const player = {
        socketId: socket.id,
        username,
        jurorNumber: jurorCounter,
        role
      };
      players.push(player);

      socket.emit('joinedPlayer', {
        jurorNumber: player.jurorNumber,
        phase: phases[phaseIndex],
        role: player.role,
        votes
      });

      broadcastPlayerList();
    }
  });

  socket.on('nextPhase', () => {
    if (socket.id === gmId) {
      phaseIndex++;
      if (phaseIndex >= phases.length) phaseIndex = phases.length - 1;
      io.emit('phaseUpdated', phases[phaseIndex]);
    }
  });

  socket.on('submitVote', ({ jurorNumber, username, vote }) => {
    const voteText = `Juror ${jurorNumber} (${username}): ${vote}`;
    votes.push(voteText);
    io.emit('updateVotes', votes);
  });

  socket.on('chatMessage', ({ username, message }) => {
    io.emit('chatMessage', { username, message });
  });

  socket.on('sendEvidence', ({ text, recipient }) => {
    if (socket.id !== gmId) return;
    if (recipient === 'all') {
      io.emit('newEvidence', text);
    } else {
      const juror = players.find(p => p.jurorNumber == recipient);
      if (juror) io.to(juror.socketId).emit('newEvidence', text);
    }
  });

  socket.on('disconnect', () => {
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;
    broadcastPlayerList();
  });
});

// Upload endpoint for GM
app.post('/upload', upload.single('evidence'), (req, res) => {
  const fileUrl = `/uploads/${req.file.filename}`;
  const recipient = req.body.recipient;
  if (recipient === 'all') {
    io.emit('newEvidence', `File uploaded: <a href="${fileUrl}" target="_blank">${req.file.originalname}</a>`);
  } else {
    const juror = players.find(p => p.jurorNumber == recipient);
    if (juror) io.to(juror.socketId).emit('newEvidence', `File uploaded: <a href="${fileUrl}" target="_blank">${req.file.originalname}</a>`);
  }
  res.send('OK');
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
