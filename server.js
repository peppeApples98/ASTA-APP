const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let auctionState = {
  step: 'setup',
  teams: [],
  currentItem: '',
  currentPrice: 0,
  currentLeader: 'Nessuno',
  timeLeft: 10,
  timerInterval: null
};

io.on('connection', (socket) => {
  socket.emit('updateState', auctionState);

  socket.on('setupAuction', (teamsList) => {
    auctionState.teams = teamsList;
    auctionState.step = 'waiting';
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    io.emit('updateState', auctionState);
  });

  socket.on('resetAuction', () => {
    stopTimer();
    auctionState.step = 'setup';
    auctionState.teams = [];
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    io.emit('updateState', auctionState);
  });

  socket.on('startItem', ({ itemName, startPrice }) => {
    stopTimer();
    auctionState.currentItem = itemName;
    auctionState.currentPrice = Number(startPrice);
    auctionState.currentLeader = 'Nessuno'; // Nessuno ha ancora puntato
    auctionState.step = 'active';
    auctionState.timeLeft = 10;
    
    io.emit('updateState', auctionState);
    startTimer();
  });

  socket.on('placeBid', ({ teamName, bidAmount }) => {
    if (auctionState.step !== 'active') return;
    
    const amount = Number(bidAmount);
    
    // Se nessuno ha fatto offerte, accetta qualsiasi importo >= al prezzo di partenza
    const isFirstBid = (auctionState.currentLeader === 'Nessuno' || auctionState.currentLeader === 'In attesa di offerte');
    
    if (isFirstBid ? (amount >= auctionState.currentPrice) : (amount > auctionState.currentPrice)) {
      auctionState.currentPrice = amount;
      auctionState.currentLeader = teamName;
      auctionState.timeLeft = 10; // Reset timer a 10s
      io.emit('updateState', auctionState);
    }
  });

  socket.on('resetItem', () => {
    stopTimer();
    auctionState.step = 'waiting';
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    io.emit('updateState', auctionState);
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
      auctionState.step = 'ended';
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
