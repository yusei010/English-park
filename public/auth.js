// 🔥 Firebase初期化
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ✅ 新規登録処理
document.getElementById("signupButton").addEventListener("click", () => {
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      const uid = userCredential.user.uid;
      return db.collection("users").doc(uid).set({
        email: email,
        displayName: email.split("@")[0],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: "online"
      }).then(() => startGame(uid));
    })
    .catch(error => alert("登録失敗: " + error.message));
});

// ✅ ログイン処理
document.getElementById("loginButton").addEventListener("click", () => {
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      const uid = userCredential.user.uid;
      startGame(uid);
    })
    .catch(error => alert("ログイン失敗: " + error.message));
});

  