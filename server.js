const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Stato dell'asta
let auctionState = {
  step: 'setup', // 'setup', 'waiting', 'active', 'ended'
  teams: [],
  currentItem: '',
  currentPrice: 0,
  currentLeader: 'Nessuno',
  timeLeft: 10,
  timerInterval: null
};

io.on('connection', (socket) => {
  // Invia lo stato attuale appena un utente si connette
  socket.emit('updateState', auctionState);

  // L'admin crea l'asta con le squadre
  socket.on('setupAuction', (teamsList) => {
    auctionState.teams = teamsList;
    auctionState.step = 'waiting';
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    io.emit('updateState', auctionState);
  });

  // L'admin avvia l'asta per un nuovo oggetto/giocatore
  socket.on('startItem', ({ itemName, startPrice }) => {
    auctionState.currentItem = itemName;
    auctionState.currentPrice = Number(startPrice);
    auctionState.currentLeader = 'Nessuno';
    auctionState.step = 'active';
    auctionState.timeLeft = 10;
    
    io.emit('updateState', auctionState);
    startTimer();
  });

  // Gestione dei rilanci da parte delle squadre
  socket.on('placeBid', ({ teamName, bidAmount }) => {
    if (auctionState.step !== 'active') return;
    
    const amount = Number(bidAmount);
    if (amount > auctionState.currentPrice) {
      auctionState.currentPrice = amount;
      auctionState.currentLeader = teamName;
      auctionState.timeLeft = 10; // Reset del timer a 10 secondi
      io.emit('updateState', auctionState);
    }
  });

  // Reset per un nuovo oggetto
  socket.on('resetItem', () => {
    stopTimer();
    auctionState.step = 'waiting';
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    io.emit('updateState', auctionState);
  });

  socket.on('disconnect', () => {
    // Gestione disconnessione opzionale
  });
});

function startTimer() {
  stopTimer();
  auctionState.timerInterval = setInterval(() => {
    if (auctionState.timeLeft > 0) {
      auctionState.timeLeft--;
      io.emit('updateState', auctionState);
    } else {
      stopTimer();
      auctionState.step = 'ended'; // Asta chiusa per questo oggetto
      io.emit('updateState', auctionState);
    }
  }, 1000);
}

function stopTimer() {
  if (auctionState.timerInterval) {
    clearInterval(auctionState.timerInterval);
    auctionState.timerInterval = null;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
});