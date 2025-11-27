// public/script.js

// =========================================================
// 🌐 グローバル変数と初期設定
// =========================================================
const SERVER_URL = 'https://english-park-2f2y.onrender.com'; // ✅ Renderの公開URL
const socket = io(SERVER_URL); // WebSocket接続 (シグナリング用)

let myId; // 自分のSocket ID
let myUsername;
let myPlayerElement;
let currentRoom;

// プレイヤーの状態を格納 (キー: Socket ID, 値: { x, y, username, peerConnections: {} })
const players = {}; 

// PeerConnectionsを格納 (キー: 相手のSocket ID, 値: RTCPeerConnectionオブジェクト)
const peerConnections = {}; 
let localStream; // 自分のローカルメディアストリーム (音声のみ)

const gameArea = document.getElementById('gameArea');
const statusDiv = document.getElementById('status');
const peersInfoDiv = document.getElementById('peers-info');

// =========================================================
// 🎙️ WebRTC メディアアクセス
// =========================================================

/**
 * ユーザーのメディアストリーム（音声のみ）を取得し、接続を準備します。
 */
async function getLocalMedia() {
    try {
        // カメラは不要なため video: false
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        console.log("Local audio stream obtained.");

        // マイクON/OFFボタンを追加
        const micToggle = document.createElement('button');
        micToggle.textContent = 'マイクON/OFF';
        micToggle.style.position = 'fixed';
        micToggle.style.bottom = '10px';
        micToggle.style.left = '10px';
        micToggle.onclick = toggleMic;
        document.body.appendChild(micToggle);

        document.getElementById('local-video-box').innerHTML = `<p>🎤 自分の音声接続中 (${window.username})</p>`;

    } catch (error) {
        console.error("メディアアクセスエラー:", error);
        alert('マイクへのアクセスを許可してください。');
        throw error;
    }
}

/**
 * マイクのON/OFFを切り替えます。
 */
function toggleMic() {
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        const button = document.querySelector('button[onclick="toggleMic()"]');
        button.textContent = audioTracks[0].enabled ? 'マイクON/OFF' : 'マイクOFF (クリックでON)';
        console.log("Mic enabled:", audioTracks[0].enabled);
    }
}

// =========================================================
// 🤝 WebRTC 接続（P2P）処理
// =========================================================

const iceConfig = {
    'iceServers': [
        // STUNサーバー: NATを越えるための自分のグローバルIPアドレスとポートを取得
        { 'urls': 'stun:stun.l.google.com:19302' },
        // 必要に応じてTURNサーバー (リレー) を追加
        // { 'urls': 'turn:example.com:3478', 'username': 'user', 'credential': 'password' }
    ]
};

/**
 * 新しい相手と PeerConnection を作成します。
 * @param {string} remoteId - 相手の Socket ID
 * @param {boolean} isCaller - trueならOfferを作成
 */
function createPeerConnection(remoteId, isCaller) {
    const peerConnection = new RTCPeerConnection(iceConfig);
    peerConnections[remoteId] = peerConnection;

    // 自分の音声トラックを PeerConnection に追加
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // 1. ICE候補交換（接続経路の発見）
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetId: remoteId,
                candidate: event.candidate
            });
        }
    };

    // 2. リモートストリームの受け取り（相手の音声トラック）
    peerConnection.ontrack = event => {
        if (event.streams && event.streams[0]) {
            handleRemoteStream(remoteId, event.streams[0]);
        }
    };

    // 3. Offer (SDP) の作成と送信
    if (isCaller) {
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                socket.emit('offer', {
                    targetId: remoteId,
                    sdp: peerConnection.localDescription
                });
            })
            .catch(e => console.error("Offer作成エラー:", e));
    }

    // P2P接続の状態を監視（デバッグ用）
    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state to ${remoteId}: ${peerConnection.connectionState}`);
        updateRemoteVideoStatus(remoteId, peerConnection.connectionState);
    };
}

/**
 * 相手の音声ストリームを受け取った時の処理
 * @param {string} remoteId - 相手の Socket ID
 * @param {MediaStream} stream - 相手の MediaStream (音声)
 */
function handleRemoteStream(remoteId, stream) {
    let audio = document.getElementById(`audio-${remoteId}`);
    
    if (!audio) {
        // 新しい <audio> 要素を作成
        audio = document.createElement('audio');
        audio.id = `audio-${remoteId}`;
        audio.autoplay = true; // 自動再生
        document.body.appendChild(audio);
        
        // 相手のステータス表示ボックスを更新
        let remoteBox = document.getElementById(`remote-box-${remoteId}`);
        if (!remoteBox) {
            remoteBox = document.createElement('div');
            remoteBox.id = `remote-box-${remoteId}`;
            remoteBox.className = 'video-box remote-box';
            document.getElementById('video-container').appendChild(remoteBox);
        }
        remoteBox.innerHTML = `<p>🔊 ${players[remoteId]?.username || remoteId} 接続中</p>`;
    }

    // ストリームを <audio> 要素に割り当て
    audio.srcObject = stream;
    console.log(`Remote stream received from ${remoteId}`);

    // 音量調整ロジックを追加 (位置による音量調整はここではなく、別のループで行う)
}

/**
 * リモート接続の状態を更新します。
 */
function updateRemoteVideoStatus(remoteId, state) {
    const remoteBox = document.getElementById(`remote-box-${remoteId}`);
    const username = players[remoteId]?.username || remoteId;
    
    if (remoteBox) {
        let text = '';
        if (state === 'connected') {
            text = `🔊 ${username} (通話OK)`;
        } else if (state === 'connecting') {
            text = `... ${username} 接続中 ...`;
        } else if (state === 'disconnected' || state === 'failed') {
            text = `⚠️ ${username} 切断/エラー`;
        } else {
            text = `💬 ${username} の状態: ${state}`;
        }
        remoteBox.innerHTML = `<p>${text}</p>`;
    }
}

// =========================================================
// ⚙️ ゲームロジックと位置情報同期
// =========================================================

// プレイヤーの初期座標と移動速度
let playerX = 500;
let playerY = 500;
const speed = 10;
const keys = {};

// キー入力の監視
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});
document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

/**
 * プレイヤー要素を画面に追加します。
 * @param {string} id - プレイヤーの Socket ID
 * @param {string} username - ユーザー名
 */
function addPlayer(id, username) {
    const playerEl = document.createElement('div');
    playerEl.className = 'player';
    playerEl.id = `player-${id}`;
    playerEl.textContent = username;
    gameArea.appendChild(playerEl);

    players[id] = {
        x: playerX, // 初期位置は自分の位置を共有
        y: playerY,
        username: username,
        element: playerEl
    };

    if (id === myId) {
        myPlayerElement = playerEl;
        // 自分のプレイヤーは赤色にするなど
        myPlayerElement.style.background = '#00bfff'; // 明るい青
    }
}

/**
 * プレイヤーの位置を更新し、サーバーに送信します。
 */
function updatePlayerPosition() {
    let moved = false;

    if (keys['w'] || keys['W'] || keys['ArrowUp']) {
        playerY = Math.max(0, playerY - speed);
        moved = true;
    }
    if (keys['s'] || keys['S'] || keys['ArrowDown']) {
        playerY = Math.min(gameArea.clientHeight - 80, playerY + speed); // 80はプレイヤーの高さ
        moved = true;
    }
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
        playerX = Math.max(0, playerX - speed);
        moved = true;
    }
    if (keys['d'] || keys['D'] || keys['ArrowRight']) {
        playerX = Math.min(gameArea.clientWidth - 80, playerX + speed); // 80はプレイヤーの幅
        moved = true;
    }

    if (myPlayerElement) {
        myPlayerElement.style.left = `${playerX}px`;
        myPlayerElement.style.top = `${playerY}px`;
    }

    // 位置が変わった場合のみサーバーに送信
    if (moved && socket.connected) {
        socket.emit('player-move', { x: playerX, y: playerY });
    }
}

/**
 * ゲームループ
 */
function gameLoop() {
    updatePlayerPosition();
    // ここで音量調整ロジックなどを実行することも可能

    requestAnimationFrame(gameLoop);
}


// =========================================================
// 🌸 桜アニメーション (簡易版)
// =========================================================

function createSakura() {
    const sakuraContainer = document.querySelector('.sakura-container');
    const petal = document.createElement('div');
    petal.className = 'petal';
    petal.style.left = `${Math.random() * 100}vw`;
    petal.style.animationDuration = `${Math.random() * 5 + 5}s`; // 5sから10s
    petal.style.opacity = `${Math.random() * 0.5 + 0.5}`; // 0.5から1.0

    sakuraContainer.appendChild(petal);

    // 30秒後に要素を削除
    setTimeout(() => {
        petal.remove();
    }, 30000);
}

// 🌸 桜の散るアニメーションを定期的に実行
setInterval(createSakura, 500); 


// =========================================================
// 🚀 開始処理とメインフロー
// =========================================================

/**
 * ゲーム開始と初期接続処理
 */
async function startGame() {
    try {
        await getLocalMedia(); // 自分のマイク接続
        gameLoop(); // ゲームループ開始

        // 初期位置をランダムに設定
        playerX = Math.floor(Math.random() * (gameArea.clientWidth - 80));
        playerY = Math.floor(Math.random() * (gameArea.clientHeight - 80));
        
        // 自分のプレイヤー要素を初期位置に配置
        addPlayer(myId, window.username); 

    } catch (e) {
        console.error("ゲーム開始に失敗:", e);
    }
}


// =========================================================
// 📡 Socket.IO イベントハンドラ
// =========================================================

// 1. 接続成功
socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected to server. My ID:', myId);
    statusDiv.textContent = 'ステータス: サーバー接続OK。ログイン待ち...';

    // ログイン処理が成功した後、joinGameSessionからsocket.emit('join')が呼ばれます
});

// 2. 新しい参加者の通知
socket.on('new-player', (data) => {
    console.log('New player joined:', data.id, data.username);
    
    // プレイヤー要素を画面に追加
    addPlayer(data.id, data.username);

    // 接続処理を開始 (Offerを作成して送信)
    createPeerConnection(data.id, true);
    
    peersInfoDiv.textContent = `参加者: ${Object.keys(players).length}人`;
});

// 3. 既存プレイヤーの初期情報（ルームに入った時）
socket.on('current-players', (data) => {
    console.log('Current players in room:', data.players);
    // 既存プレイヤーをすべて追加し、自分から接続を確立
    for (const id in data.players) {
        if (id !== myId) {
            addPlayer(id, data.players[id].username);
            
            // 既存プレイヤーごとに PeerConnection を作成 (Offerを送信)
            createPeerConnection(id, true); 
        }
    }
    peersInfoDiv.textContent = `参加者: ${Object.keys(players).length}人`;
});

// 4. プレイヤーの移動情報受信
socket.on('player-move', (data) => {
    const player = players[data.id];
    if (player && data.id !== myId) {
        player.x = data.x;
        player.y = data.y;
        player.element.style.left = `${data.x}px`;
        player.element.style.top = `${data.y}px`;
    }
});

// 5. プレイヤーの退出
socket.on('player-leave', (id) => {
    console.log('Player left:', id);
    
    // 1. 画面から要素を削除
    const playerEl = document.getElementById(`player-${id}`);
    if (playerEl) {
        playerEl.remove();
    }
    
    // 2. PeerConnection を終了
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
    
    // 3. プレイヤー情報を削除
    if (players[id]) {
        delete players[id];
    }
    
    // 4. リモートの音声/ステータス表示を削除
    const audioEl = document.getElementById(`audio-${id}`);
    if (audioEl) audioEl.remove();
    
    const remoteBox = document.getElementById(`remote-box-${id}`);
    if (remoteBox) remoteBox.remove();

    peersInfoDiv.textContent = `参加者: ${Object.keys(players).length}人`;
});

// =========================================================
// 📢 WebRTC シグナリングハンドラ
// =========================================================

// 1. Offer受信 (相手からの接続要求)
socket.on('offer', (data) => {
    const remoteId = data.id;
    const sdp = data.sdp;
    
    // Offerを作成せずにPeerConnectionを作成 (Answer側)
    createPeerConnection(remoteId, false); 
    const pc = peerConnections[remoteId];

    // Answerを作成して送信
    pc.setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => pc.createAnswer())
        .then(answer => pc.setLocalDescription(answer))
        .then(() => {
            socket.emit('answer', {
                targetId: remoteId,
                sdp: pc.localDescription
            });
        })
        .catch(e => console.error("Offer受信時のエラー:", e));
});

// 2. Answer受信
socket.on('answer', (data) => {
    const remoteId = data.id;
    const sdp = data.sdp;
    const pc = peerConnections[remoteId];
    if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(sdp))
            .catch(e => console.error("Answer受信時のエラー:", e));
    }
});

// 3. ICE Candidate受信
socket.on('ice-candidate', (data) => {
    const remoteId = data.id;
    const candidate = data.candidate;
    const pc = peerConnections[remoteId];
    if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.error("ICE Candidate追加エラー:", e));
    }
});


// =========================================================
// 🔒 認証/入室処理 (Firebase対応版)
// =========================================================
// ⚠️ このセクションは、HTMLの <script> ブロックで定義した auth, db が利用できる前提です。
// (index.html の <script> ブロックでグローバル変数として定義されています)

const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const usernameInput = document.getElementById('username-input');
const usernameLabel = document.getElementById('username-label');
const registerButton = document.getElementById('register-button');
const roomInput = document.getElementById('room-input');


// 1. 新規登録フォーム表示
window.showRegisterForm = function() {
    usernameInput.style.display = 'inline';
    usernameLabel.style.display = 'inline';
    registerButton.style.display = 'inline';
    document.querySelector('button[onclick="loginUser()"]').style.display = 'none';
    document.querySelector('button[onclick="showRegisterForm()"]').style.display = 'none';
}

// 2. 新規アカウント登録処理
window.registerUser = async function() {
    const email = emailInput.value;
    const password = passwordInput.value;
    const username = usernameInput.value;

    if (!username || username.length < 3) {
        alert('有効なユーザー名を入力してください。');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        // Firestoreにユーザー名とUIDを保存
        await db.collection("users").doc(userCredential.user.uid).set({
            username: username,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(`登録成功: ${username} さんとしてログインします。`);
        // 登録成功後、そのままルームに入室
        joinGameSession(username, roomInput.value);

    } catch (error) {
        console.error("登録エラー:", error);
        alert(`登録エラー: ${error.message}`);
    }
}

// 3. ログイン処理
window.loginUser = async function() {
    const email = emailInput.value;
    const password = passwordInput.value;
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        // Firestoreからユーザー名を取得
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            alert('ユーザーデータが見つかりません。再登録してください。');
            await auth.signOut(); // ログアウトさせる
            return;
        }
        
        const username = userDoc.data().username;
        
        alert(`ログイン成功: ${username} さん、ようこそ！`);
        // ログイン成功後、ゲームセッションに参加
        joinGameSession(username, roomInput.value);

    } catch (error) {
        console.error("ログインエラー:", error);
        alert(`ログインエラー: ${error.message}`);
    }
}

// 4. ゲームセッションへの参加ロジック (既存の startGame 呼び出し)
async function joinGameSession(username, room) {
    window.username = username;
    window.room = room; 
    currentRoom = window.room;

    try {
        if (socket.connected) {
             socket.emit('join', { room: currentRoom, username: window.username });
        }
        
        await startGame();

        document.getElementById('login-form').style.display = 'none';
        statusDiv.textContent = `ステータス: ルーム「${currentRoom}」に参加中...`;

    } catch (error) {
        console.error('接続開始エラー:', error);
    }
}

// 💡 既存の export を忘れずに
export { createSakura, startGame };