const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// 💡 【最重要修正】CORS設定を追加し、Renderからの接続を許可
const io = new Server(server, {
  cors: {
    // 💡 RenderのURLを正確に指定
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
    // 💡 参加イベントが正しくブロードキャストされていることを確認
    socket.broadcast.emit("join", data);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 サーバー起動中");
});