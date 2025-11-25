// auth.js (LiveKit連携のための修正を反映)

// 🔥 Firebase初期化
// LiveKit接続に必要な startGame 関数をインポート
import { startGame, createSakura } from './script.js'; 
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

// 🌸 共通：ログイン後の演出とゲーム開始
function enterPark() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("welcomeScreen").style.display = "block";
    if (typeof createSakura === "function") createSakura();

    // 💡 【重要】LiveKit接続ロジック（script.js）が使用できるよう、
    // IDと名前をグローバルな window オブジェクトに設定する
    window.myId = myId;
    window.username = username;

    setTimeout(() => {
        document.getElementById("welcomeScreen").style.display = "none";
        document.getElementById("gameArea").style.display = "block";
        startGame(myId); // ✅ IDを渡して広場へ
    }, 2000);
}

// ------------------------------------------------------------------

// ✅ 新規登録処理
document.getElementById("signupButton").addEventListener("click", () => {
    const name = document.getElementById("loginName").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;

    if (!name || !email || !password) {
        alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
        return;
    }

    username = name; // ローカル変数にユーザー名を設定

    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            myId = userCredential.user.uid; // ローカル変数にUIDを設定
            return db.collection("users").doc(myId).set({
                email,
                displayName: username,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: "online"
            });
        })
        .then(() => {
            enterPark(); // ✅ 共通処理で広場へ（ここで window に ID/Name が設定される）
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

    if (!name || !email || !password) {
        alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
        return;
    }

    username = name; // ローカル変数にユーザー名を設定

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            myId = userCredential.user.uid; // ローカル変数にUIDを設定
            enterPark(); // ✅ 共通処理で広場へ（ここで window に ID/Name が設定される）
        })
        .catch(error => {
            console.error("ログイン失敗:", error);
            alert("ログイン失敗: " + error.message);
        });
});