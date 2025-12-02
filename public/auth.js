// auth.js
// script.js は joinGameSession のために必要
import { joinGameSession } from './script.js'; 
// three-setup.js は 3D シーン初期化のために必要
import { initThreeScene, createSakura } from './three-setup.js'; 

// 🔥 Firebase初期化
// NOTE: firebaseConfigはindex.html側でも定義されているため、ここではモジュール間の連携を重視
const firebaseConfig = {
    apiKey: "AIzaSyDQypYYlRIPBRRTNf_shVcOzl0h5n0OBus",
    authDomain: "english-park-f65d5.firebaseapp.com",
    projectId: "english-park-f65d5",
    storageBucket: "english-park-f65d5.appspot.com",
    messagingSenderId: "522423703619",
    appId: "1:522423703619:web:90ff48520d2008fbc89cf6"
};

// HTMLで読み込んだ互換ライブラリのオブジェクトを使用
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// 認証成功時に更新されるユーザー情報（ローカル変数）
let username = "";
let myId = "";

// 🌸 共通：ログイン後の演出とゲーム開始
/**
 * 認証成功後に画面を切り替え、ゲームセッションに参加します。
 * @param {string} userId Firebase UID
 * @param {string} displayName ユーザー名
 * @param {string} roomName ルーム名
 */
function enterPark(userId, displayName, roomName) {
    myId = userId;
    username = displayName;

    console.log(`[AUTH] 認証成功: UID=${myId}, Name=${username}, Room=${roomName}`);

    // 画面切り替え
    document.getElementById("loginScreen").style.display = 'none';
    document.getElementById("gameContainer").style.display = 'block';

    // 🌸 3Dシーンの初期化
    // initThreeSceneがthree-setup.jsからインポートされていることを確認
    initThreeScene('gameArea'); 
    
    // ゲームセッションに参加 (WebSocket/WebRTC)
    joinGameSession(myId, username, roomName);
    
    // 桜アニメーションの演出をスタート（パーティクル）
    createSakura();
}


// ------------------------------------------------------------------

// 📝 新規登録UI切り替え
document.getElementById("showRegisterButton").addEventListener("click", () => {
    document.getElementById("loginButton").style.display = 'none';
    document.getElementById("showRegisterButton").style.display = 'none';
    document.getElementById("registerButton").style.display = 'inline-block';
    
    // ユーザー名入力欄を表示
    document.getElementById("registerNameLabel").style.display = 'inline';
    document.getElementById("registerName").style.display = 'inline-block';
});


// ------------------------------------------------------------------

// ✍️ 新規登録処理
document.getElementById("registerButton").addEventListener("click", () => {
    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    const room = document.getElementById("roomInput").value.trim() || 'default-room';

    if (!name || !email || !password || !room) {
        // NOTE: alert() は custom modal UI に置き換えるべきですが、ここでは簡略化
        alert("ユーザー名・メールアドレス・パスワード・ルーム名をすべて入力してください");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            const uid = userCredential.user.uid;

            // Firestoreにユーザー情報を保存
            return db.collection("users").doc(uid).set({
                displayName: name,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: "online"
            }).then(() => {
                // 登録成功とログインを兼ねて広場へ
                enterPark(uid, name, room); 
            });
        })
        .catch(error => {
            console.error("登録失敗:", error);
            alert("登録失敗: " + error.message);
        });
});

// ------------------------------------------------------------------

// ✅ ログイン処理
document.getElementById("loginButton").addEventListener("click", () => {
    // ログイン時はユーザー名入力は必須ではないが、Firestoreに名前を保存していない場合に備えて 'Guest' を使う
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    const room = document.getElementById("roomInput").value.trim() || 'default-room';

    if (!email || !password || !room) {
        alert("メールアドレス・パスワード・ルーム名をすべて入力してください");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            const uid = userCredential.user.uid;
            
            // Firestoreからユーザー名を取得
            db.collection("users").doc(uid).get().then(doc => {
                // 新規登録画面のユーザー名入力欄があればそれを使う（もしユーザーがログイン前に登録名を入力していた場合）
                const nameInput = document.getElementById("registerName");
                const defaultName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Guest';
                
                // Firestoreから取得できればそれを使用、なければ defaultName
                const displayName = doc.exists ? doc.data().displayName : defaultName; 
                
                // ログイン成功後、ゲームセッションに参加
                enterPark(uid, displayName, room); 
            });
        })
        .catch(error => {
            console.error("ログイン失敗:", error);
            alert("ログイン失敗: " + error.message);
        });
});