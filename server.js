const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let jurors = [];
let gmSocketId = null;
let currentPhase = 0;
let phaseTimer = null;
const phases = [
  { name: 'Case Overview', duration: 1500 }, // 25min
  { name: 'Evidence Selection', duration: 600 }, // 10min
  { name: 'Evidence Showcase', duration: 300 }, // 5min
  { name: 'Discussion & Vote 1', duration: 600 }, // 10min
  { name: 'Final Discussion & Vote', duration: 600 } // 10min
];

io.on('connection', socket => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join', ({ name, isGM }) => {
    if (isGM) {
      gmSocketId = socket.id;
      socket.emit('gmJoined');
    } else {
      const jurorNumber = jurors.length + 1;
      const role = `Juror #${jurorNumber}`;
      jurors.push({ id: socket.id, name, role, votes: [] });
      socket.emit('assignRole', { role, jurorNumber });
    }
    io.emit('updatePlayers', jurors.map(j => j.name));
  });

  socket.on('sendChat', msg => {
    io.emit('chat', msg);
  });

  socket.on('startGame', () => {
    if (socket.id === gmSocketId) {
      currentPhase = 0;
      startPhase();
    }
  });

  socket.on('nextPhase', () => {
    if (socket.id === gmSocketId) {
      clearInterval(phaseTimer);
      currentPhase++;
      if (currentPhase < phases.length) {
        startPhase();
      } else {
        io.emit('message', 'All phases complete!');
      }
    }
  });

  socket.on('vote', vote => {
    const juror = jurors.find(j => j.id === socket.id);
    if (juror) {
      juror.votes.push(vote);
      io.emit('voteUpdate', { juror: juror.name, currentVote: vote });
    }
  });

  socket.on('disconnect', () => {
    jurors = jurors.filter(j => j.id !== socket.id);
    io.emit('updatePlayers', jurors.map(j => j.name));
    console.log(`User disconnected: ${socket.id}`);
  });

  function startPhase() {
    const phase = phases[currentPhase];
    io.emit('phase', phase.name);
    let timeLeft = phase.duration;
    io.emit('timer', timeLeft);
    phaseTimer = setInterval(() => {
      timeLeft--;
      io.emit('timer', timeLeft);
      if (timeLeft <= 0) {
        clearInterval(phaseTimer);
        currentPhase++;
        if (currentPhase < phases.length) {
          startPhase();
        } else {
          io.emit('message', 'All phases complete!');
        }
      }
    }, 1000);
    io.emit('message', `Phase started: ${phase.name}`);
  }
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));

