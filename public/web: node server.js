<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>The Jury Game</title>
</head>
<body>
  <h1>Welcome to The Jury Game!</h1>
  <p>This connects to your Socket.IO server.</p>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    const username = prompt('Enter your username:');
    socket.emit('join', username);

    socket.on('joinedGM', data => {
      console.log('Joined as GM', data);
    });

    socket.on('joinedPlayer', data => {
      console.log('Joined as Player', data);
    });

    socket.on('updateVotes', votes => {
      console.log('Updated votes:', votes);
    });

    socket.on('phaseUpdated', phase => {
      console.log('Phase updated:', phase);
    });
  </script>
</body>
</html>
