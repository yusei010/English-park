// auth.js
// 🚨【修正】importを startGame に変更 (script.jsの正しいエントリポイント)
import { startGame, createSakura } from './script.js'; 

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
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("welcomeScreen").style.display = "block";
    
    // ユーザー情報をグローバルに設定 (script.jsで参照される)
    window.username = displayName;
    window.room = roomName;
    window.myId = userId; 

    if (typeof createSakura === "function") createSakura();

    // 💡 【重要】ゲーム開始
    // 🚨【修正】呼び出す関数を joinGameSession から startGame に変更
    // script.js側のエクスポート関数に合わせる
    startGame(); 
}

// ------------------------------------------------------------------

// ✅ 新規登録処理
document.getElementById("signupButton").addEventListener("click", () => {
    // 🚨【修正】HTMLのIDに合わせて input 要素を取得
    const name = document.getElementById("loginName").value.trim(); 
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    // 🚨【修正】HTMLのIDに合わせて input 要素を取得
    const room = document.getElementById("roomInput").value.trim() || 'default-room';


    if (!name || !email || !password || !room) {
        alert("ユーザー名・メールアドレス・パスワード・ルーム名をすべて入力してください");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            const uid = userCredential.user.uid;
            
            // Firestoreにユーザー名とその他情報を保存
            return db.collection("users").doc(uid).set({
                email,
                displayName: name,
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
    // 🚨【修正】HTMLのIDに合わせて input 要素を取得
    const name = document.getElementById("loginName").value.trim(); 
    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;
    // 🚨【修正】HTMLのIDに合わせて input 要素を取得
    const room = document.getElementById("roomInput").value.trim() || 'default-room';

    if (!name || !email || !password || !room) {
        alert("ユーザー名・メールアドレス・パスワード・ルーム名をすべて入力してください");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            const uid = userCredential.user.uid;
            
            // ログイン成功後、ゲームセッションに参加
            enterPark(uid, name, room); 
        })
        .catch(error => {
            console.error("ログイン失敗:", error);
            alert("ログイン失敗: " + error.message);
        });
});