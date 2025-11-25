// server.js (ルートディレクトリに配置 - 環境変数読み込みテスト用)

const express = require('express');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');

// 環境変数の設定 (RenderのEnvironment Variablesで設定されているはず)
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://your-livekit-server.livekit.cloud';

// ポート設定
const port = process.env.PORT || 3000;
const app = express();

// publicフォルダを静的ファイルとして配信する設定
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// 🎙️ LiveKit トークン生成エンドポイント
// ----------------------------------------------------
app.get('/token', (req, res) => {
    
    // ⬇️ 🔴【最重要デバッグコード】キーが読み込めているかを強制チェック
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        // キーが読み込めていない場合、他のエラーとは違う明確なメッセージを返す
        console.error("🔴 Render環境変数 LIVEKIT_API_KEY または SECRET が読み込めませんでした。");
        return res.status(500).send("SERVER_ERROR_KEYS_NOT_FOUND"); 
    }
    // ⬆️ 🔴【最重要デバッグコード】
    
    const { id, name } = req.query;
    
    // パラメータチェック (デバッグメッセージが出た場合、ここには到達しないはず)
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
        room: 'EnglishParkRoom', // ルーム名を固定
        canPublish: true,
        canSubscribe: true,
    });
    
    try {
        // 💡 修正済み: トークンを JWT 形式の文字列に変換して返す
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

// ----------------------------------------------------
// 🚀 サーバー起動
// ----------------------------------------------------
app.listen(port, () => {
    console.log(`🌐 サーバー起動中: http://localhost:${port}`);
    console.log(`LiveKit URL: ${LIVEKIT_URL}`);
});