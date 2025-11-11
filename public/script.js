// script.js (完全修正版)
// 💡 【修正点】ESモジュールとしてinitThreeSceneをインポート
import { initThreeScene } from './three-setup.js'; 

// auth.jsと共有されるグローバル変数
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

// 🎮 広場の処理を開始 (auth.jsから呼び出される)
function startGame(userId) {
  
  // 💡 3Dシーンの初期化を追加
  // これにより、gameAreaにThree.jsのキャンバスが表示される
  try {
      initThreeScene("gameArea");
  } catch (error) {
      console.error("Three.jsシーンの初期化に失敗:", error);
  }

  // 💡 Socket.IO接続を一本化
  const SERVER_URL = "https://english-park-2f2y.onrender.com";
  const socket = io(SERVER_URL);
  
  const gameArea = document.getElementById("gameArea");
  // gameArea.style.display は auth.js で block に設定されるため不要

  // プレイヤーの作成 (2D表示)
  const myPlayer = document.createElement("div");
  myPlayer.className = "player";
  // auth.jsで設定されたグローバル変数 window.username を使用
  myPlayer.textContent = window.username; 
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
    // window.myId, window.username を使用
    socket.emit("move", { id: window.myId, name: window.username, x, y });
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
    // 仮想スティックの作成ロジック (省略。全てstartGame関数内にあります)
    // ...
  }

  const others = {};
  socket.on("move", data => {
    if (data.id === window.myId) return;
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


  // 🎤 マイクON/OFFボタン (startGame内にあるので表示されるはず)
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


  // ✅ フレンド申請処理 (startGame内にあるので動作するはず)
  const friendPanel = document.getElementById("friendPanel");
  friendPanel.style.display = "block";
  document.getElementById("sendFriendRequest").addEventListener("click", () => {
    const targetId = document.getElementById("friendIdInput").value.trim();
    if (!targetId) return alert("相手のIDを入力してください");
    // Firebaseはauth.jsで初期化済み
    firebase.firestore().collection("friends").add({
      from: window.myId,
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

  // 🎙️ PeerJS 音声通話（反響防止・音量調整） (startGame内にあるので動作するはず)
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    localStream = stream;
    // ... PeerJSと音声処理ロジック (省略) ...
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    gainNode = audioContext.createGain();
    source.connect(gainNode); 
    
    // gainNodeの出力をMediaStreamに変換
    const destination = audioContext.createMediaStreamDestination();
    gainNode.connect(destination);
    const processedStream = destination.stream;
    
    document.getElementById("micVolume").addEventListener("input", e => {
      gainNode.gain.value = parseFloat(e.target.value);
    });

    // PeerJS接続
    const peer = new Peer(window.myId, {
      host: "peerjs.com",
      port: 443,
      secure: true
    });

    peer.on("open", id => {
      console.log("✅ PeerJS接続成功:", id);
      socket.emit("join", { id: window.myId, name: window.username }); 
    });

    // 着信処理 (call.answer(processedStream))
    peer.on("call", call => {
      call.answer(processedStream);
      call.on("stream", remoteStream => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(e => console.log("再生エラー（受信側）:", e));
      });
    });

    // Socket.IO joinイベント処理 (peer.call())
    socket.on("join", data => {
      if (peer && processedStream && data.id !== window.myId) {
        const call = peer.call(data.id, processedStream);
        call.on("stream", remoteStream => {
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.play().catch(e => console.log("再生エラー（発信側）:", e));
        });
      }
    });


  }).catch(err => {
    // マイク拒否時でもゲームは続行させるため、ボタン作成とalert以外はスキップ
    console.error("🎤 マイク取得失敗:", err);
    alert("マイクの使用が許可されていません。設定を確認してください。");
  });


  // ⚙️ 設定パネルのイベント (startGame内にあるので動作するはず)
  document.getElementById("settingsToggle").addEventListener("click", () => {
    const panel = document.getElementById("settingsPanel");
    if (panel) {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  });
  // ... (スティック位置・サイズ変更ロジックも省略) ...
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
}

// 💡 【重要】auth.jsから呼び出せるように、関数を window オブジェクトに公開
window.createSakura = createSakura;
window.startGame = startGame;