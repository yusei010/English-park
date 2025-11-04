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

let username = ""; // グローバルで定義

document.getElementById("signupButton").addEventListener("click", () => {
  const name = document.getElementById("loginName").value.trim();
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  if (!name) return alert("ユーザー名を入力してください");
  username = name;

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      const uid = userCredential.user.uid;
      return db.collection("users").doc(uid).set({
        email: email,
        displayName: username,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: "online"
      }).then(() => {
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("welcomeScreen").style.display = "block";
        createSakura();
        setTimeout(() => {
          document.getElementById("welcomeScreen").style.display = "none";
          document.getElementById("gameArea").style.display = "block";
          startGame(uid);
        }, 2000);
      });
    })
    .catch(error => alert("登録失敗: " + error.message));
});

document.getElementById("loginButton").addEventListener("click", () => {
  const name = document.getElementById("loginName").value.trim();
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  if (!name) return alert("ユーザー名を入力してください");
  username = name;

  auth.signInWithEmailAndPassword(email, password)
    .then(userCredential => {
      const uid = userCredential.user.uid;
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("welcomeScreen").style.display = "block";
      createSakura();
      setTimeout(() => {
        document.getElementById("welcomeScreen").style.display = "none";
        document.getElementById("gameArea").style.display = "block";
        startGame(uid);
      }, 2000);
    })
    .catch(error => alert("ログイン失敗: " + error.message));
});
