// server.js (最終版: プレイヤー表示と通話のための設定)
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// 💡 【最重要修正】CORS設定を追加し、Renderからの接続を許可
// これが、他のプレイヤーが表示され、通話が始まるための鍵です。
const io = new Server(server, {
  cors: {
    // 💡 あなたのRenderのフロントエンドURLを正確に指定
    origin: "https://english-park-2f2y.onrender.com", 
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

io.on("connection", socket => {
  console.log('User connected:', socket.id);
  
  // プレイヤー移動の同期
  socket.on("move", data => {
    socket.broadcast.emit("move", data);
  });

  // プレイヤー参加のシグナリング（PeerJSのコール開始トリガー）
  socket.on("join", data => {
    socket.broadcast.emit("join", data);
  });
  
  socket.on("disconnect", () => {
      console.log('User disconnected:', socket.id);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 サーバー起動中");
});