// public/script.js - WebRTC P2Pとゲームロジック

// =========================================================
// 🌐 グローバル変数と初期設定
// =========================================================
const SERVER_URL = 'https://english-park-2f2y.onrender.com'; // ✅ Renderの公開URL
// Socket.IOは<script>タグでロードされるため、io()が利用可能
const socket = io(SERVER_URL); // WebSocket接続 (シグナリング用)

// 🚨【修正】myId は Firebase UID
let myId; 
let myUsername;
let myPlayerElement;
let currentRoom;

// プレイヤーの状態を格納 (キー: 相手の Firebase UID, 値: { x, y, username, peerConnection: RTCPeerConnection })
const players = {}; 

// PeerConnectionsを格納 (キー: 相手の Firebase UID, 値: RTCPeerConnectionオブジェクト)
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
 * @param {string} remoteUserId - 相手の Firebase UID
 * @param {boolean} isCaller - trueならオファーを作成する側
 * @returns {RTCPeerConnection}
 */
function createPeerConnection(remoteUserId, isCaller) {
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
                // 🚨【修正】 targetId は相手の Firebase UID
                targetId: remoteUserId, 
                candidate: event.candidate,
                room: currentRoom // ルーム情報を追加
            });
        }
    };

    // 2. 相手からのトラック（音声）が追加された時
    pc.ontrack = (event) => {
        // 🚨【修正】 remoteUserId を使用してオーディオIDを設定
        console.log('Remote track received:', event.track.kind, 'from', remoteUserId);
        
        // 新しいAudio要素を作成し、ストリームを割り当てる
        const remoteAudio = document.createElement('audio');
        remoteAudio.autoplay = true;
        remoteAudio.controls = false; 
        remoteAudio.id = `audio-${remoteUserId}`; // 🚨【修正】IDに remoteUserId を使用
        remoteAudio.srcObject = event.streams[0];
        document.body.appendChild(remoteAudio); 
    };

    // 3. 自分のローカルストリーム（音声トラック）をPeerConnectionに追加
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // 4. PeerConnectionを格納
    peerConnections[remoteUserId] = pc;
    // プレイヤーオブジェクトにもPCの参照を格納 (アクセスしやすいように)
    // プレイヤーがまだ作成されていない場合もあるため、チェック
    if (players[remoteUserId]) {
        players[remoteUserId].peerConnection = pc; 
    } else {
        players[remoteUserId] = { peerConnection: pc }; 
    }
    
    // 5. オファーを作成する側の場合 (ネゴシエーションが必要な時)
    if (isCaller) {
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', {
                    // 🚨【修正】 targetId は相手の Firebase UID
                    targetId: remoteUserId, 
                    sdp: pc.localDescription, // 🚨【修正】SDPを送信
                    room: currentRoom // ルーム情報を追加
                });
            } catch (error) {
                console.error('Error creating offer:', error);
            }
        };
    }
    
    console.log(`PeerConnection created for ${remoteUserId}. Caller: ${isCaller}`);
    return pc;
}

/**
 * プレイヤーが退出したときのクリーンアップ処理
 * @param {string} userId - 退出したプレイヤーの Firebase UID
 */
function cleanupPeerConnection(userId) {
    const pc = peerConnections[userId];
    if (pc) {
        pc.close();
        delete peerConnections[userId];
        console.log(`PeerConnection closed and deleted for ${userId}`);
    }

    const audioEl = document.getElementById(`audio-${userId}`);
    if (audioEl) {
        audioEl.pause();
        audioEl.remove();
        console.log(`Remote audio element removed for ${userId}`);
    }
    
    // プレイヤーリストからも削除
    if (players[userId]) {
        // プレイヤー要素の削除は removePlayerElement が行うため、ここでは PC のみクリーンアップ
        delete players[userId].peerConnection; 
    }
}


// =========================================================
// 🚀 ゲームロジック (プレイヤーの移動と表示)
// =========================================================

/**
 * プレイヤーのDOM要素を作成し、ゲームエリアに追加
 * @param {string} id - Firebase UID
 * @param {string} username - ユーザー名
 * @param {boolean} isMe - 自分のプレイヤーかどうか
 */
function createPlayerElement(id, username, isMe) {
    // 🚨【修正】プレイヤーが既に存在する場合は何もしない
    if (players[id] && players[id].element) return players[id].element;

    const playerEl = document.createElement('div');
    playerEl.id = `player-${id}`;
    playerEl.className = `player ${isMe ? 'me' : 'remote'}`; // style.cssに合わせて修正
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
        myId = id; // 🚨【修正】myId に Firebase UID を設定
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
 * @param {string} id - Firebase UID
 */
function removePlayerElement(id) {
    const playerEl = document.getElementById(`player-${id}`);
    if (playerEl) {
        playerEl.remove();
    }
    delete players[id]; // 🚨【修正】players オブジェクトからも削除
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
    const userId = window.myId; // 🚨【修正】Firebase UIDを取得
    
    if (!room || !username || !userId) {
        console.error("Room, Username or UserId not set.");
        return;
    }
    
    currentRoom = room;

    document.getElementById("welcomeScreen").style.display = "none";
    document.getElementById("gameContainer").style.display = "block";
    
    // 1. ローカルメディアストリームを取得
    localStream = await getLocalMedia(); 

    // マイクON/OFFボタンが生成されたら表示
    const micToggle = document.getElementById("micToggle");
    if (micToggle) micToggle.style.display = "block"; 

    // 2. サーバーにルーム参加を通知
    if (socket.connected) {
         // 🚨【修正】 Firebase UID を id として送信
         socket.emit('join', { room: currentRoom, username: username, id: userId, x: 50, y: 50 });
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
     // three-setup.jsの機能を削除したため、この関数は空のままにしておきます。
}


// =========================================================
// 🚦 Socket.IO イベントハンドラー (シグナリング)
// =========================================================

socket.on('connect', () => {
    statusDiv.textContent = `接続成功: Socket ID = ${socket.id}`;
    // 🚨【修正】再接続時にゲームセッションを再開するロジックを追加（簡略化のため、ここではスキップ）
});

socket.on('disconnect', () => {
    statusDiv.textContent = '接続切断';
    // 全てのピア接続をクリーンアップ
    Object.keys(peerConnections).forEach(id => {
         cleanupPeerConnection(id);
    });
});

// 🚨【修正】サーバーのイベント名 'joined-room' に合わせる
socket.on('joined-room', (data) => {
    myId = data.id; // Firebase UID
    myUsername = data.username;
    
    // 自分のプレイヤー要素を作成
    createPlayerElement(myId, myUsername, true);
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

// 🚨【修正】サーバーのイベント名 'new-player' に合わせる
socket.on('new-player', (data) => {
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

// 🚨【修正】サーバーのイベント名 'player-moved' に合わせる
socket.on('player-moved', (data) => {
    updatePlayerPosition(data.id, data.x, data.y);
});

// WebRTC シグナリングイベント
socket.on('offer', async (data) => {
    // 🚨【修正】IDは data.id (Firebase UID)
    const pc = players[data.id]?.peerConnection || createPeerConnection(data.id, false);

    // 既にリモートデスクリプションが設定されている場合はスキップ
    if (pc.remoteDescription && pc.remoteDescription.type === 'offer') {
        console.warn('Received offer when remote description is already set. Skipping.');
        return;
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); // 🚨【修正】sdp フィールドを使用
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
            targetId: data.id,
            sdp: pc.localDescription,
            room: currentRoom // ルーム情報を追加
        });
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

socket.on('answer', async (data) => {
    const pc = players[data.id]?.peerConnection; // 🚨【修正】IDは data.id (Firebase UID)
    if (pc && !pc.currentRemoteDescription) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); // 🚨【修正】sdp フィールドを使用
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }
});

socket.on('ice-candidate', async (data) => {
    const pc = players[data.id]?.peerConnection; // 🚨【修正】IDは data.id (Firebase UID)
    if (pc && data.candidate) {
        try {
            // ICE候補を追加
            // RTCIdeCandidate は RTCIceCandidate の間違い
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); 
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
            // 🚨【修正】 Firebase UID と room を move イベントに追加
            socket.emit('move', { x: newX, y: newY, id: myId, room: currentRoom });
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
}

// 初期化時にジョイスティックを設定
window.addEventListener('load', () => {
    setupJoystick();
    gameLoop(); // ゲームループを開始
});