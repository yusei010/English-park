// public/script.js (修正後の全体コード - 認証ロジック、Three.js、マルチプレイヤー受信機能追加済み)

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
    ]
};

/**
 * 新しい相手と PeerConnection を作成します。
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
    
    return peerConnection;
}

/**
 * 相手の音声ストリームを受け取った時の処理
 */
function handleRemoteStream(remoteId, stream) {
    let audio = document.getElementById(`audio-${remoteId}`);
    
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${remoteId}`;
        audio.autoplay = true; 
        document.body.appendChild(audio);
        
        let remoteBox = document.getElementById(`remote-box-${remoteId}`);
        if (!remoteBox) {
            remoteBox = document.createElement('div');
            remoteBox.id = `remote-box-${remoteId}`;
            remoteBox.className = 'video-box remote-box';
            document.getElementById('video-container').appendChild(remoteBox);
        }
        remoteBox.innerHTML = `<p>🔊 ${players[remoteId]?.username || remoteId} 接続中</p>`;
    }
    audio.srcObject = stream;
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
 */
function addPlayer(id, username, initialX = playerX, initialY = playerY) {
    const playerEl = document.createElement('div');
    playerEl.className = 'player';
    playerEl.id = `player-${id}`;
    playerEl.textContent = username;
    gameArea.appendChild(playerEl);
    
    // 初期の位置を設定
    playerEl.style.left = `${initialX}px`;
    playerEl.style.top = `${initialY}px`;

    players[id] = {
        x: initialX, 
        y: initialY,
        username: username,
        element: playerEl
    };

    if (id === myId) {
        myPlayerElement = playerEl;
        myPlayerElement.style.background = '#00bfff'; 
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
        playerY = Math.min(gameArea.clientHeight - 80, playerY + speed); 
        moved = true;
    }
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
        playerX = Math.max(0, playerX - speed);
        moved = true;
    }
    if (keys['d'] || keys['D'] || keys['ArrowRight']) {
        playerX = Math.min(gameArea.clientWidth - 80, playerX + speed); 
        moved = true;
    }

    if (myPlayerElement) {
        myPlayerElement.style.left = `${playerX}px`;
        myPlayerElement.style.top = `${playerY}px`;
    }

    if (moved && socket.connected) {
        socket.emit('player-move', { x: playerX, y: playerY });
    }
}

/**
 * ゲームループ
 */
function gameLoop() {
    updatePlayerPosition();
    requestAnimationFrame(gameLoop);
}


// =========================================================
// 🌸 桜アニメーション
// =========================================================

function createSakura() {
    const sakuraContainer = document.querySelector('.sakura-container');
    const petal = document.createElement('div');
    petal.className = 'petal';
    petal.style.left = `${Math.random() * 100}vw`;
    petal.style.animationDuration = `${Math.random() * 5 + 5}s`; 
    petal.style.opacity = `${Math.random() * 0.5 + 0.5}`; 

    if (sakuraContainer) {
        sakuraContainer.appendChild(petal);
        setTimeout(() => {
            petal.remove();
        }, 30000);
    }
}

setInterval(createSakura, 500); 


// =========================================================
// 🚀 開始処理とメインフロー
// =========================================================

/**
 * ゲーム開始と初期接続処理
 */
async function startGame() {
    try {
        // three-setup.js で定義された関数を呼び出す
        if (typeof initThreeScene === 'function') {
             // 💡 2D版のロジックが残っているため、2Dプレイヤーを削除
             // Three.jsで3Dモデルを扱う場合は、addPlayer()のDOM操作を中止し、代わりに3Dシーンのプレイヤーを操作する必要があります。
             console.warn("Three.jsシーンが初期化されました。2Dのプレイヤー描画は無視されます。");
             initThreeScene("gameArea");
        } else {
             console.warn("initThreeScene function not found. Did you forget to import/load the Three.js library?");
        }
        
        await getLocalMedia(); 
        gameLoop(); 

        playerX = Math.floor(Math.random() * (gameArea.clientWidth - 80));
        playerY = Math.floor(Math.random() * (gameArea.clientHeight - 80));
        
        // 自分のプレイヤーを画面に追加
        addPlayer(myId, window.username, playerX, playerY); 

    } catch (e) {
        console.error("ゲーム開始に失敗:", e);
    }
}


// =========================================================
// 📡 Socket.IO & WebRTC イベントハンドラ (マルチプレイヤー通信のための追加箇所)
// =========================================================

// 1. 接続成功
socket.on('connect', () => {
    myId = socket.id;
    window.myId = myId; // グローバル変数にも反映
    console.log('Connected to server. My ID:', myId);
    statusDiv.textContent = 'ステータス: サーバー接続OK。ログイン待ち...';

    // ログイン処理が成功した後、joinGameSessionからsocket.emit('join')が呼ばれます
});

// 2. 新しいプレイヤーの入室通知 (🚀 **追加**)
socket.on('new-player', (data) => {
    const { id, username, initialPlayers } = data;
    
    // 既に存在するプレイヤーを処理（ルーム入室時にサーバーからまとめて送られてくる）
    for (const remoteId in initialPlayers) {
        if (remoteId !== myId) {
            if (!players[remoteId]) {
                // プレイヤーを画面に追加 (初期位置はサーバーからのデータを使用)
                addPlayer(remoteId, initialPlayers[remoteId].username, initialPlayers[remoteId].x, initialPlayers[remoteId].y);
            }
            // 既存プレイヤーに対してWebRTC接続を開始 (自分の方がIDが小さい場合のみ)
            if (remoteId > myId) {
                createPeerConnection(remoteId, true); // true: Offerを作成する側
            }
        }
    }
    
    // 今入ってきた新しいプレイヤーを処理
    if (id !== myId && !players[id]) {
        console.log(`新しいプレイヤーが入室: ${username} (${id})`);
        addPlayer(id, username); // 初期位置はデフォルト値
        
        // 新しいプレイヤーに対してWebRTC接続を開始
        if (id < myId) {
            createPeerConnection(id, true); // true: Offerを作成する側
        }
    }
    peersInfoDiv.textContent = `参加者: ${Object.keys(players).length}人`;
});

// 3. 他のプレイヤーからの位置情報受信 (🚀 **追加**)
socket.on('player-move', (data) => {
    const { id, x, y } = data;
    
    if (id !== myId && players[id] && players[id].element) {
        // プレイヤーの位置を更新
        players[id].x = x;
        players[id].y = y;
        players[id].element.style.left = `${x}px`;
        players[id].element.style.top = `${y}px`;
    }
});

// 4. プレイヤーの退出通知 (🚀 **追加**)
socket.on('player-disconnect', (id) => {
    console.log(`プレイヤーが退出: ${id}`);
    
    // プレイヤー要素をDOMから削除
    if (players[id] && players[id].element) {
        players[id].element.remove();
    }
    // WebRTC接続を切断
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
    // 音声要素を削除
    const audioEl = document.getElementById(`audio-${id}`);
    if (audioEl) audioEl.remove();
    
    // リモートボックスを削除
    const remoteBoxEl = document.getElementById(`remote-box-${id}`);
    if (remoteBoxEl) remoteBoxEl.remove();

    // プレイヤーリストから削除
    delete players[id];

    peersInfoDiv.textContent = `参加者: ${Object.keys(players).length}人`;
});

// 5. WebRTCシグナリング受信: Offer (🚀 **追加**)
socket.on('offer', async (data) => {
    const { senderId, sdp } = data;
    console.log('Offer received from:', senderId);
    
    if (senderId !== myId) {
        const peerConnection = createPeerConnection(senderId, false); // Offerを受け取る側
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', {
            targetId: senderId,
            sdp: peerConnection.localDescription
        });
    }
});

// 6. WebRTCシグナリング受信: Answer (🚀 **追加**)
socket.on('answer', async (data) => {
    const { senderId, sdp } = data;
    console.log('Answer received from:', senderId);
    
    if (peerConnections[senderId]) {
        await peerConnections[senderId].setRemoteDescription(new RTCSessionDescription(sdp));
    }
});

// 7. WebRTCシグナリング受信: ICE Candidate (🚀 **追加**)
socket.on('ice-candidate', async (data) => {
    const { senderId, candidate } = data;
    
    if (peerConnections[senderId]) {
        try {
            await peerConnections[senderId].addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding received ICE candidate:', e);
        }
    }
});


// =========================================================
// 🔒 認証/入室処理 (Firebase対応版)
// =========================================================
// ⚠️ 修正点: auth, db を window から参照することでモジュールスコープ問題を解決

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
        // ✅ 修正点: window.auth を使用
        const userCredential = await window.auth.createUserWithEmailAndPassword(email, password);
        
        // ✅ 修正点: window.db を使用
        await window.db.collection("users").doc(userCredential.user.uid).set({
            username: username,
            email: email,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(`登録成功: ${username} さんとしてログインします。`);
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
        // ✅ 修正点: window.auth を使用
        const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;

        // ✅ 修正点: window.db を使用
        const userDoc = await window.db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            alert('ユーザーデータが見つかりません。再登録してください。');
            await window.auth.signOut(); // ログアウトさせる
            return;
        }
        
        const username = userDoc.data().username;
        
        alert(`ログイン成功: ${username} さん、ようこそ！`);
        joinGameSession(username, roomInput.value);

    } catch (error) {
        console.error("ログインエラー:", error);
        alert(`ログインエラー: ${error.message}`);
    }
}

// 4. ゲームセッションへの参加ロジック
async function joinGameSession(username, room) {
    window.username = username;
    window.room = room; 
    currentRoom = window.room;

    try {
        if (socket.connected) {
             // サーバーに入室を通知し、現在ルームにいるプレイヤーの情報を要求する
             socket.emit('join', { room: currentRoom, username: window.username, x: playerX, y: playerY });
        }
        
        await startGame();

        document.getElementById('login-form').style.display = 'none';
        statusDiv.textContent = `ステータス: ルーム「${currentRoom}」に参加中...`;

    } catch (error) {
        console.error('接続開始エラー:', error);
    }
}

// Three.js関数が他のファイルにエクスポートできるように宣言
export { createSakura, startGame };