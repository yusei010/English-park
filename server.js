// =========================================================
// Node.js WebRTC シグナリングサーバー (server.js)
// =========================================================

// 必要なモジュールをインポート
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors'); // クライアントからのCORSを許可

const app = express();
// Renderの公開URLに対応するため、CORSを設定
app.use(cors()); 
const server = http.createServer(app);

// ---------------------------------------------------------
// 🌐 Socket.IOサーバーの設定
// ---------------------------------------------------------

// Socket.IOサーバーをHTTPサーバーにアタッチ
// 許可するオリジンをクライアントのホスト名に設定してください (例: 'http://localhost:8080')
// Renderでデプロイする場合は、ワイルドカードや具体的なオリジンを設定します。
const io = new Server(server, {
    cors: {
        origin: "*", // 開発環境では全てのオリジンを許可 (本番では特定のオリジンを設定すべき)
        methods: ["GET", "POST"]
    }
});

// ---------------------------------------------------------
// 🎮 ユーザーとルーム情報の管理
// ---------------------------------------------------------

// すべての接続中のユーザーを追跡するマップ
// キー: Socket ID, 値: { userId: string (Firebase UID), username: string, room: string (Area Key), x: number, y: number }
const connectedUsers = {}; 

/**
 * 指定されたルーム内のプレイヤーの情報を返します。
 * @param {string} roomKey 
 * @returns {Object} ユーザーIDをキーとするプレイヤーデータのオブジェクト
 */
function getUsersInRoom(roomKey) {
    const roomPlayers = {};
    for (const socketId in connectedUsers) {
        const user = connectedUsers[socketId];
        // ユーザーがそのルームにいて、ルーム情報が設定されていることを確認
        if (user.room === roomKey) {
            // クライアントに送る情報 (Socket IDではなく、Firebase UIDをキーとして使用)
            roomPlayers[user.userId] = { 
                username: user.username,
                x: user.x, 
                y: user.y 
            };
        }
    }
    return roomPlayers;
}


// ---------------------------------------------------------
// 💻 Socket.IO イベントハンドラ
// ---------------------------------------------------------

io.on('connection', (socket) => {
    console.log(`[CONNECT] New client connected: ${socket.id}`);

    // ===================================================
    // 🚪 ルーム参加/エリア移動 (join)
    // ===================================================
    socket.on('join', (data) => {
        const { room: newRoom, username, id: userId, x, y } = data;
        
        const currentUserData = connectedUsers[socket.id];
        const oldRoom = currentUserData ? currentUserData.room : null;

        // 1. 古いルームから退出
        if (oldRoom && oldRoom !== newRoom) {
            console.log(`[LEAVE] ${userId} (${username}) leaving room ${oldRoom}`);
            socket.leave(oldRoom);
            
            // 古いルームの他のメンバーに退出を通知 (クライアント側で WebRTC 切断処理をトリガー)
            socket.to(oldRoom).emit('player-left', userId);
        }
        
        // 2. 新しいルームに参加
        socket.join(newRoom);
        connectedUsers[socket.id] = { userId, username, room: newRoom, x, y };

        console.log(`[JOIN] ${userId} (${username}) joined room ${newRoom}`);

        // 3. 新しいルームの他のメンバーに自分の参加を通知
        socket.to(newRoom).emit('new-player', { id: userId, username, x, y });

        // 4. 自分に現在のルーム内の全プレイヤー情報を送信
        const playersInRoom = getUsersInRoom(newRoom);
        delete playersInRoom[userId]; // 自分自身はリストから除外
        
        if (Object.keys(playersInRoom).length > 0) {
            console.log(`[JOIN] Sending ${Object.keys(playersInRoom).length} existing players to ${userId}`);
            // 'update-players'イベント名で、既存のプレイヤー情報をクライアントに送信
            socket.emit('update-players', playersInRoom);
        }
    });

    // ===================================================
    // 🚶 プレイヤー移動 (move)
    // ===================================================
    socket.on('move', (data) => {
        const { room, x, y, id: userId } = data;
        
        if (connectedUsers[socket.id]) {
            connectedUsers[socket.id].x = x;
            connectedUsers[socket.id].y = y;
            
            // ルーム内の他のメンバーに自分の新しい位置をブロードキャスト
            socket.to(room).emit('update-players', {
                [userId]: { username: connectedUsers[socket.id].username, x, y }
            });
        }
    });
    
    // ===================================================
    // 🗣️ WebRTC シグナリング (offer, answer, ice-candidate)
    // ===================================================

    // Offerをターゲットに転送
    socket.on('offer', (data) => {
        const { targetId, sessionDescription, room } = data;
        // targetId は Firebase UID
        const targetSocket = findSocketIdByUserId(targetId, room);
        
        if (targetSocket) {
            targetSocket.emit('offer', {
                senderId: connectedUsers[socket.id].userId,
                sessionDescription
            });
            // console.log(`[WEBRTC] Offer from ${connectedUsers[socket.id]?.userId} to ${targetId} in ${room}`);
        }
    });

    // Answerをターゲットに転送
    socket.on('answer', (data) => {
        const { targetId, sessionDescription, room } = data;
        const targetSocket = findSocketIdByUserId(targetId, room);

        if (targetSocket) {
            targetSocket.emit('answer', {
                senderId: connectedUsers[socket.id].userId,
                sessionDescription
            });
            // console.log(`[WEBRTC] Answer from ${connectedUsers[socket.id]?.userId} to ${targetId} in ${room}`);
        }
    });

    // ICE Candidateをターゲットに転送
    socket.on('ice-candidate', (data) => {
        const { targetId, candidate, room } = data;
        const targetSocket = findSocketIdByUserId(targetId, room);

        if (targetSocket) {
            targetSocket.emit('ice-candidate', {
                senderId: connectedUsers[socket.id].userId,
                candidate
            });
            // console.log(`[WEBRTC] ICE Candidate from ${connectedUsers[socket.id]?.userId} to ${targetId} in ${room}`);
        }
    });

    // ===================================================
    // 🔌 切断 (disconnect)
    // ===================================================
    socket.on('disconnect', () => {
        const userData = connectedUsers[socket.id];
        
        if (userData) {
            console.log(`[DISCONNECT] ${userData.userId} (${userData.username}) disconnected from room ${userData.room}`);
            
            // ルーム内の他のメンバーに退出を通知
            socket.to(userData.room).emit('player-left', userData.userId);

            // ユーザーリストから削除
            delete connectedUsers[socket.id];
        } else {
            console.log(`[DISCONNECT] Client disconnected: ${socket.id}`);
        }
    });
});

/**
 * Firebase UIDと現在のルームに基づいて、対応するSocketオブジェクトを見つけます。
 * @param {string} userId - Firebase UID
 * @param {string} room - 現在のルームキー
 * @returns {Socket|null} - 対応するSocketオブジェクト
 */
function findSocketIdByUserId(userId, room) {
    for (const socketId in connectedUsers) {
        const user = connectedUsers[socketId];
        if (user.userId === userId && user.room === room) {
            // Socket IDに対応するSocketオブジェクトを取得
            return io.sockets.sockets.get(socketId);
        }
    }
    return null;
}

// ---------------------------------------------------------
// 👂 サーバーリスニング開始
// ---------------------------------------------------------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    // クライアントの SERVER_URL の値がこのサーバーの公開URLと一致しているか確認してください。
    // クライアント: const SERVER_URL = 'https://english-park-2f2y.onrender.com';
    // サーバーの公開URLを設定してください。
});