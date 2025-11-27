// public/auth.js (修正後の全体コード)

// 🔥 Firebase初期化
// LiveKit接続に必要な startGame, joinGameSession 関数をインポート
// ✅ 修正点: joinGameSession をインポートに追加
import { startGame, createSakura, joinGameSession } from './script.js'; 

const firebaseConfig = {
    apiKey: "AIzaSyDQypYYlRIPBRRTNf_shVcOzl0h5n0OBus",
    authDomain: "english-park-f65d5.firebaseapp.com",
    projectId: "english-park-f65d5",
    storageBucket: "english-park-f65d5.appspot.com",
    messagingSenderId: "522423703619",
    appId: "1:522423703619:web:90ff48520d2008fbc89cf6"
};

// HTMLで読み込んだ互換ライブラリのオブジェクトを使用
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 認証成功時に更新されるユーザー情報（ローカル変数）
let username = "";
let myId = "";
let room = "EnglishParkRoom"; // 💡 ルーム名を取得するDOMがないため、固定値を設定

// ------------------------------------------------------------------
// 🌸 共通：ログイン後の演出とゲーム開始 (UI遷移のみに機能を絞る)
// ------------------------------------------------------------------

// 💡 修正点: enterPark のロジックは joinGameSession に統合されるため、ここでは単なるUI切り替えとして残します。
function enterParkUI(username, myId) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("welcomeScreen").style.display = "block";
    if (typeof createSakura === "function") createSakura();

    // 💡 joinGameSessionが window.username/myId を使用するため、ここで設定
    window.myId = myId;
    window.username = username;
    
    // 【重要】ルーム名もグローバルに設定（index.htmlで room-input のIDを付けている場合、そちらから取得しても良い）
    window.room = room; 

    setTimeout(() => {
        document.getElementById("welcomeScreen").style.display = "none";
        document.getElementById("gameArea").style.display = "block";
        
        // startGame は joinGameSession の中で呼ばれるため、ここではコメントアウトまたは削除します。
        // startGame(myId); 
        
    }, 2000);
}

// ------------------------------------------------------------------

// ✅ 新規登録処理
document.getElementById("signupButton").addEventListener("click", () => {
    const name = document.getElementById("loginName").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    const roomInput = document.getElementById("room-input"); // ルーム名入力を取得 (index.htmlにある前提)
    
    if (roomInput && roomInput.value) {
        room = roomInput.value;
    }

    if (!name || !email || !password) {
        alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
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
            // ✅ 修正点: Socket.IO入室処理へ
            return joinGameSession(username, room); 
        })
        .catch(error => {
            console.error("登録失敗:", error);
            alert("登録失敗: " + error.message);
        });
});

// ------------------------------------------------------------------

// ✅ ログイン処理
document.getElementById("loginButton").addEventListener("click", () => {
    const name = document.getElementById("loginName").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    const roomInput = document.getElementById("room-input"); // ルーム名入力を取得

    if (roomInput && roomInput.value) {
        room = roomInput.value;
    }

    if (!name || !email || !password) {
        alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
        return;
    }

    username = name; 

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            myId = userCredential.user.uid; 
            enterParkUI(username, myId); // UIを切り替える
            // ✅ 修正点: Socket.IO入室処理へ
            return joinGameSession(username, room); 
        })
        .catch(error => {
            console.error("ログイン失敗:", error);
            alert("ログイン失敗: " + error.message);
        });
});