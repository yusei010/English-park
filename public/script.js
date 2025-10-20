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

  // 📱 スマホ用スティック風移動ボタン（長押し対応）
  const isMobile = /iPhone|iPad|Android/.test(navigator.userAgent);
  if (isMobile) {
    const directions = [
      { dir: "↑", dx: 0, dy: -speed },
      { dir: "↓", dx: 0, dy: speed },
      { dir: "←", dx: -speed, dy: 0 },
      { dir: "→", dx: speed, dy: 0 }
    ];

    directions.forEach(({ dir, dx, dy }) => {
      const btn = document.createElement("button");
      btn.textContent = dir;
      btn.className = "moveButton";

      btn.style.position = "fixed";
      btn.style.zIndex = "10";
      btn.style.width = "40px";
      btn.style.height = "40px";
      btn.style.fontSize = "18px";
      btn.style.opacity = "0.8";

      if (dir === "↑") { btn.style.bottom = "100px"; btn.style.left = "50%"; btn.style.transform = "translateX(-50%)"; }
      if (dir === "↓") { btn.style.bottom = "20px"; btn.style.left = "50%"; btn.style.transform = "translateX(-50%)"; }
      if (dir === "←") { btn.style.bottom = "60px"; btn.style.left = "20px"; }
      if (dir === "→") { btn.style.bottom = "60px"; btn.style.right = "20px"; }

      let interval;
      btn.addEventListener("touchstart", () => {
        interval = setInterval(() => {
          x += dx;
          y += dy;
          updatePosition();
        }, 100);
      });

      btn.addEventListener("touchend", () => {
        clearInterval(interval);
      });

      document.body.appendChild(btn);
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
  });

  // 🎤 マイクON/OFFボタン
  let micEnabled = true;
  let localStream;
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
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    localStream = stream;

    const peer = new Peer(myId, {
      host: "peerjs.com",
      port: 443,
      secure: true
    });

    peer.on("call", call => {
      call.answer(stream);
      call.on("stream", remoteStream => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(e => console.log("再生エラー:", e));
      });
    });

    peer.on("open", () => {
      peer.listAllPeers(peers => {
        peers.forEach(id => {
          if (id !== myId) {
            const call = peer.call(id, stream);
            call.on("stream", remoteStream => {
              const audio = new Audio();
              audio.srcObject = remoteStream;
              audio.play().catch(e => console.log("再生エラー:", e));
            });
          }
        });
      });
    });
  }).catch(err => {
    console.error("🎤 マイク取得失敗:", err);
  });
}
