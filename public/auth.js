// 🔥 Firebase初期化
const firebaseConfig = {
  apiKey: "AIzaSyDQypYYlRIPBRRTNf_shVcOzl0h5n0OBus",
  authDomain: "english-park-f65d5.firebaseapp.com",
  projectId: "english-park-f65d5",
  storageBucket: "english-park-f65d5.appspot.com",
  messagingSenderId: "522423703619",
  appId: "1:522423703619:web:90ff48520d2008fbc89cf6"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let username = "";
let myId = ""; // ✅ グローバルに定義

// ✅ 新規登録処理
document.getElementById("signupButton").addEventListener("click", () => {
  const name = document.getElementById("loginName").value.trim();
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value;

  if (!name || !email || !password) {
    alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
    return;
  }

  username = name;

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      myId = userCredential.user.uid;
      return db.collection("users").doc(myId).set({
        email: email,
        displayName: username,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: "online"
      }).then(() => {
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("welcomeScreen").style.display = "block";
        if (typeof createSakura === "function") createSakura();
        setTimeout(() => {
          document.getElementById("welcomeScreen").style.display = "none";
          document.getElementById("gameArea").style.display = "block";
          startGame(myId); // ✅ 引数ありで呼び出す
        }, 2000);
      });
    })
    .catch(error => {
      console.error("登録失敗:", error);
      alert("登録失敗: " + error.message);
    });
});

// ✅ ログイン処理
document.getElementById("loginButton").addEventListener("click", () => {
  const name = document.getElementById("loginName").value.trim();
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value;

  if (!name || !email || !password) {
    alert("ユーザー名・メールアドレス・パスワードをすべて入力してください");
    return;
  }

  username = name;

  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      myId = userCredential.user.uid;
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("welcomeScreen").style.display = "block";
      if (typeof createSakura === "function") createSakura();
      setTimeout(() => {
        document.getElementById("welcomeScreen").style.display = "none";
        document.getElementById("gameArea").style.display = "block";
        startGame(myId); // ✅ 引数ありで呼び出す
      }, 2000);
    })
    .catch(error => {
      console.error("ログイン失敗:", error);
      alert("ログイン失敗: " + error.message);
    });
});
