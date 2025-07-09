const socket = io();
let isGM = false;
let myRole = null;

// DOM Elements
const phaseDisplay = document.getElementById('phaseDisplay');
const timerDisplay = document.getElementById('timer');
const gmPanel = document.getElementById('gmPanel');

// Join game
const username = prompt('Enter your name:') || 'Juror';
if (username.toLowerCase() === 'ayaatgm') isGM = true;
socket.emit('join', username);

// Socket listeners
socket.on('roleAssigned', (data) => {
  myRole = data.role;
  if (isGM) gmPanel.classList.remove('hidden');
});

socket.on('phaseChange', (phase) => {
  phaseDisplay.textContent = `Phase: ${phase}`;
});

socket.on('newEvidence', (evidence) => {
  const evidenceDiv = document.createElement('div');
  evidenceDiv.className = 'evidence';
  evidenceDiv.innerHTML = `<a href="${evidence.path}" target="_blank">${evidence.name}</a>`;
  document.getElementById('evidenceDisplay').appendChild(evidenceDiv);
});

// Timer logic
function updateTimer(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  timerDisplay.textContent = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// GM controls
document.getElementById('startGame')?.addEventListener('click', () => {
  socket.emit('startGame');
});

document.getElementById('nextPhase')?.addEventListener('click', () => {
  socket.emit('nextPhase');
});
