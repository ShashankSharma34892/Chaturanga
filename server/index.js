const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

let players = {
  White: null,
  Black: null,
};

io.on("connection", (socket) => {
  console.log("client connected:", socket.id);

  // Assign color
  let assignedColor = "Spectator";

  if (!players.White) {
    players.White = socket.id;
    assignedColor = "White";
  } else if (!players.Black) {
    players.Black = socket.id;
    assignedColor = "Black";
  }

  socket.emit("assignColor", assignedColor);

  // Handle moves
  socket.on("move", (data) => {
    console.log("move received:", data);
    socket.broadcast.emit("move", data);
  });

  socket.on("resetGame", () => {
    console.log("reset requested by:", socket.id);
    io.emit("gameReset"); // broadcast to ALL, including sender
  });

  socket.on("disconnect", () => {
    console.log("client disconnected:", socket.id);

    // free the seat
    if (players.White === socket.id) players.White = null;
    if (players.Black === socket.id) players.Black = null;
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});
