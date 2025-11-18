// server.js (LiveKit対応版 - 最終版)
const express = require("express");
const http = require("http");
// 💡 LiveKit SDKをインポート (npm install livekit-server-sdk が必要)
const { AccessToken } = require('livekit-server-sdk'); 

const app = express();
const server = http.createServer(app);

// 🔑 LiveKit認証情報をRenderの環境変数から読み込む
// 環境変数: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET を使用します
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY; 
// Renderの環境変数名に合わせて LIVEKIT_API_SECRET を使用します
const LIVEKIT_SECRET_KEY = process.env.LIVEKIT_API_SECRET;

// 🚨 認証情報のチェック
if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_SECRET_KEY) {
    console.error("❌ LiveKit 認証情報が不足しています。Renderの環境変数設定を確認してください。");
    // 環境変数がない場合、サーバーを続行させますが、/tokenエンドポイントは失敗します。
}

app.use(express.static("public"));

// 💡 LiveKitトークン生成エンドポイント
// クライアントが /token?id={UID}&name={名前} でアクセスし、認証トークンを取得します。
app.get('/token', (req, res) => {
    
    if (!req.query.id || !req.query.name) {
        return res.status(400).send("Missing id or name query parameter.");
    }

    if (!LIVEKIT_API_KEY || !LIVEKIT_SECRET_KEY) {
         // 環境変数がない場合、クライアントにエラーを返します
         return res.status(500).send("Server is missing LiveKit credentials.");
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
        // ✅ 修正済み: .toJwt() メソッドを呼び出して、JWT文字列を返します
        token: at.toJwt(), 
        livekitUrl: LIVEKIT_URL
    });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🌐 サーバー起動中");
  console.log(`LiveKit URL: ${LIVEKIT_URL}`);
  console.log("認証情報: 環境変数から読み込み中...");
});