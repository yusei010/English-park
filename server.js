// server.js (WebRTC P2P シグナリングサーバー - マルチプレイヤー同期対応版)

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
/*
 * ルーム内の参加者情報を保持するマップ
 * 構造: { roomName: { socketId: { username: string, x: number, y: number, socket: Socket } } }
 */
const roomUsers = {}; 

io.on('connection', (socket) => {
    console.log(`✅ 新しいユーザーが接続: ${socket.id}`);

    let currentRoom = '';
    
    // 1. ユーザーがルームに参加
    socket.on('join', (data) => {
        // ✅ 修正: 位置情報 (x, y) も受け取る
        const { room, username, x, y } = data; 
        
        if (!room) return;
        
        currentRoom = room;

        // Socket.IOの機能でルームに参加
        socket.join(room); 

        if (!roomUsers[room]) {
            roomUsers[room] = {};
        }

        const existingPlayers = roomUsers[room];
        
        // 💡 既存の参加者全員のデータを取得 (新しい参加者に送るため)
        const initialPlayers = {};
        for (const id in existingPlayers) {
             // socketオブジェクト自体は除外して、データを抽出
            initialPlayers[id] = { 
                username: existingPlayers[id].username,
                x: existingPlayers[id].x,
                y: existingPlayers[id].y
            };
        }
        
        // 2. 新しいユーザーの情報を保存
        existingPlayers[socket.id] = {
            username: username,
            x: x,
            y: y,
            socket: socket
        };

        // 3. 新しいユーザーに既存のユーザー全員を知らせる
        // イベント名を 'new-player' に統一し、initialPlayersを送信
        socket.emit('new-player', { 
            id: socket.id, 
            username: username, 
            initialPlayers: initialPlayers // 既存のプレイヤー全員のデータ
        });
        
        // 4. 既存のユーザーに新しい参加者がいることを通知
        // 新しいユーザーの情報 (自分以外の既存ユーザー全員へ)
        socket.to(room).emit('new-player', { 
            id: socket.id, 
            username: username,
            x: x,
            y: y,
            initialPlayers: {} // 既存ユーザーには自分の情報だけ送れば十分
        });
        
        console.log(`[JOIN] ${username} (${socket.id}) がルーム「${room}」に参加しました。現在${Object.keys(existingPlayers).length}人`);
    });

    // 5. プレイヤーの位置情報同期 (✅ 追加)
    socket.on('player-move', (data) => {
        const { x, y } = data;

        if (currentRoom && roomUsers[currentRoom] && roomUsers[currentRoom][socket.id]) {
            // サーバー側のユーザー情報も更新
            roomUsers[currentRoom][socket.id].x = x;
            roomUsers[currentRoom][socket.id].y = y;

            // ルーム内の自分以外の全員にブロードキャスト
            socket.to(currentRoom).emit('player-move', {
                id: socket.id,
                x: x,
                y: y
            });
        }
    });

    // 6. オファーの転送 (WebRTC接続開始のSDP情報)
    socket.on('offer', (data) => {
        // 特定のターゲットIDのソケットにオファーを転送
        socket.to(data.targetId).emit('offer', {
            sdp: data.sdp,
            senderId: socket.id,
            // 💡 クライアント側で受信時にユーザー名を表示するために送信
            username: roomUsers[currentRoom]?.[socket.id]?.username || socket.id 
        });
    });

    // 7. アンサーの転送 (SDPへの応答)
    socket.on('answer', (data) => {
        // 特定のターゲットIDのソケットにアンサーを転送
        socket.to(data.targetId).emit('answer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    // 8. ICE候補の転送 (接続経路情報)
    // ✅ 修正: クライアント側の期待に合わせてイベント名を 'ice-candidate' に統一
    socket.on('ice-candidate', (data) => { 
        // 特定のターゲットIDのソケットにICE候補を転送
        socket.to(data.targetId).emit('ice-candidate', {
            candidate: data.candidate,
            senderId: socket.id
        });
    });

    // 9. 切断時の処理
    socket.on('disconnect', () => {
        console.log(`❌ ユーザーが切断: ${socket.id}`);
        
        if (currentRoom && roomUsers[currentRoom]) {
            // 💡 ルーム内の他の参加者に退出を通知
            // ✅ 修正: イベント名を 'player-disconnect' に統一
            socket.to(currentRoom).emit('player-disconnect', socket.id);

            // ルームリストから削除
            delete roomUsers[currentRoom][socket.id];

            console.log(`[LEAVE] ${socket.id} がルーム「${currentRoom}」から退出しました。残り${Object.keys(roomUsers[currentRoom]).length}人`);
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