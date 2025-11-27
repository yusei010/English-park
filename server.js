// server.js (WebRTC P2P シグナリングサーバー)

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

// 💡 Render対応: 環境変数からポートを取得。
const PORT = process.env.PORT || 3000; 

const app = express();
const server = http.createServer(app);

// ----------------------------------------------------
// 🌐 Socket.IO サーバーをHTTPサーバーにアタッチ
// ----------------------------------------------------
// ⚠️ 本番環境ではセキュリティのためCORS設定を見直す必要があります
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// publicフォルダを静的ファイルとして配信する設定
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// 📡 WebSocket (Socket.IO) シグナリングロジック
// ----------------------------------------------------
// ルーム内の参加者情報を保持するマップ (roomName -> [socketId1, socketId2, ...])
const roomUsers = {}; 

io.on('connection', (socket) => {
    console.log(`✅ 新しいユーザーが接続: ${socket.id}`);

    let currentRoom = '';
    let currentUsername = '';

    // 1. ユーザーがルームに参加
    socket.on('join', (data) => {
        const { room, username } = data;
        
        if (!room) return;
        
        currentRoom = room;
        currentUsername = username;

        // Socket.IOの機能でルームに参加
        socket.join(room); 

        // 💡 既存の参加者全員に新しいユーザーの参加を通知
        const existingPeers = roomUsers[room] || [];
        
        // 新しいユーザーに既存のユーザー全員を知らせる
        existingPeers.forEach(peerId => {
            // 既存のユーザーIDを新しい参加者へ送信
            socket.emit('new_user', { peerId: peerId });
        });
        
        // 既存のユーザーに新しい参加者がいることを通知
        socket.to(room).emit('new_user', { peerId: socket.id });

        // ルームの参加者リストを更新
        roomUsers[room] = [...existingPeers, socket.id];
        
        console.log(`[JOIN] ${username} (${socket.id}) がルーム「${room}」に参加しました。`);
    });


    // 2. オファーの転送 (WebRTC接続開始のSDP情報)
    socket.on('offer', (data) => {
        // 特定のターゲットIDのソケットにオファーを転送
        socket.to(data.targetId).emit('offer', {
            sdp: data.sdp,
            senderId: socket.id,
            username: currentUsername
        });
    });

    // 3. アンサーの転送 (SDPへの応答)
    socket.on('answer', (data) => {
        // 特定のターゲットIDのソケットにアンサーを転送
        socket.to(data.targetId).emit('answer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    // 4. ICE候補の転送 (接続経路情報)
    socket.on('candidate', (data) => {
        // 特定のターゲットIDのソケットにICE候補を転送
        socket.to(data.targetId).emit('candidate', {
            candidate: data.candidate,
            senderId: socket.id
        });
    });

    // 5. 切断時の処理
    socket.on('disconnect', () => {
        console.log(`❌ ユーザーが切断: ${socket.id}`);
        
        if (currentRoom) {
            // 💡 ルーム内の他の参加者に退出を通知
            socket.to(currentRoom).emit('user_left', { peerId: socket.id });

            // ルームリストから削除
            if (roomUsers[currentRoom]) {
                roomUsers[currentRoom] = roomUsers[currentRoom].filter(id => id !== socket.id);
            }
        }
    });

});


// ----------------------------------------------------
// 🚀 サーバー起動
// ----------------------------------------------------
server.listen(PORT, () => {
    console.log(`🌐 サーバー起動中 on port: ${PORT}`);
    console.log('WebRTCシグナリングサーバーとして動作中です。');
});