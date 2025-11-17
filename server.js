// server.js (LiveKit対応版 - 認証情報埋め込み済み)
const express = require("express");
const http = require("http");
// 💡 LiveKit SDKをインポート (npm install livekit-server-sdk が必要)
const { AccessToken } = require('livekit-server-sdk'); 

const app = express();
const server = http.createServer(app);

// 🔑 ユーザーが提供したLiveKit認証情報
// ⚠️ 本番環境ではRenderの環境変数として設定することを強く推奨します。
const LIVEKIT_URL = 'wss://english-park-gqi2vk5t.livekit.cloud';
const LIVEKIT_API_KEY = 'eqzEZPmD6qYE'; 
const LIVEKIT_SECRET_KEY = 'JDgLUtjaTZMJjFpMMDCtDncwjdM0pwVFuTK2Rf20KDY';

app.use(express.static("public"));

// 💡 LiveKitトークン生成エンドポイント
// クライアントが /token?id={UID}&name={名前} でアクセスし、認証トークンを取得します。
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
    
    // 参加権限とルーム名を設定 (ルーム名は全員共通の 'english-park-room')
    at.addGrant({ roomJoin: true, room: 'english-park-room' }); 
    
    // トークンとLiveKit URLをクライアントに返す
    res.json({
        token: at.toJwt(),
        livekitUrl: LIVEKIT_URL
    });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 サーバー起動中");
});