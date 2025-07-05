const socket = io();

const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const joinSection = document.getElementById('joinSection');
const gameArea = document.getElementById('gameArea');
const playerInfo = document.getElementById('playerInfo');
const phase = document.getElementById('phase');
const playerList = document.getElementById('playerList');
const courtStatus = document.getElementById('courtStatus');
const timer = document.getElementById('timer');

const gmControls = document.getElementById('gmControls');
const nextPhaseBtn = document.getElementById('nextPhaseBtn');
const evidenceText = document.getElementById('evidenceText');
const evidenceRecipient = document.getElementById('evidenceRecipient');
const sendEvidenceBtn = document.getElementById('sendEvidenceBtn');
const uploadForm = document.getElementById('uploadForm');

const voteInput = document.getElementById('voteInput');
const voteBtn = document.getElementById('voteBtn');
const voteList = document.getElementById('voteList');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

const evidenceDisplay = document.getElementById('evidenceDisplay');

let username = '';
let jurorNumber = '';

joinBtn.onclick = () => {
  username = usernameInput.value.trim();
  if (!username) return alert("Enter a username");
  socket.emit('join', username);
};

socket.on('joinedGM', data => {
  joinSection.classList.add('hidden');
  gameArea.classList.remove('hidden');
  gmControls.classList.remove('hidden');
  phase.innerText = `Current Phase: ${data.phase}`;
});

socket.on('joinedPlayer', data => {
  joinSection.classList.add('hidden');
  gameArea.classList.remove('hidden');
  jurorNumber = data.jurorNumber;
  playerInfo.innerText = `You are Juror ${jurorNumber}`;
  phase.innerText = `Current Phase: ${data.phase}`;
  data.votes.forEach(v => addVote(v));
});

socket.on('phaseUpdated', newPhase => {
  phase.innerText = `Current Phase: ${newPhase}`;
});

socket.on('playerList', players => {
  playerList.innerHTML = `<h3>Jurors</h3>` + players.map(p =>
    `Juror ${p.jurorNumber}: ${p.username}`
  ).join('<br>');
});

socket.on('courtSession', msg => {
  courtStatus.innerText = msg;
});

socket.on('updateVotes', votes => {
  voteList.innerHTML = '';
  votes.forEach(v => addVote(v));
});

voteBtn.onclick = () => {
  const vote = voteInput.value.trim();
  if (vote) {
    socket.emit('submitVote', { jurorNumber, username, vote });
    voteInput.value = '';
  }
};

function addVote(vote) {
  const li = document.createElement('li');
  li.innerHTML = vote;
  voteList.appendChild(li);
}

socket.on('timerUpdate', seconds => {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  timer.innerText = `Time Left: ${h}:${m}:${s}`;
});

nextPhaseBtn.onclick = () => socket.emit('nextPhase');

sendEvidenceBtn.onclick = () => {
  const text = evidenceText.value.trim();
  const recipient = evidenceRecipient.value.trim();
  if (text && recipient) {
    socket.emit('sendEvidence', { text, recipient });
    evidenceText.value = '';
    evidenceRecipient.value = '';
  }
};

uploadForm.onsubmit = e => {
  e.preventDefault();
  const formData = new FormData(uploadForm);
  fetch('/upload', { method: 'POST', body: formData });
  uploadForm.reset();
};

socket.on('newEvidence', msg => {
  evidenceDisplay.innerHTML += `<div>${msg}</div>`;
});

sendChatBtn.onclick = () => {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit('chatMessage', { username, message });
    chatInput.value = '';
  }
};

socket.on('chatMessage', ({ username, message }) => {
  chatMessages.innerHTML += `<div><strong>${username}:</strong> ${message}</div>`;
});
