const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", socket => {
  socket.on("move", data => {
    socket.broadcast.emit("move", data);
  });

  socket.on("join", data => {
    socket.broadcast.emit("join", data);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 サーバー起動中");
});
