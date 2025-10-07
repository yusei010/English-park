const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const socket = io();

let myId = null;
let myName = "";
let players = {};
let x = 400, y = 300;

// 音声通話用
const peer = new Peer();
let myPeerId = null;

document.getElementById("enterBtn").onclick = () => {
  myName = document.getElementById("nameInput").value.trim();
  if (myName === "") return;

  document.getElementById("nameForm").style.display = "none";
  canvas.style.display = "block";

  myId = Math.random().toString(36).slice(2);
  players[myId] = { x, y, name: myName };
  draw();
  sendMove();

  // PeerJSの準備
  peer.on("open", id => {
    myPeerId = id;
    socket.emit("join", { peerId: id });
  });
};

// 音声通話：他人が入ってきたら発信
socket.on("join", data => {
  if (data.peerId === myPeerId) return;
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const call = peer.call(data.peerId, stream);
  });
});

// 音声通話：着信が来たら応答
peer.on("call", call => {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    call.answer(stream);
    call.on("stream", remoteStream => {
      document.getElementById("remoteAudio").srcObject = remoteStream;
    });
  });
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let id in players) {
    const p = players[id];
    ctx.fillStyle = id === myId ? "blue" : "green";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "black";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(p.name || "???", p.x, p.y - 25);
  }
}

function sendMove() {
  socket.emit("move", { id: myId, x, y, name: myName });
}

socket.on("move", data => {
  players[data.id] = { x: data.x, y: data.y, name: data.name };
  draw();
});

window.addEventListener("keydown", e => {
  if (!myId) return;
  if (e.key === "ArrowUp") y -= 10;
  if (e.key === "ArrowDown") y += 10;
  if (e.key === "ArrowLeft") x -= 10;
  if (e.key === "ArrowRight") x += 10;
  players[myId] = { x, y, name: myName };
  draw();
  sendMove();
});
