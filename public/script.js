// public/script.js

// =========================================================
// 🌐 グローバル変数と初期設定
// =========================================================
const SERVER_URL = 'https://english-park-2f2y.onrender.com'; // ✅ Renderの公開URL
const socket = io(SERVER_URL); // WebSocket接続 (シグナリング用)

let myId; // 自分のFirebase UID (auth.jsから設定される)
let myUsername;
let myPlayerElement;
let currentRoom;
let lastAreaKey = ''; // 最後にいたエリアキーを保存

// プレイヤーの状態を格納 (キー: Firebase UID, 値: { x, y, username, isLocal, peerConnections: {} })
const players = {}; 

// PeerConnectionsを格納 (キー: 相手のFirebase UID, 値: RTCPeerConnectionオブジェクト)
const peerConnections = {}; 
let localStream; // 自分のローカルメディアストリーム (音声のみ)

const gameArea = document.getElementById('gameArea');
const statusDiv = document.getElementById('status');
const peersInfoDiv = document.getElementById('peers-info');

// ---------------------------------------------------------
// 🗺️ エリア設定
// ---------------------------------------------------------
// 1エリアのサイズ (px)。このサイズで画面がグリッド分割される。
const AREA_SIZE = 500; 
// プレイヤーの初期位置
const INITIAL_X = 50;
const INITIAL_Y = 50;


/**
 * 座標に基づいてエリアキーを計算します。
 * @param {number} x X座標
 * @param {number} y Y座標
 * @returns {string} エリアキー (例: "Zone_0_0", "Zone_1_0")
 */
function getAreaKey(x, y) {
    // 座標をエリアサイズで割って、整数部分（グリッド番号）を取得
    const col = Math.floor(x / AREA_SIZE);
    const row = Math.floor(y / AREA_SIZE);
    return `Zone_${col}_${row}`;
}


// =========================================================
// 🎙️ WebRTC メディアアクセス
// =========================================================
// (getLocalMedia, addMicrophoneControls は変更なし)

/**
 * ユーザーのメディアストリーム（音声のみ）を取得し、接続を準備します。
 */
async function getLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        console.log("Local audio stream obtained.");

        const localAudio = document.createElement('audio');
        localAudio.muted = true; 
        localAudio.srcObject = localStream;
        const localVideoBox = document.getElementById('local-video-box');
        if (localVideoBox) localVideoBox.appendChild(localAudio);
        
        addMicrophoneControls();

        return localStream;
    } catch (error) {
        console.error("メディアアクセスエラー:", error);
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
    if (!box || existingBtn) return;

    const micBtn = document.createElement('button');
    micBtn.id = 'micToggleBtn';
    micBtn.textContent = 'マイク OFF'; 
    micBtn.className = 'toggle-button';
    micBtn.style.backgroundColor = '#f44336'; 
    micBtn.style.color = 'white';


    micBtn.addEventListener('click', () => {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            micBtn.textContent = audioTrack.enabled ? 'マイク OFF' : 'マイク ON';
            micBtn.style.backgroundColor = audioTrack.enabled ? '#f44336' : '#4CAF50';
        }
    });

    box.appendChild(micBtn);
}


// =========================================================
// 💻 WebRTC P2P 接続ロジック (変更点：クリーンアップの強化)
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
    }
}

/**
 * 相手からのリモートトラック（音声）を受信した際の処理。
 * @param {string} peerId 相手のFirebase UID
 * @param {RTCPeerConnection} pc PeerConnection
 */
function handleTrack(peerId, pc) {
    pc.ontrack = (event) => {
        if (event.track.kind === 'audio') {
            const remoteStream = event.streams[0];
            
            let remoteAudio = document.getElementById(`audio-${peerId}`);
            if (!remoteAudio) {
                remoteAudio = document.createElement('audio');
                remoteAudio.id = `audio-${peerId}`;
                remoteAudio.autoplay = true;
                remoteAudio.controls = false;
                remoteAudio.muted = false; 
                
                const remoteBox = document.createElement('div');
                remoteBox.className = 'video-box remote-audio-box';
                remoteBox.id = `remote-box-${peerId}`;
                remoteBox.innerHTML = `<p>🔊 ${players[peerId]?.username || 'Unknown'}</p>`;
                remoteBox.appendChild(remoteAudio);
                document.getElementById('video-container').appendChild(remoteBox);
            }
            
            remoteAudio.srcObject = remoteStream;
            remoteAudio.play().catch(e => {
                console.warn("Audio playback failed (requires user interaction):", e);
            });

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
 * @param {string} peerId 接続する相手のFirebase UID
 * @param {boolean} isInitiator 接続を開始するかどうか (Offer側)
 */
function createPeerConnection(peerId, isInitiator) {
    // 既存の接続があれば一度閉じる (ルーム切り替え時のために重要)
    if (peerConnections[peerId]) {
        console.warn(`Existing PC found for ${peerId}. Closing it before creating new one.`);
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    }
    
    console.log(`Creating PeerConnection for ${peerId}, Initiator: ${isInitiator}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[peerId] = pc;

    // 1. ICE候補の収集
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetId: peerId,
                candidate: event.candidate,
                room: currentRoom // 現在のエリアキーを使用
            });
        }
    };

    // 2. リモートトラックの処理を設定
    handleTrack(peerId, pc);

    // 3. ローカルストリームのトラックを追加
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
}


/**
 * 相手からOfferを受信した際の処理 (Answer側)。
 * @param {string} senderId 
 * @param {RTCSessionDescriptionInit} offer 
 */
async function handleOffer(senderId, offer) {
    // 既に接続がある場合は無視
    if (peerConnections[senderId]) return;

    const pc = createPeerConnection(senderId, false); 

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', {
            targetId: senderId,
            sessionDescription: pc.localDescription,
            room: currentRoom
        });
    } catch (error) {
        console.error("Error handling offer:", error);
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
function cleanupPeerConnection(peerId) {
     // WebRTC接続のクリーンアップ
    if (peerConnections[peerId]) {
        try {
            peerConnections[peerId].close();
        } catch(e) { /* ignore */ }
        delete peerConnections[peerId];
    }
    
    // プレイヤー要素の削除
    const playerElement = document.getElementById(peerId);
    if (playerElement) playerElement.remove();

    // 音声要素とそのコンテナの削除
    const remoteBox = document.getElementById(`remote-box-${peerId}`);
    if (remoteBox) remoteBox.remove();
    
    // データモデルからの削除
    delete players[peerId];
    updatePeersInfo();
}

// =========================================================
// 🌐 Socket.IO イベントハンドラ (変更点：join/leaveイベントの処理)
// =========================================================

/**
 * ゲームセッションを開始します。
 * @param {string} userId 
 * @param {string} username 
 */
async function startGame() {
    // myId, myUsername は joinGameSession で windowオブジェクトから設定済み
    myId = window.myId; 
    myUsername = window.username;
    
    // 1. マイクストリームを取得
    const stream = await getLocalMedia();
    if (!stream) return; 

    // 2. プレイヤー要素を自分のために作成
    myPlayerElement = createPlayerElement(myId, myUsername, true, INITIAL_X, INITIAL_Y);
    players[myId] = { id: myId, username: myUsername, x: INITIAL_X, y: INITIAL_Y, isLocal: true, peerConnections: {} };

    // 3. 初期エリアに入室
    currentRoom = getAreaKey(INITIAL_X, INITIAL_Y);
    lastAreaKey = currentRoom;
    socket.emit('join', { room: currentRoom, username: myUsername, id: myId, x: INITIAL_X, y: INITIAL_Y });

    statusDiv.textContent = `ステータス: 接続済み (ID: ${myId.substring(0, 8)}...) | エリア: ${currentRoom}`;
    
    console.log(`Game started for ${myUsername} (${myId}) in initial room ${currentRoom}`);
}


// Socketが接続された時の初期処理
socket.on('connect', async () => {
    console.log('Connected to server. Socket ID:', socket.id);
    // 認証完了時に joinGameSession が呼ばれるため、ここでは何もしない
});

// プレイヤーの位置を更新 (既存プレイヤーの処理)
socket.on('update-players', (updatedPlayers) => {
    Object.keys(updatedPlayers).forEach(id => {
        if (id !== myId) {
            const data = updatedPlayers[id];
            
            if (!players[id]) {
                 players[id] = { id, username: data.username || 'Unknown', x: data.x, y: data.y, peerConnections: {} };
                 createPlayerElement(id, data.username || 'Unknown', false, data.x, data.y);
                 
                 // 🚨 WebRTC接続を確立 (Offerを送信)
                 if (!peerConnections[id]) {
                     handleNewPeer(id);
                 }
                 
            } else {
                // 既存プレイヤーの位置更新
                updatePlayerPosition(id, data.x, data.y);
            }
        }
    });
    updatePeersInfo();
});

// 新しいプレイヤーが入室 (誰かが join をemitした時)
socket.on('new-player', (data) => {
    if (data.id !== myId) {
        console.log(`新しいプレイヤーが入室: ${data.username} (${data.id})`);
        
        if (!players[data.id]) {
             players[data.id] = { id: data.id, username: data.username, x: data.x, y: data.y, peerConnections: {} };
             createPlayerElement(data.id, data.username, false, data.x, data.y);
        }
        
        // WebRTC接続を開始 (Offerを送信する)
        if (!peerConnections[data.id]) {
             handleNewPeer(data.id); 
        }
    }
    updatePeersInfo();
});

// プレイヤーが退出 (ルーム切り替え or ログアウト)
socket.on('player-left', (id) => {
    console.log(`プレイヤーが退出 (エリア移動/ログアウト): ${id}`);
    cleanupPeerConnection(id);
});

// Offer受信
socket.on('offer', (data) => {
    handleOffer(data.senderId, data.sessionDescription);
});

// Answer受信
socket.on('answer', (data) => {
    handleAnswer(data.senderId, data.sessionDescription);
});

// ICE Candidate受信
socket.on('ice-candidate', (data) => {
    handleIceCandidate(data.senderId, data.candidate);
});

// =========================================================
// 🗺️ エリア移動ロジック
// =========================================================

/**
 * エリアが変わったかどうかをチェックし、変わっていればルームを切り替えます。
 * @param {number} newX 
 * @param {number} newY 
 */
function handleAreaChange(newX, newY) {
    const newAreaKey = getAreaKey(newX, newY);
    
    if (newAreaKey !== lastAreaKey) {
        console.log(`エリア移動: ${lastAreaKey} -> ${newAreaKey}`);
        
        // 1. 古いルームから退出をサーバーに通知
        socket.emit('leave', { room: lastAreaKey, id: myId });

        // 2. 現在のすべてのピア接続とDOM要素をクリーンアップ
        Object.keys(peerConnections).forEach(peerId => {
            if (players[peerId] && !players[peerId].isLocal) {
                // 自分以外のプレイヤーのみクリーンアップ
                cleanupPeerConnection(peerId);
            }
        });

        // 3. 新しいルームに参加をサーバーに通知
        currentRoom = newAreaKey;
        socket.emit('join', { room: currentRoom, username: myUsername, id: myId, x: newX, y: newY });
        lastAreaKey = newAreaKey;

        statusDiv.textContent = `ステータス: 接続済み (ID: ${myId.substring(0, 8)}...) | エリア: ${currentRoom}`;
    }
}


// =========================================================
// 🕹️ プレイヤー移動ロジック (変更点：エリア切り替えの追加)
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
        
        // 🚨 エリア変更チェックとルーム切り替え
        handleAreaChange(newX, newY);

        // サーバーに位置をブロードキャスト (エリア移動チェック後)
        socket.emit('move', { room: currentRoom, x: newX, y: newY, id: myId });
    }

    requestAnimationFrame(gameLoop);
}

// ウィンドウがロードされたらゲームループを開始
window.onload = function () {
    gameLoop();
}

// ---------------------------------------------------------------------------------
// 認証連携に必要な joinGameSession 関数をエクスポート (ルーム名を動的に決定するため引数を削減)
// ---------------------------------------------------------------------------------

/**
 * 認証成功後に呼ばれ、Socket.IO接続とゲーム開始処理を統合します。
 * @param {string} userId Firebase UID (自分のID)
 * @param {string} username ユーザー名
 */
async function joinGameSession(userId, username) {
    // グローバルなwindowオブジェクトに情報を設定
    window.myId = userId;
    window.username = username;
    
    try {
        if (!socket.connected) {
            await new Promise(resolve => {
                socket.once('connect', resolve);
                socket.connect();
            });
        }
        
        // ゲームとWebRTC接続の準備を開始 (この中でjoinがemitされる)
        await startGame();

    } catch (error) {
        console.error("ゲームセッションへの参加に失敗しました:", error);
        document.getElementById("status").textContent = `ステータス: エラー`;
    }
}


// UI/ゲームロジック関数 (変更なし)

/**
 * プレイヤーのDOM要素を作成し、ゲームエリアに追加します。
 * @param {string} id Firebase UID
 * @param {string} username ユーザー名
 * @param {boolean} isLocal 自分のプレイヤーかどうか
 * @param {number} x 初期X座標 (省略可能)
 * @param {number} y 初期Y座標 (省略可能)
 * @returns {HTMLElement}
 */
function createPlayerElement(id, username, isLocal, x = INITIAL_X, y = INITIAL_Y) {
    let element = document.getElementById(id);
    if (element) return element;

    element = document.createElement('div');
    element.id = id;
    element.className = 'player';
    element.textContent = isLocal ? username + ' (あなた)' : username;
    
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    
    if (isLocal) {
        element.style.backgroundColor = '#4CAF50'; 
        element.style.zIndex = 10;
        players[id] = { id, username, x, y, isLocal: true, peerConnections: {} }; 
        myPlayerElement = element;
    } else {
         element.style.backgroundColor = '#ff69b4';
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
    // playersから自分自身を除いた数をカウント
    const remotePeersCount = Object.keys(players).filter(id => id !== myId).length;
    const count = Object.keys(players).length;

    peersInfoDiv.textContent = `エリア参加者: ${count}人 (他 ${remotePeersCount}人)`;
}


export { joinGameSession };