const socket = io();
const gameArea = document.getElementById("gameArea");

// 自分のIDとアバター生成
const myId = "user-" + Math.floor(Math.random() * 100000);
const myPlayer = document.createElement("div");
myPlayer.className = "player";
gameArea.appendChild(myPlayer);

// 初期位置と移動処理
let x = window.innerWidth / 2;
let y = window.innerHeight / 2;
const speed = 10;

function updatePosition() {
  const maxX = window.innerWidth - 80; // アバターの幅
  const maxY = window.innerHeight - 80; // アバターの高さ

  x = Math.max(0, Math.min(x, maxX));
  y = Math.max(0, Math.min(y, maxY));

  myPlayer.style.left = x + "px";
  myPlayer.style.top = y + "px";
  socket.emit("move", { id: myId, x, y });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") y -= speed;
  if (e.key === "ArrowDown") y += speed;
  if (e.key === "ArrowLeft") x -= speed;
  if (e.key === "ArrowRight") x += speed;
  updatePosition();
});

// 他のプレイヤーの表示
const others = {};

socket.on("move", data => {
  if (data.id === myId) return;
  if (!others[data.id]) {
    const newPlayer = document.createElement("div");
    newPlayer.className = "player";
    gameArea.appendChild(newPlayer);
    others[data.id] = newPlayer;
  }
  others[data.id].style.left = data.x + "px";
  others[data.id].style.top = data.y + "px";
});

socket.emit("join", { id: myId });

socket.on("join", data => {
  console.log(`${data.id} が入室しました`);
});

// 🎤 マイクON/OFFボタンの追加
let micEnabled = true;
let localStream;

const micButton = document.createElement("button");
micButton.id = "micToggle";
micButton.textContent = "🎤 マイクON";
micButton.style.position = "absolute";
micButton.style.top = "10px";
micButton.style.left = "10px";
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
const peer = new Peer(myId, {
  host: "peerjs.com",
  port: 443,
  secure: true
});

navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
  localStream = stream;

  peer.on("call", call => {
    call.answer(stream);
    call.on("stream", remoteStream => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play();
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
            audio.play();
          });
        }
      });
    });
  });
});
