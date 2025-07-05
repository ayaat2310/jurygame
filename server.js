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

// Serve static & uploads
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(fileUpload());

// Game state
let players = [];
let gmId = null;
let votes = [];
let phaseIndex = -1;

let timeLeft = 2 * 60 * 60; // 2 hours in seconds
let timerInterval = null;

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

function assignRole() {
  const idx = Math.floor(Math.random() * rolesPool.length);
  return rolesPool.splice(idx, 1)[0];
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', (username) => {
    if (username === 'AYAATGM') {
      gmId = socket.id;
      socket.emit('joinedGM', { phase: phases[phaseIndex], timeLeft });
      if (!timerInterval) startTimer();
    } else {
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

      if (players.length === 12) {
        io.emit('courtInSession', "Court is now in session!");
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

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    players = players.filter(p => p.socketId !== socket.id);
    if (socket.id === gmId) gmId = null;
    updateGM();
  });

  function updateGM() {
    if (gmId) {
      io.to(gmId).emit('gmUpdate', players);
    }
  }

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

// GM uploads files
app.post('/upload', (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).send('No file uploaded.');
  }
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
  console.log(`Server is listening on port ${PORT}`);
});
