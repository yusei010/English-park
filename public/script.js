// public/script.js - WebRTC P2Pとゲームロジック

// =========================================================
// 🌐 グローバル変数と初期設定
// =========================================================
const SERVER_URL = 'https://english-park-2f2y.onrender.com'; // ✅ Renderの公開URL
// Socket.IOは<script>タグでロードされるため、io()が利用可能
const socket = io(SERVER_URL); // WebSocket接続 (シグナリング用)

let myId; // 自分のSocket ID
let myUsername;
let myPlayerElement;
let currentRoom;

// プレイヤーの状態を格納 (キー: Socket ID, 値: { x, y, username, peerConnection: RTCPeerConnection })
const players = {}; 

// PeerConnectionsを格納 (キー: 相手のSocket ID, 値: RTCPeerConnectionオブジェクト)
const peerConnections = {}; 
let localStream; // 自分のローカルメディアストリーム (音声のみ)

const gameArea = document.getElementById('gameArea');
const statusDiv = document.getElementById('status');


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
        micToggle.textContent = 'マイク OFF 🔇';
        micToggle.id = 'micToggle';
        micToggle.className = 'action-button';
        micToggle.onclick = () => {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                micToggle.textContent = audioTrack.enabled ? 'マイク OFF 🔇' : 'マイク ON 🎤';
                console.log(`Mic Toggled: ${audioTrack.enabled ? 'ON' : 'OFF'}`);
            }
        };
        document.body.appendChild(micToggle);

        return localStream;
    } catch (error) {
        console.error("Error accessing local media:", error);
        statusDiv.textContent = `エラー: マイクにアクセスできませんでした (${error.message})`;
        return null;
    }
}


// =========================================================
// ⚙️ WebRTC P2P シグナリングロジック
// =========================================================

/**
 * 新しいRTCPeerConnectionを作成し、ローカルストリームを追加します。
 * @param {string} remoteSocketId - 相手のSocket ID
 * @param {boolean} isCaller - trueならオファーを作成する側
 * @returns {RTCPeerConnection}
 */
function createPeerConnection(remoteSocketId, isCaller) {
    // STUNサーバーの設定
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
        ]
    });

    // 1. ICE候補の処理 (シグナリングサーバー経由で送信)
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetId: remoteSocketId,
                candidate: event.candidate
            });
        }
    };

    // 2. 相手からのトラック（音声）が追加された時
    pc.ontrack = (event) => {
        console.log('Remote track received:', event.track.kind, 'from', remoteSocketId);
        
        // 新しいAudio要素を作成し、ストリームを割り当てる
        const remoteAudio = document.createElement('audio');
        remoteAudio.autoplay = true;
        remoteAudio.controls = false; 
        remoteAudio.id = `audio-${remoteSocketId}`;
        remoteAudio.srcObject = event.streams[0];
        document.body.appendChild(remoteAudio); 

        // プレイヤー要素にオーディオ参照を格納
        const remotePlayer = players[remoteSocketId]?.element;
        if (remotePlayer) {
            remotePlayer.audioElement = remoteAudio;
        } 
    };

    // 3. 自分のローカルストリーム（音声トラック）をPeerConnectionに追加
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // 4. PeerConnectionを格納
    peerConnections[remoteSocketId] = pc;
    // プレイヤーオブジェクトにもPCの参照を格納 (アクセスしやすいように)
    if (players[remoteSocketId]) {
        players[remoteSocketId].peerConnection = pc; 
    } else {
        // 新しいプレイヤーからの接続の場合、このPCは先に作成される
        players[remoteSocketId] = { peerConnection: pc }; 
    }
    
    // 5. オファーを作成する側の場合 (ネゴシエーションが必要な時)
    if (isCaller) {
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', {
                    targetId: remoteSocketId,
                    sdp: pc.localDescription
                });
            } catch (error) {
                console.error('Error creating offer:', error);
            }
        };
    }
    
    console.log(`PeerConnection created for ${remoteSocketId}. Caller: ${isCaller}`);
    return pc;
}

/**
 * プレイヤーが退出したときのクリーンアップ処理
 * @param {string} socketId - 退出したプレイヤーのSocket ID
 */
function cleanupPeerConnection(socketId) {
    const pc = peerConnections[socketId];
    if (pc) {
        pc.close();
        delete peerConnections[socketId];
        console.log(`PeerConnection closed and deleted for ${socketId}`);
    }

    const audioEl = document.getElementById(`audio-${socketId}`);
    if (audioEl) {
        audioEl.pause();
        audioEl.remove();
        console.log(`Remote audio element removed for ${socketId}`);
    }
    
    // プレイヤーリストからも削除
    if (players[socketId]) {
        delete players[socketId];
    }
}


// =========================================================
// 🚀 ゲームロジック (プレイヤーの移動と表示)
// =========================================================

/**
 * プレイヤーのDOM要素を作成し、ゲームエリアに追加
 * @param {string} id - Socket ID
 * @param {string} username - ユーザー名
 * @param {boolean} isMe - 自分のプレイヤーかどうか
 */
function createPlayerElement(id, username, isMe) {
    const playerEl = document.createElement('div');
    playerEl.id = `player-${id}`;
    playerEl.className = `player-avatar ${isMe ? 'me' : 'remote'}`;
    // 初期位置は中央付近
    playerEl.style.left = '50%';
    playerEl.style.top = '50%';
    playerEl.setAttribute('data-id', id);

    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.textContent = username;

    const micIndicator = document.createElement('div');
    micIndicator.className = 'mic-indicator';
    micIndicator.innerHTML = '🔊'; 
    micIndicator.style.display = 'none'; // マイクインジケータは今回は表示しない

    playerEl.appendChild(nameTag);
    playerEl.appendChild(micIndicator);
    gameArea.appendChild(playerEl);

    // プレイヤーオブジェクトを初期化または更新
    const existingPC = players[id]?.peerConnection || null;

    players[id] = {
        x: 50, // 画面中央を初期位置とする
        y: 50,
        username: username,
        element: playerEl,
        peerConnection: existingPC, 
    };

    if (isMe) {
        myPlayerElement = playerEl;
        myId = id;
        myUsername = username;
        // 自分のIDとユーザー名をwindowに保持 (auth.jsからの参照用)
        window.myId = id; 
        window.myUsername = username;
    }

    console.log(`Player ${username} (${id}) created.`);
    return playerEl;
}

/**
 * プレイヤーを画面から削除
 * @param {string} id - Socket ID
 */
function removePlayerElement(id) {
    const playerEl = document.getElementById(`player-${id}`);
    if (playerEl) {
        playerEl.remove();
    }
    // cleanupPeerConnectionがplayersオブジェクトから削除するため、ここでは不要
    // delete players[id]; 
    console.log(`Player ${id} removed.`);
}

// プレイヤーの動きを更新
function updatePlayerPosition(id, x, y) {
    const player = players[id];
    if (player && player.element) {
        // x, y はパーセンテージとして扱う
        player.x = x;
        player.y = y;
        player.element.style.left = `${x}%`;
        player.element.style.top = `${y}%`;
    }
}

// =========================================================
// 🔑 認証・初期化 (auth.jsから呼び出されるエントリポイント)
// =========================================================

/**
 * ログイン成功後に呼び出され、ゲームを開始する。
 * @returns {void}
 */
export async function startGame() {
    // auth.jsで設定済みのグローバル変数を使用
    const room = window.room;
    const username = window.username; 
    
    if (!room || !username) {
        console.error("Room or Username not set.");
        return;
    }
    
    currentRoom = room;

    document.getElementById("welcomeScreen").style.display = "none";
    document.getElementById("gameContainer").style.display = "block";
    
    // 1. ローカルメディアストリームを取得
    // ユーザーがマイクアクセスを拒否した場合、localStream は null になる可能性がある
    localStream = await getLocalMedia(); 

    // マイクON/OFFボタンが生成されたら表示
    const micToggle = document.getElementById("micToggle");
    if (micToggle) micToggle.style.display = "block"; 

    // 2. サーバーにルーム参加を通知
    if (socket.connected) {
         socket.emit('join', { room: currentRoom, username: username });
    } else {
        console.error("Socket not connected. Cannot join room.");
        statusDiv.textContent = 'エラー: サーバーに接続できませんでした。';
    }
}

/**
 * 🌸 演出用の桜の作成 (auth.jsから呼び出される)
 */
export function createSakura() {
     // 桜の演出ロジック（ダミー）
     console.log("🌸 Sakura animation started.");
     // 実際の桜の演出コードをここに追加
}


// =========================================================
// 🚦 Socket.IO イベントハンドラー (シグナリング)
// =========================================================

socket.on('connect', () => {
    statusDiv.textContent = `接続成功: Socket ID = ${socket.id}`;
});

socket.on('disconnect', () => {
    statusDiv.textContent = '接続切断';
    // 全てのピア接続をクリーンアップ
    Object.keys(peerConnections).forEach(id => {
         cleanupPeerConnection(id);
    });
});

socket.on('joined', (data) => {
    myId = data.id;
    // 自分のプレイヤー要素を作成
    createPlayerElement(myId, data.username, true);
    console.log(`Joined room ${data.room} as ${data.username} (${myId})`);

    // 既存のプレイヤーを全て表示し、それぞれとPeerConnectionを確立
    data.existingPlayers.forEach(p => {
        if (p.id !== myId) {
            createPlayerElement(p.id, p.username, false);
            // 既存のプレイヤーとの接続を開始 (オファーを作成する側)
            createPeerConnection(p.id, true);
        }
    });
});

socket.on('player-joined', (data) => {
    console.log(`New player joined: ${data.username} (${data.id})`);
    
    // プレイヤー要素を作成
    createPlayerElement(data.id, data.username, false);
    
    // 新しいプレイヤーのためのPeerConnectionを準備 (オファーを受け取る側として準備)
    createPeerConnection(data.id, false); 
});

socket.on('player-left', (id) => {
    console.log(`Player left: ${id}`);
    removePlayerElement(id);
    cleanupPeerConnection(id); // PeerConnectionのクリーンアップ
});

socket.on('player-moved', (data) => {
    updatePlayerPosition(data.id, data.x, data.y);
});

// WebRTC シグナリングイベント
socket.on('offer', async (data) => {
    // PeerConnectionが存在しない場合は新しく作成 (オファーを受け取る側)
    const pc = players[data.id]?.peerConnection || createPeerConnection(data.id, false);

    if (pc.remoteDescription && pc.remoteDescription.type === 'offer') {
        console.warn('Received offer when remote description is already set. Skipping.');
        return;
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
            targetId: data.id,
            sdp: pc.localDescription
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

socket.on('answer', async (data) => {
    const pc = players[data.id]?.peerConnection;
    if (pc && !pc.currentRemoteDescription) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
});

socket.on('ice-candidate', async (data) => {
    const pc = players[data.id]?.peerConnection;
    if (pc && data.candidate) {
        try {
            // ICE候補を追加
            await pc.addIceCandidate(new RTCIdeCandidate(data.candidate));
        } catch (error) {
            // 接続状態によってはICE候補の追加が失敗することがある（無視してOK）
            // console.error('Error adding ICE candidate:', error);
        }
    }
});


// =========================================================
// 🕹️ キーボード/仮想スティックによる移動
// =========================================================

let keys = {};
let lastMoveTime = 0;
const MOVE_INTERVAL = 50; // 50msごとに移動を送信
const MOVE_SPEED = 0.5; // 移動速度 (% per frame)

document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

function gameLoop() {
    requestAnimationFrame(gameLoop);

    if (!myId || !myPlayerElement || !currentRoom || !players[myId]) return;

    let dx = 0;
    let dy = 0;

    // キーボード入力による移動
    if (keys['ArrowUp'] || keys['w']) dy -= MOVE_SPEED;
    if (keys['ArrowDown'] || keys['s']) dy += MOVE_SPEED;
    if (keys['ArrowLeft'] || keys['a']) dx -= MOVE_SPEED;
    if (keys['ArrowRight'] || keys['d']) dx += MOVE_SPEED;

    // 仮想スティック入力による移動 (スティックの値を加算)
    if (stickDirection.x !== 0 || stickDirection.y !== 0) {
        dx += stickDirection.x * 0.5;
        dy += stickDirection.y * 0.5;
    }

    if (dx !== 0 || dy !== 0) {
        // 新しい位置を計算
        let newX = players[myId].x + dx;
        let newY = players[myId].y + dy;

        // 画面端の制約 (0% から 100%)
        newX = Math.max(0, Math.min(100, newX));
        newY = Math.max(0, Math.min(100, newY));

        // ローカルでの位置更新
        updatePlayerPosition(myId, newX, newY);

        // 一定間隔でサーバーに位置を送信
        const now = Date.now();
        if (now - lastMoveTime > MOVE_INTERVAL) {
            socket.emit('move', { x: newX, y: newY });
            lastMoveTime = now;
        }
    }
}

// 仮想スティック制御
let stickDirection = { x: 0, y: 0 };
let stickBase = null;
let stickKnob = null;
let stickActive = false;
let stickBaseRect;

function setupJoystick() {
    stickBase = document.getElementById('stickBase');
    stickKnob = document.getElementById('stickKnob');

    if (!stickBase || !stickKnob) return; 

    stickBase.addEventListener('pointerdown', handleStart);
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
}

function handleStart(e) {
    e.preventDefault();
    stickActive = true;
    stickBaseRect = stickBase.getBoundingClientRect();
    stickBase.setPointerCapture(e.pointerId);
}

function handleMove(e) {
    if (!stickActive) return;

    const centerX = stickBaseRect.left + stickBaseRect.width / 2;
    const centerY = stickBaseRect.top + stickBaseRect.height / 2;
    const radius = stickBaseRect.width / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    let distance = Math.sqrt(dx * dx + dy * dy);

    // ノブをベース内に制限
    if (distance > radius) {
        const ratio = radius / distance;
        dx *= ratio;
        dy *= ratio;
        distance = radius;
    }

    // ノブの位置を更新
    stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

    // 移動方向を正規化 (最大速度1)
    stickDirection.x = dx / radius;
    stickDirection.y = dy / radius;
}

function handleEnd() {
    if (!stickActive) return;
    stickActive = false;
    stickDirection = { x: 0, y: 0 };
    // ノブを中央に戻す
    stickKnob.style.transform = `translate(0, 0)`; 
    // translateの基準がノブの中心になるよう、CSSで調整が必要です。
    // スタイルシートを修正できないため、ノブがベースの中心に戻るよう値をリセットします。
}

// 初期化時にジョイスティックを設定
window.addEventListener('load', () => {
    setupJoystick();
    gameLoop(); // ゲームループを開始
});