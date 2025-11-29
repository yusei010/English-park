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

// LiveKitのURLをLiveKit SDKを使用しないため削除
// LiveKitトークンの生成ロジックを削除

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

        // 自分のローカル音声ストリームを無音のaudio要素に接続してテスト可能に
        const localAudio = document.createElement('audio');
        localAudio.muted = true; // 自分の声はミュート
        localAudio.srcObject = localStream;
        document.getElementById('local-video-box').appendChild(localAudio); // local-video-box に表示/接続
        
        // マイクON/OFFボタンを追加
        addMicrophoneControls();

        return localStream;
    } catch (error) {
        console.error("メディアアクセスエラー:", error);
        // alert("マイクへのアクセスが拒否されました。設定を確認してください。");
        statusDiv.textContent = "ステータス: マイクアクセス拒否";
        return null;
    }
}

/**
 * マイクON/OFFを切り替えるボタンを追加します。
 */
function addMicrophoneControls() {
    const box = document.getElementById('local-video-box');
    const existingBtn = document.getElementById('micToggleBtn');
    if (existingBtn) return;

    const micBtn = document.createElement('button');
    micBtn.id = 'micToggleBtn';
    micBtn.textContent = 'マイク OFF';
    micBtn.className = 'toggle-button';
    micBtn.style.backgroundColor = '#f44336'; 

    micBtn.addEventListener('click', () => {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            micBtn.textContent = audioTrack.enabled ? 'マイク OFF' : 'マイク ON';
            micBtn.style.backgroundColor = audioTrack.enabled ? '#f44336' : '#4CAF50';
            micBtn.style.color = 'white';
        }
    });

    box.appendChild(micBtn);
}


// =========================================================
// 💻 WebRTC P2P 接続ロジック
// =========================================================

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

/**
 * PeerConnectionにローカルストリームのトラックを追加します。
 * @param {RTCPeerConnection} pc 
 */
function addLocalTracks(pc) {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
        console.log('Local tracks added to PeerConnection.');
    }
}

/**
 * 相手からのリモートトラック（音声）を受信した際の処理。
 * @param {string} peerId 相手のSocket ID
 * @param {RTCPeerConnection} pc PeerConnection
 */
function handleTrack(peerId, pc) {
    pc.ontrack = (event) => {
        if (event.track.kind === 'audio') {
            console.log(`Received audio track from peer: ${peerId}`);
            const remoteStream = event.streams[0];
            
            // 既存のaudio要素があれば再利用、なければ作成
            let remoteAudio = document.getElementById(`audio-${peerId}`);
            if (!remoteAudio) {
                remoteAudio = document.createElement('audio');
                remoteAudio.id = `audio-${peerId}`;
                remoteAudio.autoplay = true;
                remoteAudio.controls = false;
                remoteAudio.muted = false; // 相手の音声はミュート解除
                document.body.appendChild(remoteAudio); // 画面外の<body>に追加
            }
            
            remoteAudio.srcObject = remoteStream;
            remoteAudio.play().catch(e => console.error("Audio playback failed:", e));

            // プレイヤーの視覚的要素に音声状態インジケーターを追加
            const playerElement = document.getElementById(peerId);
            if (playerElement) {
                let indicator = document.getElementById(`mic-indicator-${peerId}`);
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.id = `mic-indicator-${peerId}`;
                    indicator.textContent = '🔊';
                    indicator.style.position = 'absolute';
                    indicator.style.top = '-10px';
                    indicator.style.left = '50%';
                    indicator.style.transform = 'translateX(-50%)';
                    indicator.style.fontSize = '12px';
                    indicator.style.color = 'lime';
                    indicator.style.display = 'block';
                    playerElement.appendChild(indicator);
                }
            }
        }
    };
}


/**
 * 新しいピア接続を作成し、シグナリングハンドラを設定します。
 * @param {string} peerId 接続する相手のSocket ID
 * @param {boolean} isInitiator 接続を開始するかどうか (Offer側)
 */
function createPeerConnection(peerId, isInitiator) {
    console.log(`Creating PeerConnection for ${peerId}, Initiator: ${isInitiator}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = pc;

    // 1. ICE候補の収集
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`Sending ICE candidate to ${peerId}`);
            socket.emit('ice-candidate', {
                targetId: peerId,
                candidate: event.candidate,
                room: currentRoom
            });
        }
    };

    // 2. リモートトラックの処理を設定
    handleTrack(peerId, pc);

    // 3. ローカルストリームのトラックを追加 (🌟 ココが最重要 🌟)
    addLocalTracks(pc);

    // 4. 接続開始 (Offer)
    if (isInitiator) {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                socket.emit('offer', {
                    targetId: peerId,
                    sessionDescription: pc.localDescription,
                    room: currentRoom
                });
                console.log(`Offer sent to ${peerId}`);
            })
            .catch(error => console.error("Error creating offer:", error));
    }
    
    return pc;
}

/**
 * 新しいピアが入室した際に呼ばれます。Offerの送信を開始します。
 * @param {string} peerId 
 */
function handleNewPeer(peerId) {
    const pc = createPeerConnection(peerId, true); // Offer側として接続開始
    // players[peerId] はすでに 'new-player' イベントで作成されているはず
}


/**
 * 相手からOfferを受信した際の処理 (Answer側)。
 * @param {string} senderId 
 * @param {RTCSessionDescriptionInit} offer 
 */
async function handleOffer(senderId, offer) {
    if (!peerConnections[senderId]) {
        // Offerを受け取った側はAnswer側となる
        const pc = createPeerConnection(senderId, false); 

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            console.log(`Offer received from ${senderId} and RemoteDescription set.`);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            socket.emit('answer', {
                targetId: senderId,
                sessionDescription: pc.localDescription,
                room: currentRoom
            });
            console.log(`Answer sent to ${senderId}`);
        } catch (error) {
            console.error("Error handling offer:", error);
        }
    }
}

/**
 * 相手からAnswerを受信した際の処理 (Offer側)。
 * @param {string} senderId 
 * @param {RTCSessionDescriptionInit} answer 
 */
function handleAnswer(senderId, answer) {
    const pc = peerConnections[senderId];
    if (pc && pc.signalingState !== 'stable') {
        pc.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => console.log(`Answer received from ${senderId} and RemoteDescription set.`))
            .catch(error => console.error("Error setting remote description from answer:", error));
    }
}

/**
 * ICE候補を受信した際の処理。
 * @param {string} senderId 
 * @param {RTCIceCandidateInit} candidate 
 */
function handleIceCandidate(senderId, candidate) {
    const pc = peerConnections[senderId];
    if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => console.error("Error adding received ICE candidate:", error));
    }
}

/**
 * ピアが退出した際の接続クリーンアップ。
 * @param {string} peerId 
 */
function handlePeerDisconnected(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    // プレイヤー要素の削除
    const playerElement = document.getElementById(peerId);
    if (playerElement) playerElement.remove();

    // 音声要素の削除
    const remoteAudio = document.getElementById(`audio-${peerId}`);
    if (remoteAudio) remoteAudio.remove();
    
    delete players[peerId];
    updatePeersInfo();
}

// =========================================================
// 🌐 Socket.IO イベントハンドラ
// =========================================================

/**
 * ゲームセッションを開始します。（LiveKit SDKを使用しないP2P版）
 */
async function startGame() {
    myId = socket.id;
    myUsername = window.username;
    currentRoom = window.room;
    
    // 1. マイクストリームを取得
    const stream = await getLocalMedia();
    if (!stream) return; // ストリーム取得失敗なら終了

    statusDiv.textContent = `ステータス: 接続済み (ID: ${myId})`;

    // 2. プレイヤー要素を自分のために作成
    myPlayerElement = createPlayerElement(myId, myUsername, true);

    // 3. サーバーに「参加」を通知
    // joinGameSession 内で呼ばれるためここでは不要だが、念のため接続が確立していることを確認
    if (socket.connected) {
         // socket.emit('join', { room: currentRoom, username: myUsername }); // joinGameSessionで処理
    }
    
    console.log(`Game started for ${myUsername} in room ${currentRoom}`);
}


// Socketが接続された時の初期処理
socket.on('connect', async () => {
    console.log('Connected to server. Socket ID:', socket.id);
    // 認証後の joinGameSession() の中で startGame が呼ばれる
    // 認証完了時に joinGameSession が呼ばれるため、ここでは何もしない
});

// プレイヤーの位置を更新
socket.on('update-players', (updatedPlayers) => {
    Object.keys(updatedPlayers).forEach(id => {
        if (id !== myId) {
            const data = updatedPlayers[id];
            if (players[id]) {
                // 既存プレイヤーの位置更新
                updatePlayerPosition(id, data.x, data.y);
            } else {
                // 新しいプレイヤーの要素を作成（新規参加は 'new-player'で処理されるはず）
                // ただし、もし 'new-player'を見逃した場合のフォールバック
                if (!document.getElementById(id)) {
                     players[id] = { id, username: data.username || 'Unknown', x: data.x, y: data.y, peerConnections: {} };
                     createPlayerElement(id, data.username || 'Unknown', false, data.x, data.y);
                }
            }
        }
    });
    updatePeersInfo();
});

// 新しいプレイヤーが入室
socket.on('new-player', (data) => {
    if (data.id !== myId) {
        console.log(`新しいプレイヤーが入室: ${data.username} (${data.id})`);
        
        // プレイヤーデータを作成し、要素をレンダリング
        players[data.id] = { id: data.id, username: data.username, x: data.x, y: data.y, peerConnections: {} };
        createPlayerElement(data.id, data.username, false, data.x, data.y);
        
        // WebRTC接続を開始 (Offerを送信する)
        handleNewPeer(data.id); 
    }
    updatePeersInfo();
});

// プレイヤーが退出
socket.on('player-left', (id) => {
    console.log(`プレイヤーが退出: ${id}`);
    handlePeerDisconnected(id);
});

// Offer受信
socket.on('offer', (data) => {
    console.log(`Received Offer from ${data.senderId}`);
    handleOffer(data.senderId, data.sessionDescription);
});

// Answer受信
socket.on('answer', (data) => {
    console.log(`Received Answer from ${data.senderId}`);
    handleAnswer(data.senderId, data.sessionDescription);
});

// ICE Candidate受信
socket.on('ice-candidate', (data) => {
    // console.log(`Received ICE Candidate from ${data.senderId}`); // ログが多いのでコメントアウト
    handleIceCandidate(data.senderId, data.candidate);
});

// =========================================================
// 🎮 ゲーム＆UI ロジック
// =========================================================

/**
 * プレイヤーのDOM要素を作成し、ゲームエリアに追加します。
 * @param {string} id Socket ID
 * @param {string} username ユーザー名
 * @param {boolean} isLocal 自分のプレイヤーかどうか
 * @param {number} x 初期X座標 (省略可能)
 * @param {number} y 初期Y座標 (省略可能)
 * @returns {HTMLElement}
 */
function createPlayerElement(id, username, isLocal, x = 50, y = 50) {
    let element = document.getElementById(id);
    if (element) return element; // 既に存在すれば再作成しない

    element = document.createElement('div');
    element.id = id;
    element.className = 'player';
    element.textContent = isLocal ? 'あなた' : username;
    
    // 初期位置を設定
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    
    if (isLocal) {
        element.style.backgroundColor = '#4CAF50'; // 自分は緑色
        element.style.zIndex = 10;
        players[id] = { id, username, x, y, peerConnections: {} }; // 自分のデータもplayersに格納
        myPlayerElement = element;
        players[id].isLocal = true;
    } else {
         element.style.backgroundColor = '#ff69b4'; // 他のプレイヤーはピンク
    }
    
    gameArea.appendChild(element);
    return element;
}

/**
 * プレイヤーのDOM要素の位置を更新します。
 * @param {string} id 
 * @param {number} x 
 * @param {number} y 
 */
function updatePlayerPosition(id, x, y) {
    const playerElement = document.getElementById(id);
    if (playerElement && players[id]) {
        playerElement.style.left = `${x}px`;
        playerElement.style.top = `${y}px`;
        players[id].x = x;
        players[id].y = y;
    }
}

/**
 * 参加者情報を更新します。
 */
function updatePeersInfo() {
    const count = Object.keys(players).length;
    peersInfoDiv.textContent = `参加者: ${count}人 (内訳: ${myUsername} 他 ${count - 1}人)`;
}

// =========================================================
// 🕹️ プレイヤー移動ロジック
// =========================================================

const MOVEMENT_SPEED = 5;
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

/**
 * アニメーションループでプレイヤーの位置を更新し、サーバーに通知します。
 */
function gameLoop() {
    if (!myPlayerElement || !players[myId]) {
        requestAnimationFrame(gameLoop);
        return;
    }
    
    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['W'] || keys['ArrowUp']) dy -= MOVEMENT_SPEED;
    if (keys['s'] || keys['S'] || keys['ArrowDown']) dy += MOVEMENT_SPEED;
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) dx -= MOVEMENT_SPEED;
    if (keys['d'] || keys['D'] || keys['ArrowRight']) dx += MOVEMENT_SPEED;

    if (dx !== 0 || dy !== 0) {
        let newX = players[myId].x + dx;
        let newY = players[myId].y + dy;

        // 画面端の制限
        const gameRect = gameArea.getBoundingClientRect();
        const playerSize = 80; // .player の width/height
        newX = Math.max(0, Math.min(newX, gameRect.width - playerSize));
        newY = Math.max(0, Math.min(newY, gameRect.height - playerSize));
        
        // ローカルでの位置更新
        updatePlayerPosition(myId, newX, newY);

        // サーバーに位置をブロードキャスト
        socket.emit('move', { room: currentRoom, x: newX, y: newY, id: myId });
    }

    requestAnimationFrame(gameLoop);
}

// ウィンドウがロードされたらゲームループを開始
window.onload = function () {
    gameLoop();
}

// 桜アニメーションのロジック (three-setup.jsからインポートされるはず)
function createSakura() {
    console.log("Sakura animation started.");
    // 実際のアニメーションロジックは three-setup.js に依存
}

// ---------------------------------------------------------------------------------
// LiveKit SDKを使用しないため、LiveKit関連の関数を削除
// ---------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------
// LiveKit接続に必要な startGame, createSakura 関数をエクスポート
// ---------------------------------------------------------------------------------

/**
 * 認証成功後に呼ばれ、Socket.IO接続とゲーム開始処理を統合します。
 * @param {string} username 
 * @param {string} room 
 */
async function joinGameSession(username, room) {
    window.username = username;
    window.room = room; 
    currentRoom = window.room;

    try {
        if (!socket.connected) {
            // Socket.IOが切断されている場合は再接続を試みる (通常は自動で繋がっているはず)
            await new Promise(resolve => {
                socket.once('connect', resolve);
                socket.connect();
            });
        }
        
        // サーバーにルームへの参加を通知
        socket.emit('join', { room: currentRoom, username: window.username });
        
        // ゲームとWebRTC接続の準備を開始
        await startGame();

        document.getElementById("status").textContent = `ステータス: 接続済み (ルーム: ${currentRoom})`;

    } catch (error) {
        console.error("ゲームセッションへの参加に失敗しました:", error);
        document.getElementById("status").textContent = `ステータス: エラー`;
    }
}


export { createSakura, startGame, joinGameSession };