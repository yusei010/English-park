// public/auth.js (修正後の全体コード)

// 🔥 Firebase初期化 (HTMLで互換ライブラリが初期化されているため、ここではauth/dbインスタンスを取得するだけ)
// LiveKit接続に必要な startGame, createSakura, joinGameSession 関数をインポート
import { startGame, createSakura, joinGameSession } from './script.js'; 

// HTMLで読み込んだ互換ライブラリのオブジェクトを使用
// ここではモジュールのスコープ内で再取得します。
// もし、HTML側で window.firebase を設定しているなら、それを使います。
const auth = firebase.auth();
const db = firebase.firestore();

// 認証成功時に更新されるユーザー情報（ローカル変数）
let username = "";
let myId = "";
let room = "EnglishParkRoom"; 

// ------------------------------------------------------------------
// 🌸 共通：ログイン後の演出とゲーム開始 (UI遷移のみに機能を絞る)
// ------------------------------------------------------------------

function enterParkUI(username, myId) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("welcomeScreen").style.display = "block";
    if (typeof createSakura === "function") createSakura();

    // LiveKit/Socket.IOが使用するため、グローバルに設定
    window.myId = myId;
    window.username = username;
    window.room = room; 

    setTimeout(() => {
        document.getElementById("welcomeScreen").style.display = "none";
        document.getElementById("gameArea").style.display = "block";
        
        // joinGameSession は script.js で実行されます
        // startGame は joinGameSession の中で呼ばれるため、ここでは不要です。
    }, 2000);
}

// ------------------------------------------------------------------

// ✅ 新規登録処理
// DOM IDを index.html の `<input>` のIDに合わせる
document.getElementById("signupButton").addEventListener("click", () => {
    const name = document.getElementById("loginName").value.trim(); // 修正: index.htmlに合わせて "loginName" を使用
    const email = document.getElementById("emailInput").value.trim(); // 修正: index.htmlに合わせて "emailInput" を使用
    const password = document.getElementById("passwordInput").value; // 修正: index.htmlに合わせて "passwordInput" を使用
    const roomInput = document.getElementById("room-input"); 
    
    if (roomInput && roomInput.value) {
        room = roomInput.value;
    }

    if (!name || !email || !!password) {
        // alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
        // alertの代わりにコンソールに出力
        console.error("ユーザー名・メールアドレス・パスワードをすべて入力してください");
        return;
    }

    username = name; 

    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            myId = userCredential.user.uid; 
            return db.collection("users").doc(myId).set({
                email,
                displayName: username,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: "online"
            });
        })
        .then(() => {
            enterParkUI(username, myId); // UIを切り替える
            // Socket.IO入室処理へ
            return joinGameSession(username, room); 
        })
        .catch(error => {
            console.error("登録失敗:", error);
            // alert("登録失敗: " + error.message);
        });
});

// ------------------------------------------------------------------

// ✅ ログイン処理
// DOM IDを index.html の `<input>` のIDに合わせる
document.getElementById("loginButton").addEventListener("click", () => {
    const name = document.getElementById("loginName").value.trim(); // 修正
    const email = document.getElementById("emailInput").value.trim(); // 修正
    const password = document.getElementById("passwordInput").value; // 修正
    const roomInput = document.getElementById("room-input"); 

    if (roomInput && roomInput.value) {
        room = roomInput.value;
    }

    if (!name || !email || !password) {
        // alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
        console.error("ユーザー名・メールアドレス・パスワードをすべて入力してください");
        return;
    }

    username = name; 

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            myId = userCredential.user.uid; 
            enterParkUI(username, myId); // UIを切り替える
            // Socket.IO入室処理へ
            return joinGameSession(username, room); 
        })
        .catch(error => {
            console.error("ログイン失敗:", error);
            // alert("ログイン失敗: " + error.message);
        });
});