const socket = io();
const intro = document.getElementById('intro');
const introVideo = document.getElementById('introVideo');
const skipVideo = document.getElementById('skipVideo');
const login = document.getElementById('login');
const game = document.getElementById('game');

introVideo.onended = () => { intro.classList.add('hidden'); login.classList.remove('hidden'); };
skipVideo.onclick = () => { intro.classList.add('hidden'); login.classList.remove('hidden'); };

document.getElementById('joinBtn').onclick = () => {
  const name = document.getElementById('nameInput').value;
  const isGM = document.getElementById('isGM').checked;
  socket.emit('join', { name, isGM });
  login.classList.add('hidden');
  game.classList.remove('hidden');
};

socket.on('assignRole', ({ role, jurorNumber }) => {
  document.getElementById('role').innerText = `${role}`;
});

socket.on('gmJoined', () => {
  document.getElementById('gmControls').classList.remove('hidden');
});

socket.on('updatePlayers', players => {
  document.getElementById('players').innerHTML = players.map(p => `<li>${p}</li>`).join('');
});

socket.on('phase', phase => { document.getElementById('phase').innerText = phase; });
socket.on('timer', time => { document.getElementById('timer').innerText = `Time left: ${time}s`; });
socket.on('message', msg => { addMessage(`SYSTEM: ${msg}`); });
socket.on('chat', msg => { addMessage(msg); });

document.getElementById('startGame').onclick = () => socket.emit('startGame');
document.getElementById('nextPhase').onclick = () => socket.emit('nextPhase');

document.querySelectorAll('.voteBtn').forEach(btn => {
  btn.onclick = () => {
    const vote = btn.dataset.vote;
    socket.emit('vote', vote);
  };
});

document.getElementById('sendChat').onclick = () => {
  const msg = document.getElementById('chatInput').value;
  socket.emit('sendChat', msg);
  document.getElementById('chatInput').value = '';
};

function addMessage(msg) {
  const messages = document.getElementById('messages');
  messages.innerHTML += `<div>${msg}</div>`;
  messages.scrollTop = messages.scrollHeight;
}
