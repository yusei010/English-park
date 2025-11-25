// script.js (LiveKit対応版 - 最終版)
import { initThreeScene } from './three-setup.js'; 
import * as LivekitClient from 'https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.js';
let livekitRoom;
const dataChannelName = 'movement'; 

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

async function startGame(userId) {
  
  try {
      initThreeScene("gameArea");
  } catch (error) {
      console.error("Three.jsシーンの初期化に失敗:", error);
  }
  
  const gameArea = document.getElementById("gameArea");
  const myPlayer = document.createElement("div");
  myPlayer.className = "player";
  myPlayer.textContent = window.username; 
  gameArea.appendChild(myPlayer);

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  const speed = 10;
  
  const others = {};
  
  function updatePosition() {
    const maxX = window.innerWidth - 80;
    const maxY = window.innerHeight - 80;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    myPlayer.style.left = x + "px";
    myPlayer.style.top = y + "px";

    if (livekitRoom && livekitRoom.state === LivekitClient.RoomState.Connected) {
        const data = JSON.stringify({ x, y, name: window.username, id: window.myId });
        const encoder = new TextEncoder();
        livekitRoom.localParticipant.publishData(encoder.encode(data), LivekitClient.DataPacket_Kind.RELIABLE, [dataChannelName]);
    }
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
      const rect = stickBase.getBoundingClientRect();
      originX = rect.left + rect.width / 2; 
      originY = rect.top + rect.height / 2; 
      moveInterval = setInterval(() => {
        const dx = (parseFloat(stickKnob.style.left) || 40) - 40;
        const dy = (parseFloat(stickKnob.style.top) || 40) - 40;
        x += dx * 0.25; 
        y += dy * 0.25;
        updatePosition();
      }, 50);
    }, { passive: false }); 

    stickBase.addEventListener("touchmove", e => {
      if (!dragging) return;
      e.preventDefault(); 
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
    }, { passive: false });

    stickBase.addEventListener("touchend", () => {
      dragging = false;
      clearInterval(moveInterval);
      stickKnob.style.left = "40px";
      stickKnob.style.top = "40px";
    });
  }
  
  let micEnabled = true; 
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

  micButton.addEventListener("click", async () => {
    micEnabled = !micEnabled;
    micButton.textContent = micEnabled ? "🎤 マイクON" : "🔇 マイクOFF";
    if (livekitRoom) {
        livekitRoom.localParticipant.setMicrophoneEnabled(micEnabled);
    }
  });


  const friendPanel = document.getElementById("friendPanel");
  friendPanel.style.display = "block";
  document.getElementById("sendFriendRequest").addEventListener("click", () => {
    const targetId = document.getElementById("friendIdInput").value.trim();
    if (!targetId) return alert("相手のIDを入力してください");
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

  // 🎙️ LiveKit 音声通話接続ロジック
  try {
    // 1. サーバーからLiveKitトークンとURLを取得
    const response = await fetch(`/token?id=${window.myId}&name=${window.username}`);
    if (!response.ok) {
        throw new Error("LiveKitトークンを取得できませんでした。サーバーがLiveKit SDKを使ってトークンを生成し、/tokenエンドポイントで提供しているか確認してください。");
    }
    const { token, livekitUrl } = await response.json();

    if (token) {
        // 2. LiveKit Roomを作成
        livekitRoom = new LivekitClient.Room({
             adaptiveStream: true,
             dynacast: true,
             videoCaptureDefaults: { enabled: false }, 
             audioCaptureDefaults: { enabled: true } 
        });

        // 3. イベントリスナーの設定
        livekitRoom.on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
            if (others[participant.identity]) {
                others[participant.identity].remove();
                delete others[participant.identity];
            }
        });

        livekitRoom.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === LivekitClient.Track.Kind.Audio) {
                const audioEl = track.attach();
                document.body.appendChild(audioEl);
            }
        });
        
        // 💡 データチャンネル経由でデータを受信した時の処理 (位置同期)
        livekitRoom.on(LivekitClient.RoomEvent.DataReceived, (payload, participant, kind) => {
            const decoder = new TextDecoder();
            const dataString = decoder.decode(payload);
            
            try {
                const data = JSON.parse(dataString);
                
                if (data.x !== undefined && data.y !== undefined && data.name) {
                    const identity = participant.identity;
                    
                    if (!others[identity]) {
                      const newPlayer = document.createElement("div");
                      newPlayer.className = "player";
                      newPlayer.textContent = data.name;
                      gameArea.appendChild(newPlayer);
                      others[identity] = newPlayer;
                    }
                    others[identity].style.left = data.x + "px";
                    others[identity].style.top = data.y + "px";
                }
            } catch(e) {
                console.warn("Received non-JSON data:", dataString);
            }
        });
        

        // 4. LiveKitルームに接続
        await livekitRoom.connect(livekitUrl, token);
        console.log("✅ LiveKit接続成功:", livekitRoom.sid);

        // 5. 接続後、すぐにマイクを公開
        await livekitRoom.localParticipant.setMicrophoneEnabled(true);
        
        // 接続が成功したら、LiveKitのデータチャンネルを確立
        livekitRoom.localParticipant.createDataTrack(dataChannelName, LivekitClient.DataPacket_Kind.RELIABLE);
        
        // 初回位置情報を送信して、他の参加者に自分を認識させる
        updatePosition();
        
    } else {
        throw new Error("LiveKitトークンが見つかりません。");
    }

  } catch (err) {
    console.error(" LiveKit接続失敗:", err);
    alert(`LiveKit接続に失敗しました。LiveKitサーバー設定、またはマイク許可を確認してください: ${err.message}`);
    micButton.disabled = true;
    micButton.textContent = "❌ 通信エラー";
  }


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
}
export { createSakura, startGame };