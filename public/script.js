// 🌸 桜アニメーション生成
function createSakura() {
  const container = document.querySelector(".sakura-container");
  for (let i = 0; i < 20; i++) {
    const sakura = document.createElement("div");
    sakura.className = "sakura";
    sakura.style.left = Math.random() * window.innerWidth + "px";
    sakura.style.animationDuration = (3 + Math.random() * 3) + "s";
    container.appendChild(sakura);
  }
}

// 🌸 Welcome画面 → 2秒後に広場へ
window.addEventListener("load", () => {
  createSakura();
  setTimeout(() => {
    document.getElementById("welcomeScreen").style.display = "none";
    document.getElementById("gameArea").style.display = "block";
    startGame();
  }, 2000);
});

// 🎮 広場の処理を開始
function startGame() {
  const socket = io();
  const gameArea = document.getElementById("gameArea");

  const username = prompt("名前を入力してください") || "名無し";
  const myId = "user-" + Math.floor(Math.random() * 100000);

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

  // ⌨️ キーボード操作（PC用）
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") y -= speed;
    if (e.key === "ArrowDown") y += speed;
    if (e.key === "ArrowLeft") x -= speed;
    if (e.key === "ArrowRight") x += speed;
    updatePosition();
  });

  // 📱 仮想スティック（スマホ用）
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

  socket.emit("join", { id: myId, name: username });

  socket.on("join", data => {
    console.log(`${data.name} が入室しました`);
    if (peer && localStream) {
      const call = peer.call(data.id, localStream);
      call.on("stream", remoteStream => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(e => console.log("再生エラー:", e));
      });
    }
  });

  // 🎤 マイクON/OFFボタン
  let micEnabled = true;
  let localStream;
  let audioCtx, gainNode;

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

  // 🎙️ PeerJS 音声通話
  let peer;
  let localStream;
  
  // 🎙️ マイク取得
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    localStream = stream;
  
    // ✅ PeerJS 初期化
    peer = new Peer(myId, {
      host: "peerjs.com",
      port: 443,
      secure: true
    });
  
    // ✅ 自分が接続されたとき
    peer.on("open", id => {
      console.log("✅ PeerJS接続成功:", id);
  
      // 既存のピアに発信
      peer.listAllPeers(peers => {
        peers.forEach(pid => {
          if (pid !== myId) {
            const call = peer.call(pid, stream);
            call.on("stream", remoteStream => {
              const audio = new Audio();
              audio.srcObject = remoteStream;
              audio.play().catch(e => console.log("再生エラー:", e));
            });
          }
        });
      });
    });
  
    // ✅ 他人から通話が来たとき
    peer.on("call", call => {
      call.answer(stream); // 自分の音声を返す
      call.on("stream", remoteStream => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(e => console.log("再生エラー:", e));
      });
    });
  
  }).catch(err => {
    console.error("🎤 マイク取得失敗:", err);
    alert("マイクの使用が許可されていません。設定を確認してください。");
  });
  

// ⚙️ 設定パネルのイベント
document.getElementById("settingsToggle").addEventListener("click", () => {
  const panel = document.getElementById("settingsPanel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
});

document.getElementById("stickPosition").addEventListener("change", e => {
  const pos = e.target.value;
  const base = document.getElementById("stickBase");
  if (pos === "left") {
    base.style.left = "20px";
    base.style.right = "";
  } else {
    base.style.right = "20px";
    base.style.left = "";
  }
});

document.getElementById("stickSize").addEventListener("input", e => {
  const size = parseInt(e.target.value);
  const base = document.getElementById("stickBase");
  const knob = document.getElementById("stickKnob");

  const baseSize = size + "px";
  const knobSize = size / 2 + "px";
  const knobCenter = size / 2 + "px";

  base.style.width = baseSize;
  base.style.height = baseSize;
  knob.style.width = knobSize;
  knob.style.height = knobSize;
  knob.style.left = knobCenter;
  knob.style.top = knobCenter;
});
}

