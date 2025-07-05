// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fileUpload = require('express-fileupload');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(fileUpload());

// State
let players = []; // { socketId, username, jurorNumber, role }
let gmId = null;
let votes = [];
let phaseIndex = -1;
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

let timeLeft = 2 * 60 * 60; // 2 hours in seconds
let timerInterval = null;

function assignRole() {
  const idx = Math.floor(Math.random() * rolesPool.length);
  return rolesPool.splice(idx, 1)[0];
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: phases[phaseIndex], timeLeft, players, votes });
      if (!timerInterval) startTimer();
      return;
    }

    if (rolesPool.length === 0) {
      socket.emit('error', 'No more juror slots.');
      return;
    }

    const jurorNumber = players.length + 1;
    const role = assignRole();
    const player = { socketId: socket.id, username, jurorNumber, role };
    players.push(player);

    socket.emit('joinedPlayer', {
      jurorNumber,
      role,
      phase: phases[phaseIndex],
      publicVotes: votes,
      timeLeft
    });

    // Notify GM of updated player list
    updateGM();

    // Notify all about court session start if 12 jurors joined
    if (players.length === 12) {
      io.emit('courtInSession', "Court is now in session!");
    }

    // Broadcast who joined (optional)
    io.emit('message', `${username} joined as Juror #${jurorNumber}`);
  });

  // Chat messages
  socket.on('chatMessage', (msg) => {
    const player = players.find(p => p.socketId === socket.id);
    let sender = 'GM';
    if (socket.id !== gmId && player) {
      sender = `Juror ${player.jurorNumber} (${player.username})`;
    }
    io.emit('message', `${sender}: ${msg}`);
  });

  socket.on('nextPhase', () => {
    if (socket.id !== gmId) return;
    phaseIndex++;
    if (phaseIndex >= phases.length) phaseIndex = phases.length - 1;
    io.emit('phaseUpdated', phases[phaseIndex]);
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

  socket.on('submitVote', ({ jurorNumber, username, vote }) => {
    const voteText = `Juror ${jurorNumber} (${username}): ${vote}`;
    votes.push(voteText);
    io.emit('updateVotes', votes);
  });

  socket.on('disconnect', () => {
    const player = players.find(p => p.socketId === socket.id);
    if (player) {
      io.emit('message', `${player.username} (Juror #${player.jurorNumber}) left`);
      // Return their role to the pool for reuse
      rolesPool.push(player.role);
      players = players.filter(p => p.socketId !== socket.id);
      updateGM();
    }
    if (socket.id === gmId) {
      gmId = null;
      io.emit('message', 'GM has disconnected.');
    }
  });

  // Send updated player list to GM
  function updateGM() {
    if (gmId) {
      io.to(gmId).emit('gmUpdate', players);
    }
  }

  // Timer logic
  function startTimer() {
    timerInterval = setInterval(() => {
      timeLeft--;
      io.emit('timeUpdate', timeLeft);
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        io.emit('timeUp', "Time is up! Court session ended.");
      }
    }, 1000);
  }
});

// Upload route for GM files
app.post('/upload', (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).send('No file uploaded.');
  }
  if (!gmId) return res.status(403).send('Only GM can upload files.');

  const uploadedFile = req.files.file;
  const uploadPath = path.join(__dirname, 'uploads', uploadedFile.name);

  uploadedFile.mv(uploadPath, (err) => {
    if (err) return res.status(500).send(err);

    const fileUrl = `/uploads/${uploadedFile.name}`;
    io.emit('newFile', fileUrl);
    res.send('File uploaded!');
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
