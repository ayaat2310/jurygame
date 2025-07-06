const socket = io();
let jurorNumber = null;

function join() {
  const username = document.getElementById('username').value;
  socket.emit('join', username);
}

socket.on('joinedPlayer', data => {
  document.getElementById('login').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  jurorNumber = data.jurorNumber;
  updatePhase(data.phase);
  updateTime(data.masterTime);
});

socket.on('joinedGM', data => {
  document.getElementById('login').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  document.getElementById('gmControls').style.display = 'block';
  updatePhase(data.phase);
  updateTime(data.masterTime);
});

socket.on('phaseUpdated', updatePhase);
socket.on('masterTimeUpdate', updateTime);
socket.on('playersUpdate', players => {
  document.getElementById('players').innerHTML = players.map(p =>
    `Juror ${p.jurorNumber}: ${p.username}`).join('<br>');
});
socket.on('votesUpdated', votes => {
  document.getElementById('votes').innerHTML = votes.map(v =>
    `Juror ${v.jurorNumber}: ${v.history.join(' → ')}`).join('<br>');
});
socket.on('chatUpdate', chat => {
  document.getElementById('chat').innerHTML = chat.join('<br>');
});
socket.on('newEvidence', text => {
  document.getElementById('evidence').innerHTML += `<br>${text}`;
});
socket.on('courtInSession', () => alert('Court is in session!'));

function updatePhase(phase) {
  document.getElementById('phase').innerText = phase.name;
}

function updateTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  document.getElementById('masterTime').innerText = `${min}:${sec.toString().padStart(2, '0')}`;
}

function startMasterTimer() { socket.emit('startMasterTimer'); }
function nextPhase() { socket.emit('nextPhase'); }
function sendChat() {
  const msg = document.getElementById('chatInput').value;
  socket.emit('chatMessage', msg);
  document.getElementById('chatInput').value = '';
}
function submitVote() {
  const vote = document.getElementById('voteInput').value;
  socket.emit('submitVote', { jurorNumber, vote });
}
function sendEvidence() {
  const text = document.getElementById('evidenceText').value;
  const recipient = document.getElementById('recipient').value;
  socket.emit('sendEvidence', { text, recipient });
}
