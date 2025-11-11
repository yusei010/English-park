// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// 💡 【修正点】Socket.IOのCORS設定を追加
const io = new Server(server, {
  cors: {
    // RenderにデプロイされたフロントエンドのURLを指定
    // 開発環境の場合は "http://localhost:8080" など、クライアントのポートを指定
    origin: "https://english-park-2f2y.onrender.com", 
    methods: ["GET", "POST"]
  }
});

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