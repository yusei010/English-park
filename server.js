// server.js (LiveKit認証情報 直接埋め込み版 - 緊急テスト用)
const express = require("express");
const http = require("http");
// 💡 LiveKit SDKをインポート (npm install livekit-server-sdk が必要)
const { AccessToken } = require('livekit-server-sdk'); 

const app = express();
const server = http.createServer(app);

// ❌ 【緊急対策】LiveKit認証情報を直接コードに埋め込みます
// 🚨 注意: 本番環境では使わないでください！
const LIVEKIT_URL = 'wss://english-park-gqi2vk5t.livekit.cloud';
const LIVEKIT_API_KEY = 'eqzEZPmD6qYE';         // プレフィックス(API)を削除した値
const LIVEKIT_SECRET_KEY = 'JDgLUtjaTZMJjFpMMDCtDncwjdM0pwVFuTK2Rf20KDY'; 

// 🚨 認証情報のチェック
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_SECRET_KEY) {
    // このテストコードでは、このチェックは基本的に通過します
    console.error("❌ LiveKit 認証情報が不足しています。");
}

app.use(express.static("public"));

// 💡 LiveKitトークン生成エンドポイント
app.get('/token', (req, res) => {
    
    if (!req.query.id || !req.query.name) {
        return res.status(400).send("Missing id or name query parameter.");
    }
    
    // ユーザーIDと名前を使ってトークンを生成
    const at = new AccessToken(
        LIVEKIT_API_KEY, 
        LIVEKIT_SECRET_KEY, 
        { identity: req.query.id, name: req.query.name, ttl: '1h' }
    );
    at.addGrant({ roomJoin: true, room: 'english-park-room' }); 
    
    // トークンとLiveKit URLをクライアントに返す
    res.json({
        token: at.toJwt(), 
        livekitUrl: LIVEKIT_URL
    });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 サーバー起動中 (緊急テストモード)");
  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
});