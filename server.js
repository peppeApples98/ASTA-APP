const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Stato "pubblico": SOLO dati serializzabili in JSON.
// Non deve MAI contenere riferimenti a oggetti Node interni
// (Timeout, socket, ecc.) perché io.emit() fa JSON.stringify()
// internamente: un riferimento circolare fa esplodere l'emit.
let auctionState = {
  step: 'setup',
  teams: [],
  currentItem: '',
  currentPrice: 0,
  currentLeader: 'Nessuno',
  timeLeft: 10
};

// Riferimento al timer tenuto FUORI da auctionState, come variabile
// di modulo: non viene mai serializzato/trasmesso ai client.
let timerInterval = null;

function broadcastState() {
  io.emit('updateState', auctionState);
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (auctionState.timeLeft > 0) {
      auctionState.timeLeft--;
      broadcastState();
    } else {
      stopTimer();
      auctionState.step = 'ended';
      broadcastState();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

io.on('connection', (socket) => {
  socket.emit('updateState', auctionState);

  socket.on('setupAuction', (teamsList) => {
    auctionState.teams = teamsList;
    auctionState.step = 'waiting';
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    broadcastState();
  });

  socket.on('resetAuction', () => {
    stopTimer();
    auctionState.step = 'setup';
    auctionState.teams = [];
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    broadcastState();
  });

  socket.on('startItem', ({ itemName, startPrice }) => {
    stopTimer();
    auctionState.currentItem = itemName;
    auctionState.currentPrice = Number(startPrice);
    auctionState.currentLeader = 'Nessuno'; // Nessuno ha ancora puntato
    auctionState.step = 'active';
    auctionState.timeLeft = 10;

    broadcastState();
    startTimer();
  });

  // placeBid accetta due modalità:
  // - relativeAmount: incremento (+1 / +5) calcolato in modo ATOMICO
  //   sul prezzo attuale lato server, evitando race condition tra
  //   due client che cliccano nello stesso istante.
  // - bidAmount: importo assoluto (offerta personalizzata).
  socket.on('placeBid', ({ teamName, bidAmount, relativeAmount }) => {
    if (auctionState.step !== 'active') return;
    if (!teamName) return;

    let amount;
    if (relativeAmount !== undefined) {
      amount = auctionState.currentPrice + Number(relativeAmount);
    } else {
      amount = Number(bidAmount);
    }

    if (!Number.isFinite(amount)) return;

    // Se nessuno ha ancora fatto offerte, accetta anche un importo
    // pari al prezzo di partenza (prima offerta valida).
    const isFirstBid = (auctionState.currentLeader === 'Nessuno');
    const isValid = isFirstBid
      ? amount >= auctionState.currentPrice
      : amount > auctionState.currentPrice;

    if (isValid) {
      auctionState.currentPrice = amount;
      auctionState.currentLeader = teamName;
      auctionState.timeLeft = 10; // Reset timer a 10s
      broadcastState();
    }
  });

  socket.on('resetItem', () => {
    stopTimer();
    auctionState.step = 'waiting';
    auctionState.currentItem = '';
    auctionState.currentPrice = 0;
    auctionState.currentLeader = 'Nessuno';
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
});
