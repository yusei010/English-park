// 🔥 Firebase初期化
const firebaseConfig = {
  apiKey: "AIzaSyDQypYYlRIPBRRTNf_shVcOzl0h5n0OBus",
  authDomain: "english-park-f65d5.firebaseapp.com",
  projectId: "english-park-f65d5",
  appId: "1:522423703619:web:90ff48520d2008fbc89cf6"
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

  