const socket = io();

const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('joinBtn');
const info = document.getElementById('info');
const playersDiv = document.getElementById('players');
const phaseDiv = document.getElementById('phase');
const votesDiv = document.getElementById('votes');
const evidenceDiv = document.getElementById('evidence');
const timerDiv = document.getElementById('timer');

joinBtn.onclick = () => {
  socket.emit('join', usernameInput.value);
};

socket.on('joinedPlayer', ({ jurorNumber, role, phase, publicVotes }) => {
  info.innerText = `You are Juror #${jurorNumber} - Role: ${role}`;
  phaseDiv.innerText = `Current Phase: ${phase}`;
  document.getElementById('voteSection').style.display = 'block';
  votesDiv.innerText = publicVotes.join('\n');
});

socket.on('joinedGM', ({ phase }) => {
  info.innerText = `You are the Game Master`;
  phaseDiv.innerText = `Current Phase: ${phase}`;
  document.getElementById('gmControls').style.display = 'block';
});

socket.on('playerList', (list) => {
  playersDiv.innerHTML = '<h3>Players:</h3>' + list.map(p => `Juror #${p.jurorNumber}: ${p.username}`).join('<br>');
});

socket.on('courtStart', () => alert('🧑‍⚖️ Court is in session!'));

socket.on('phaseUpdated', (phase) => {
  phaseDiv.innerText = `Current Phase: ${phase}`;
});

socket.on('updateVotes', (votes) => {
  votesDiv.innerText = votes.join('\n');
});

socket.on('newEvidence', (text) => {
  evidenceDiv.innerHTML += `<p>${text}</p>`;
});

socket.on('newFile', (url) => {
  evidenceDiv.innerHTML += `<p>📄 New file: <a href="${url}" target="_blank">${url}</a></p>`;
});

socket.on('timerUpdate', (secondsLeft) => {
  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  timerDiv.innerText = `Time Left: ${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
});

socket.on('gameEnded', () => {
  alert('⏰ Time is up! The session has ended.');
});

// GM Controls
document.getElementById('nextPhaseBtn').onclick = () => socket.emit('nextPhase');
document.getElementById('startTimerBtn').onclick = () => socket.emit('startTimer');

document.getElementById('sendEvidenceBtn').onclick = () => {
  const text = document.getElementById('evidenceText').value;
  const recipient = document.getElementById('recipient').value;
  socket.emit('sendEvidence', { text, recipient });
};

document.getElementById('submitVoteBtn').onclick = () => {
  const vote = document.getElementById('voteInput').value;
  socket.emit('submitVote', { vote, username: usernameInput.value, jurorNumber: parseInt(info.innerText.split('#')[1]) });
};

// Upload file
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = e.target.querySelector('input[type="file"]');
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const response = await fetch('/upload', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  alert('File uploaded: ' + data.fileUrl);
});
