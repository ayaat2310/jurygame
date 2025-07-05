const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static('public'));

// Game state
let players = []; // { socketId, username, jurorNumber, role, evidence: [] }
let gmId = null;
let phaseIndex = -1;
let courtInSession = false;
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

// Votes storage: one vote per jurorNumber
let votes = {}; // { jurorNumber: voteText }

// Assign random role
function assignRole() {
  const idx = Math.floor(Math.random() * rolesPool.length);
  return rolesPool.splice(idx, 1)[0];
}

// Send updated player list to GM
function updateGM() {
  if (gmId) {
    io.to(gmId).emit('gmUpdate', players);
  }
}

// Broadcast votes to all
function broadcastVotes() {
  io.emit('updateVotes', Object.values(votes));
}

// Clear votes when phase changes
function clearVotes() {
  votes = {};
  broadcastVotes();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: phases[phaseIndex], players, votes: Object.values(votes), timeLeft: 0, courtInSession });
      console.log('GM joined');
    } else {
      if (rolesPool.length === 0) {
        socket.emit('error', 'No more juror slots.');
        return;
      }
      const jurorNumber = players.length + 1;
      const role = assignRole();
      const player = { socketId: socket.id, username, jurorNumber, role, evidence: [] };
      players.push(player);

      socket.emit('joinedPlayer', { jurorNumber, role, phase: phases[phaseIndex], publicVotes: Object.values(votes), timeLeft: 0, courtInSession });
      io.emit('playerListUpdate', players.map(p => ({ jurorNumber: p.jurorNumber, username: p.username })));

      if (players.length === 12 && !courtInSession) {
        courtInSession = true;
        io.emit('courtStatus', 'Court is now in session.');
      }

      updateGM();
    }
  });

  socket.on('nextPhase', () => {
    if (socket.id !== gmId) return;
    phaseIndex++;
    if (phaseIndex >= phases.length) phaseIndex = phases.length - 1;

    clearVotes();

    io.emit('phaseUpdated', { phase: phases[phaseIndex], phaseIndex });
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

  socket.on('sendMessage', ({ username, message }) => {
    io.emit('newMessage', { username, message });
  });

  socket.on('submitVote', ({ jurorNumber, username, vote }) => {
    votes[jurorNumber] = `Juror ${jurorNumber} (${username}): ${vote}`;
    broadcastVotes();
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;

    io.emit('playerListUpdate', players.map(p => ({ jurorNumber: p.jurorNumber, username: p.username })));
    updateGM();
  });
});

// File upload route
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  const fileUrl = `/uploads/${req.file.filename}`;
  io.emit('newFile', { originalName: req.file.originalname, url: fileUrl });
  res.status(200).send({ message: 'File uploaded successfully', url: fileUrl });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
