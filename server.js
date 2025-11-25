// server.js (ルートディレクトリに配置 - APIキー直書きテスト用)

const express = require('express');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');

const LIVEKIT_API_KEY = "APILWMth6jMpizV"; 
const LIVEKIT_API_SECRET = "2MseU0foZomR2RiDaLjNM5Lmdhi1VVx3YfOodHnh9YnB"; 
const LIVEKIT_URL = 'wss://english-park-gqi2vk5t.livekit.cloud'; 

// ポート設定
const port = process.env.PORT || 3000;
const app = express();

// publicフォルダを静的ファイルとして配信する設定
app.use(express.static(path.join(__dirname, 'public')));
// 🎙️ LiveKit トークン生成エンドポイント
app.get('/token', (req, res) => {
    
    // 💡 環境変数チェックを削除（直書きしているため常に存在する）
    const { id, name } = req.query;
    if (!id || !name) {
        return res.status(400).send("User ID and Name are required.");
    }
    
    // トークンのペイロードを設定
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: id, // ユーザーの一意なID (Firebase UID)
        name: name,   // ユーザー名
    });
    
    // トークンの有効期限と権限を設定
    at.addGrant({
        roomJoin: true,
        room: 'EnglishParkRoom', 
        canPublish: true,
        canSubscribe: true,
    });
    
    try {
        // 💡 トークンを JWT 形式の文字列に変換して返す
        const token = at.toJwt(); 
        
        console.log(`✅ Token generated for user: ${name} (${id})`);

        // クライアントにトークンとURLを返す
        res.json({
            token: token,           // JWT形式の文字列
            livekitUrl: LIVEKIT_URL // LiveKitのWSS URL
        });
        
    } catch (error) {
        console.error("🔴 JWT token generation failed:", error);
        res.status(500).send("Failed to generate LiveKit token.");
    }
});

// サーバー起動
app.listen(port, () => {
    console.log(`🌐 サーバー起動中: http://localhost:${port}`);
    console.log(`LiveKit URL: ${LIVEKIT_URL}`);
});