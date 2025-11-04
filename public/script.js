let username = ""; // ログイン後にセット
let audioContext, gainNode;

// 🌸 桜アニメーション生成
function createSakura() {
  const container = document.querySelector(".sakura-container");
  const images = ["sakura1.png", "sakura2.png", "sakura3.png"];

  for (let i = 0; i < 30; i++) {
    const sakura = document.createElement("div");
    sakura.className = "sakura";

    const startLeft = Math.random() * window.innerWidth;
    const size = 20 + Math.random() * 20;
    const image = images[Math.floor(Math.random() * images.length)];

    sakura.style.left = startLeft + "px";
    sakura.style.width = size + "px";
    sakura.style.height = size + "px";
    sakura.style.backgroundImage = `url(${image})`;

    const duration = 6 + Math.random() * 6;
    const delay = Math.random() * 5;
    const opacity = 0.5 + Math.random() * 0.5;
    const z = Math.floor(Math.random() * 3);

    sakura.style.animationDuration = duration + "s";
    sakura.style.animationDelay = delay + "s";
    sakura.style.opacity = opacity;
    sakura.style.zIndex = z;

    container.appendChild(sakura);
  }
}

// 🌸 ログイン → Welcome → 広場へ
window.addEventListener("load", () => {
  const loginBtn = document.getElementById("loginButton");
  loginBtn.addEventListener("click", () => {
    const nameInput = document.getElementById("loginName");
    const name = nameInput.value.trim();
    if (name) {
      username = name;
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("welcomeScreen").style.display = "block";
      createSakura();
      setTimeout(() => {
        document.getElementById("welcomeScreen").style.display = "none";
        document.getElementById("gameArea").style.display = "block";
        startGame();
      }, 2000);
    } else {
      alert("名前を入力してください");
    }
  });
});

// 🎮 広場の処理を開始
function startGame(userId) {
  const myId = userId;
  const socket = io();
  const gameArea = document.getElementById("gameArea");
  gameArea.style.display = "block";



  // ✅ グローバルの username を使う
  const myPlayer = document.createElement("div");
  myPlayer.className = "player";
  myPlayer.textContent = username;
  gameArea.appendChild(myPlayer);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  const speed = 10;

  function updatePosition() {
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 80;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    myPlayer.style.left = x + "px";
    myPlayer.style.top = y + "px";
    socket.emit("move", { id: myId, name: username, x, y });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") y -= speed;
    if (e.key === "ArrowDown") y += speed;
    if (e.key === "ArrowLeft") x -= speed;
    if (e.key === "ArrowRight") x += speed;
    updatePosition();
  });

  const isMobile = /iPhone|iPad|Android/.test(navigator.userAgent);
  if (isMobile) {
    const stickBase = document.createElement("div");
    const stickKnob = document.createElement("div");

    stickBase.id = "stickBase";
    stickKnob.id = "stickKnob";

    stickBase.style.position = "fixed";
    stickBase.style.bottom = "20px";
    stickBase.style.left = "20px";
    stickBase.style.width = "80px";
    stickBase.style.height = "80px";
    stickBase.style.zIndex = "100";

    stickKnob.style.position = "absolute";
    stickKnob.style.width = "40px";
    stickKnob.style.height = "40px";
    stickKnob.style.left = "40px";
    stickKnob.style.top = "40px";

    document.body.appendChild(stickBase);
    stickBase.appendChild(stickKnob);

    let dragging = false;
    let originX = 0;
    let originY = 0;
    let moveInterval;

    stickBase.addEventListener("touchstart", e => {
      dragging = true;
      const touch = e.touches[0];
      originX = touch.clientX;
      originY = touch.clientY;

      moveInterval = setInterval(() => {
        const dx = parseInt(stickKnob.style.left || "40") - 40;
        const dy = parseInt(stickKnob.style.top || "40") - 40;
        x += dx * 0.1;
        y += dy * 0.1;
        updatePosition();
      }, 50);
    });

    stickBase.addEventListener("touchmove", e => {
      if (!dragging) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - originX;
      const deltaY = touch.clientY - originY;
      const maxDist = 40;
      const dist = Math.min(Math.sqrt(deltaX**2 + deltaY**2), maxDist);
      const angle = Math.atan2(deltaY, deltaX);
      const knobX = 40 + dist * Math.cos(angle);
      const knobY = 40 + dist * Math.sin(angle);
      stickKnob.style.left = knobX + "px";
      stickKnob.style.top = knobY + "px";
    });

    stickBase.addEventListener("touchend", () => {
      dragging = false;
      clearInterval(moveInterval);
      stickKnob.style.left = "40px";
      stickKnob.style.top = "40px";
    });
  }

  const others = {};
  socket.on("move", data => {
    if (data.id === myId) return;
    if (!others[data.id]) {
      const newPlayer = document.createElement("div");
      newPlayer.className = "player";
      newPlayer.textContent = data.name;
      gameArea.appendChild(newPlayer);
      others[data.id] = newPlayer;
    }
    others[data.id].style.left = data.x + "px";
    others[data.id].style.top = data.y + "px";
  });
  // 🎤 マイクON/OFFボタン
  let micEnabled = true;
  let localStream;
  let audioContext, gainNode;

  const micButton = document.createElement("button");
  micButton.id = "micToggle";
  micButton.textContent = "🎤 マイクON";
  micButton.style.position = "fixed";
  micButton.style.bottom = "10px";
  micButton.style.right = "10px";
  micButton.style.zIndex = "10";
  micButton.style.padding = "10px";
  micButton.style.fontSize = "16px";
  document.body.appendChild(micButton);

  micButton.addEventListener("click", () => {
    micEnabled = !micEnabled;
    micButton.textContent = micEnabled ? "🎤 マイクON" : "🔇 マイクOFF";
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = micEnabled;
      });
    }
  });
  // ✅ フレンド申請処理（ここに追加！）
  const friendPanel = document.getElementById("friendPanel");
  friendPanel.style.display = "block";

  document.getElementById("sendFriendRequest").addEventListener("click", () => {
    const targetId = document.getElementById("friendIdInput").value.trim();
    if (!targetId) return alert("相手のIDを入力してください");

    firebase.firestore().collection("friends").add({
      from: myId,
      to: targetId,
      status: "pending",
      requestedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      alert("申請を送信しました！");
    }).catch(err => {
      console.error("申請失敗:", err);
      alert("申請に失敗しました");
    });
  });
}

  // 🎙️ PeerJS 音声通話（反響防止・音量調整）
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    localStream = stream;

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    gainNode = audioContext.createGain();
    source.connect(gainNode); // destination には接続しない
    // gainNodeの出力をMediaStreamに変換
   const destination = audioContext.createMediaStreamDestination();
   gainNode.connect(destination);
   const processedStream = destination.stream;
   //✅ 自分の声が processedStream に乗っているか確認(後で消す)
const testAudio = new Audio();
testAudio.srcObject = processedStream;
testAudio.play().catch(e => console.log("自分の声再生エラー:", e));
   document.getElementById("micVolume").addEventListener("input", e => {
      gainNode.gain.value = parseFloat(e.target.value);
    });

    const peer = new Peer(myId, {
      host: "peerjs.com",
      port: 443,
      secure: true
    });

    peer.on("open", id => {
      console.log("✅ PeerJS接続成功:", id);
      socket.emit("join", { id: myId, name: username });
    });

    peer.on("call", call => {
      call.answer(processedStream);
      call.on("stream", remoteStream => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(e => console.log("再生エラー:", e));
      });
      call.on("error", err => {
        console.error("通話エラー（受信側）:", err);
      });
    });

    socket.on("join", data => {
      if (peer && processedStream && data.id !== myId) {
        const call = peer.call(data.id, processedStream);
        call.on("stream", remoteStream => {
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.play().catch(e => console.log("再生エラー:", e));
        });
        call.on("error", err => {
          console.error("通話エラー（発信側）:", err);
        });
      }
    });

  }).catch(err => {
    console.error("🎤 マイク取得失敗:", err);
    alert("マイクの使用が許可されていません。設定を確認してください。");
  });

  // 他プレイヤーの表示
  socket.on("move", data => {
    if (data.id === myId) return;
    if (!others[data.id]) {
      const newPlayer = document.createElement("div");
      newPlayer.className = "player";
      newPlayer.textContent = data.name;
      gameArea.appendChild(newPlayer);
      others[data.id] = newPlayer;
    }
    others[data.id].style.left = data.x + "px";
    others[data.id].style.top = data.y + "px";
  });

  // ⚙️ 設定パネルのイベント
  document.getElementById("settingsToggle").addEventListener("click", () => {
    const panel = document.getElementById("settingsPanel");
    if (panel) {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });

  document.getElementById("stickPosition").addEventListener("change", e => {
    const pos = e.target.value;
    const base = document.getElementById("stickBase");
    if (base) {
      if (pos === "left") {
        base.style.left = "20px";
        base.style.right = "";
      } else {
        base.style.right = "20px";
        base.style.left = "";
      }
    }
  });

  document.getElementById("stickSize").addEventListener("input", e => {
    const size = parseInt(e.target.value);
    const base = document.getElementById("stickBase");
    const knob = document.getElementById("stickKnob");

    if (base && knob) {
      const baseSize = size + "px";
      const knobSize = size / 2 + "px";
      const knobCenter = size / 2 + "px";

      base.style.width = baseSize;
      base.style.height = baseSize;
      knob.style.width = knobSize;
      knob.style.height = knobSize;
      knob.style.left = knobCenter;
      knob.style.top = knobCenter;
    }
  });