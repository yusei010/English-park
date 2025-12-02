// server.js - Node.js/Express/Socket.IO WebRTC Signaling Server

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// ---------------------------------------------------------
// 🌐 サーバー設定
// ---------------------------------------------------------

const app = express();
const server = http.createServer(app);
// ⚠️ クライアントからの接続を許可するため CORS を設定
const io = new Server(server, {
    cors: {
        origin: "*", // すべてのオリジンからの接続を許可（本番環境では制限推奨）
        methods: ["GET", "POST"]
    }
});

// Render 環境では process.env.PORT を使用
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------
// 🤝 Express ルート定義 (404対策とヘルスチェック)
// ---------------------------------------------------------

// サーバーが正常に稼働していることを示すルート
app.get('/', (req, res) => {
    res.send({ status: 'English Park Signaling Server is running.', port: PORT });
});

// ---------------------------------------------------------
// 📡 Socket.IO シグナリングロジック
// ---------------------------------------------------------

const rooms = {}; // ルームの状態管理 (キー: roomName, 値: { socketId: { userId, username } })

io.on('connection', (socket) => {
    console.log(`[Connect] New client connected: ${socket.id}`);

    // --- 1. ルーム参加 ---
    socket.on('join', (data) => {
        const { room, username, uid } = data;
        const roomName = room || 'default_room';

        // ルームに参加
        socket.join(roomName);

        // ルームの状態を更新
        if (!rooms[roomName]) {
            rooms[roomName] = {};
        }
        rooms[roomName][socket.id] = { username, uid, socketId: socket.id };

        console.log(`[Join] ${username} (${socket.id}) joined room: ${roomName}`);

        // 参加者リストを作成 (自分自身を除く)
        const peersInRoom = Object.keys(rooms[roomName]).filter(id => id !== socket.id);

        // 自分に対して、既存の参加者リストを送信
        socket.emit('welcome', { peers: peersInRoom, room: roomName });

        // 他の参加者に対して、新しい参加者が来たことを通知
        socket.to(roomName).emit('peer_joined', { peerId: socket.id, username, uid });
    });

    // --- 2. WebRTC シグナリングデータの転送 ---
    socket.on('signal', (data) => {
        // data.peerId (転送先の Socket ID) にデータを送信
        // SDP (Offer/Answer) や ICE Candidate を含む
        io.to(data.peerId).emit('signal', {
            peerId: socket.id, // 送信元は自分
            sdp: data.sdp,
            candidate: data.candidate
        });
        // console.log(`[Signal] from ${socket.id} to ${data.peerId} type: ${data.sdp ? data.sdp.type : 'candidate'}`);
    });

    // --- 3. 位置情報アップデートのブロードキャスト ---
    socket.on('position_update', (data) => {
        const roomName = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomName) {
            // 自分以外にブロードキャスト
            socket.to(roomName).emit('position_update', data);
        }
    });

    // --- 4. 切断 ---
    socket.on('disconnect', () => {
        console.log(`[Disconnect] Client disconnected: ${socket.id}`);
        
        // 所属していたルームを特定し、他の参加者に通知
        let leftRoomName;
        for (const roomName in rooms) {
            if (rooms[roomName][socket.id]) {
                leftRoomName = roomName;
                delete rooms[roomName][socket.id];
                
                // ルームに誰もいなくなったら削除
                if (Object.keys(rooms[roomName]).length === 0) {
                    delete rooms[roomName];
                }
                break;
            }
        }

        if (leftRoomName) {
            // 同じルームの全ピアに退出を通知
            socket.to(leftRoomName).emit('peer_left', { peerId: socket.id });
            console.log(`[Leave] ${socket.id} left room: ${leftRoomName}`);
        }
    });
});

// ---------------------------------------------------------
// 🚀 サーバー起動
// ---------------------------------------------------------

server.listen(PORT, () => {
    console.log(`✅ Signaling Server running on port ${PORT}`);
    console.log(`✅ Access http://localhost:${PORT} for health check.`);
});