// script.js - ゲームロジック、WebRTC通信、3Dアバターの制御

import { initThreeScene, updateCamera, updatePlayerPosition, getMyPlayerMesh } from './three-setup.js';

// =========================================================
// 🌐 グローバル変数と初期設定
// =========================================================

// 🚨 シグナリングサーバーは以前のデプロイURLに戻しました。
// サーバーがダウンしている場合、WebRTCチャットは機能しませんが、エラーを回避するためにこの構造が必要です。
const SERVER_URL = 'https://english-park-2f2y.onrender.com';
const socket = io(SERVER_URL);

let myId; // 自分のFirebase UID
let myUsername;
let currentRoomName;

// プレイヤーの状態を格納 (キー: Socket ID, 値: { x, y, username, mesh, peerConnections: {} })
const players = {}; 
const peerConnections = {}; 
let localStream; // 自分のローカルメディアストリーム (音声のみ)

const localPosition = { x: 0, y: 1, z: 0 }; // 自分の位置 (Three.js座標)
let moveDirection = { x: 0, y: 0 }; // 移動方向 (スティック/キーボード)

const statusDiv = document.getElementById('status');
const peersInfoDiv = document.getElementById('peers-info');
const micToggleButton = document.getElementById('micToggle');

// ------------------------------------------------------------------
// 🔑 ゲーム開始エントリポイント
// ------------------------------------------------------------------

/**
 * ログイン成功後に呼び出され、ゲームを開始する。
 */
export async function startGame(uid, username, roomName) {
    myId = uid;
    myUsername = username;
    currentRoomName = roomName;
    
    // 1. 3Dシーンの初期化
    initThreeScene('gameArea');

    // 2. プレイヤーを初期化
    players[myId] = {
        x: localPosition.x,
        y: localPosition.y,
        z: localPosition.z,
        username: myUsername,
        mesh: getMyPlayerMesh(), // Three.jsから自分のMeshを取得
        isSpeaking: false,
        peerConnections: {}
    };

    // 3. Socket.IOでの接続とルームへの参加
    setupSocketListeners();
    micToggleButton.addEventListener('click', getLocalMedia);
    
    // 4. ゲームループを開始
    gameLoop(); 

    showStatus(`広場へ接続中... ルーム: ${currentRoomName}`);
    socket.emit('join', { room: currentRoomName, username: myUsername, uid: myId });

    setupInputControls();
}

// ------------------------------------------------------------------
// 🎙️ WebRTC メディアアクセス
// ------------------------------------------------------------------

/**
 * ユーザーのメディアストリーム（音声のみ）を取得し、接続を準備します。
 */
async function getLocalMedia() {
    if (localStream) {
        showStatus("既にマイクが接続されています。", false);
        return;
    }

    try {
        // カメラは不要なため video: false
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        console.log("Local audio stream obtained.");

        micToggleButton.textContent = '🎙️ マイクON';
        micToggleButton.style.backgroundColor = '#ddffdd';
        
        showStatus("マイク接続成功！他の参加者と通信します。");
        
        // 接続済みの全ピアに対して自分のストリームを追加
        Object.keys(peerConnections).forEach(peerId => {
            localStream.getTracks().forEach(track => {
                peerConnections[peerId].addTrack(track, localStream);
            });
        });

    } catch (error) {
        console.error("Local media access failed:", error);
        showStatus(`エラー: マイク接続失敗 (${error.name}). マイク許可を確認してください。`, true);
        micToggleButton.textContent = '❌ マイク許可エラー';
        micToggleButton.style.backgroundColor = '#ffdddd';
    }
}

// ------------------------------------------------------------------
// 🌐 Socket.IOシグナリング
// ------------------------------------------------------------------

function setupSocketListeners() {
    socket.on('connect', () => {
        myId = socket.id; // Socket IDを通信用IDとして使用
        showStatus(`シグナリングサーバー接続済み (ID: ${myId})`);
    });

    socket.on('welcome', (data) => {
        showStatus(`ルームに参加しました。現在の参加者数: ${data.peers.length + 1}人`);
        
        // 既存の全ピアとPeerConnectionを作成
        data.peers.forEach(peerId => {
            createPeerConnection(peerId, true); // true: is_initiator
        });
    });

    socket.on('peer_joined', (data) => {
        showStatus(`新しい参加者 (${data.peerId}) が参加しました。`);
        createPeerConnection(data.peerId, false); // false: is_initiator
    });

    socket.on('peer_left', (data) => {
        showStatus(`参加者 (${data.peerId}) が退出しました。`);
        closePeerConnection(data.peerId);
    });

    socket.on('signal', async (data) => {
        const pc = peerConnections[data.peerId];
        if (!pc) return;

        try {
            if (data.sdp) {
                // SDP (Offer/Answer) を処理
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === 'offer') {
                    // Offerを受信した場合、Answerを作成して送信
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('signal', {
                        peerId: data.peerId,
                        sdp: pc.localDescription
                    });
                }
            } else if (data.candidate) {
                // ICE Candidate を処理
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) {
            console.error('Signaling error:', e);
        }
    });

    socket.on('position_update', (data) => {
        if (data.id !== myId) {
            // 他のプレイヤーの3Dアバターを更新
            updatePlayerPosition(data.id, data.x, data.y, data.z);
            // 2Dアバターの位置も更新（3D座標を2D画面座標に変換する必要があるが、今回は省略）
            updatePlayerAvatar2D(data.id, data.x, data.z, data.username);
        }
    });
}

// ------------------------------------------------------------------
// 🤝 WebRTC PeerConnection
// ------------------------------------------------------------------

function createPeerConnection(peerId, isInitiator) {
    if (peerConnections[peerId]) return;

    // WebRTC設定
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' } // Google STUNサーバー
        ]
    };
    
    const pc = new RTCPeerConnection(config);
    peerConnections[peerId] = pc;
    
    // ICE Candidateイベント
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                peerId: peerId,
                candidate: event.candidate
            });
        }
    };

    // リモートトラック（音声）イベント
    pc.ontrack = (event) => {
        // リモートオーディオトラックをオーディオ要素に追加
        if (event.streams && event.streams[0]) {
            const remoteAudio = document.createElement('audio');
            remoteAudio.autoplay = true;
            remoteAudio.controls = false; // プレイヤーにはコントロールは不要
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.id = `audio-${peerId}`;
            document.getElementById('remote-audio-container').appendChild(remoteAudio);
            showStatus(`音声接続成功: ${peerId}`);
        }
    };
    
    // 自分のストリームを追加 (マイクがONの場合のみ)
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Initiator (Offerの作成者) の処理
    if (isInitiator) {
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('signal', {
                    peerId: peerId,
                    sdp: pc.localDescription
                });
            } catch (e) {
                console.error('Error creating offer:', e);
            }
        };
    }
    
    // プレイヤーリストに追加 (3Dメッシュ生成は位置情報受信時に行う)
    if (!players[peerId]) {
        players[peerId] = {
            x: 0,
            y: 1, 
            z: 0,
            username: peerId.substring(0, 8), // 仮のユーザー名
            mesh: null,
            isSpeaking: false,
            peerConnections: {}
        };
        createPlayerAvatar2D(peerId, players[peerId].username);
    }
    updatePeersInfo();
}

function closePeerConnection(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
        
        // 3Dアバターと2Dアバターを削除
        // 3D削除ロジックはthree-setup.jsに実装が必要です
        document.getElementById(`player-${peerId}`)?.remove();
        document.getElementById(`audio-${peerId}`)?.remove();
        
        delete players[peerId];
    }
    updatePeersInfo();
}

/**
 * 参加者の位置情報をSocket.IOでブロードキャスト
 */
function broadcastPosition() {
    if (!socket.connected || !players[myId] || !players[myId].mesh) return;

    const data = {
        id: myId,
        username: myUsername,
        x: players[myId].mesh.position.x,
        y: players[myId].mesh.position.y,
        z: players[myId].mesh.position.z,
    };

    socket.emit('position_update', data);
}


// ------------------------------------------------------------------
// 🕹️ ゲームの入力制御
// ------------------------------------------------------------------

let keys = {};
let lastMoveTime = 0;
const MOVE_SPEED = 0.05; // 移動速度 (Three.js座標)
const POSITION_UPDATE_INTERVAL = 100; // 移動ブロードキャスト間隔

function setupInputControls() {
    document.addEventListener('keydown', (e) => { keys[e.key] = true; });
    document.addEventListener('keyup', (e) => { keys[e.key] = false; });
    
    // 仮想スティックのセットアップ
    setupJoystick();
}

// ------------------------------------------------------------------
// 🌸 桜アニメーション (Welcome画面用)
// ------------------------------------------------------------------

/**
 * 桜アニメーションの実行 (canvas-sakura.jsからのロジックを統合)
 */
export function createSakura() {
    const canvas = document.getElementById('sakuraCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    const maxPetals = 100;
    const petals = [];

    function random(min, max) {
        return Math.random() * (max - min) + min;
    }

    class Petal {
        constructor() {
            this.x = random(0, width);
            this.y = random(0, height);
            this.size = random(8, 15);
            this.speedX = random(-0.5, 0.5);
            this.speedY = random(1, 2);
            this.rotation = random(0, 360);
            this.rotationSpeed = random(-1, 1);
            this.color = `rgba(255, 192, 203, ${random(0.5, 0.9)})`; // 薄いピンク
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.rotation += this.rotationSpeed;

            if (this.y > height) {
                this.y = -this.size;
                this.x = random(0, width);
            }
            if (this.x > width || this.x < 0) {
                 this.speedX *= -1;
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation * Math.PI / 180);
            
            // 🌸 桜の花びらを描画
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(this.size / 2, -this.size / 4, this.size / 4, -this.size / 2, 0, -this.size);
            ctx.bezierCurveTo(-this.size / 4, -this.size / 2, -this.size / 2, -this.size / 4, 0, 0);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
    }

    for (let i = 0; i < maxPetals; i++) {
        petals.push(new Petal());
    }

    function animateSakura() {
        ctx.clearRect(0, 0, width, height);

        petals.forEach(petal => {
            petal.update();
            petal.draw();
        });

        requestAnimationFrame(animateSakura);
    }
    
    // リサイズ対応
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    animateSakura();
}

// ------------------------------------------------------------------
// 🚀 ゲームループ
// ------------------------------------------------------------------

function gameLoop() {
    requestAnimationFrame(gameLoop);

    if (!players[myId] || !players[myId].mesh) return;

    let dx = 0;
    let dz = 0;

    // キーボード入力
    if (keys['ArrowUp'] || keys['w']) dz -= MOVE_SPEED;
    if (keys['ArrowDown'] || keys['s']) dz += MOVE_SPEED;
    if (keys['ArrowLeft'] || keys['a']) dx -= MOVE_SPEED;
    if (keys['ArrowRight'] || keys['d']) dx += MOVE_SPEED;

    // 仮想スティック入力
    if (moveDirection.x !== 0 || moveDirection.y !== 0) {
        dx += moveDirection.x * MOVE_SPEED * 1.5;
        dz += moveDirection.y * MOVE_SPEED * 1.5;
    }

    if (dx !== 0 || dz !== 0) {
        const playerMesh = players[myId].mesh;
        
        // プレイヤーの新しい位置を計算
        let newX = playerMesh.position.x + dx;
        let newZ = playerMesh.position.z + dz;

        // 境界チェック (例: -49から49の範囲)
        const boundary = 49;
        newX = Math.max(-boundary, Math.min(boundary, newX));
        newZ = Math.max(-boundary, Math.min(boundary, newZ));

        // 自分の3Dメッシュを更新
        playerMesh.position.x = newX;
        playerMesh.position.z = newZ;

        // カメラをプレイヤーに追従させる
        updateCamera(playerMesh.position.x, playerMesh.position.z);
        
        // 位置情報をブロードキャスト
        const now = Date.now();
        if (now - lastMoveTime > POSITION_UPDATE_INTERVAL) {
            broadcastPosition();
            lastMoveTime = now;
        }
    }

    // 2Dアバターオーバーレイの更新 (3Dから2Dへの変換は省略)
    // updatePlayerHighlights();
}


// ------------------------------------------------------------------
// 📱 仮想スティック
// ------------------------------------------------------------------
let stickActive = false;
let stickBaseRect;

function setupJoystick() {
    const stickBase = document.getElementById('stickBase');
    
    // PCの場合はスティックを非表示に
    if (!('ontouchstart' in window) && window.innerWidth > 768) {
        if(stickBase) stickBase.style.display = 'none';
        return;
    }

    const stickKnob = document.getElementById('stickKnob');

    stickBase.addEventListener('pointerdown', handleStart);
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
}

function handleStart(e) {
    e.preventDefault();
    stickActive = true;
    const stickBase = document.getElementById('stickBase');
    stickBaseRect = stickBase.getBoundingClientRect();
    stickBase.setPointerCapture(e.pointerId);
}

function handleMove(e) {
    if (!stickActive || !stickBaseRect) return;
    const stickKnob = document.getElementById('stickKnob');

    const centerX = stickBaseRect.left + stickBaseRect.width / 2;
    const centerY = stickBaseRect.top + stickBaseRect.height / 2;
    const radius = stickBaseRect.width / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    let distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > radius) {
        const ratio = radius / distance;
        dx *= ratio;
        dy *= ratio;
    }

    stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

    // 移動方向を正規化 (最大速度1)
    moveDirection.x = dx / radius;
    moveDirection.y = dy / radius; // Three.jsのZ軸移動に相当
}

function handleEnd() {
    if (!stickActive) return;
    const stickKnob = document.getElementById('stickKnob');
    stickActive = false;
    moveDirection = { x: 0, y: 0 };
    stickKnob.style.transform = `translate(0, 0)`; 
}


// ------------------------------------------------------------------
// 補助関数
// ------------------------------------------------------------------

function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.backgroundColor = isError ? '#ffe0e0' : '#e0f7fa';
    statusDiv.style.color = isError ? '#c62828' : '#00838f';
}

function updatePeersInfo() {
    // ピア接続数 = peerConnections のキー数
    const peerCount = Object.keys(peerConnections).length; 
    peersInfoDiv.textContent = `接続中のピア数: ${peerCount}人`;
}

function createPlayerAvatar2D(id, username) {
    const playerEl = document.createElement('div');
    playerEl.id = `player-${id}`;
    playerEl.className = `player-avatar`;
    
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.textContent = username;

    playerEl.appendChild(nameTag);
    document.getElementById('otherPlayers2D').appendChild(playerEl);
}

function updatePlayerAvatar2D(id, x3D, z3D, username) {
    const playerEl = document.getElementById(`player-${id}`);
    if (!playerEl) {
        createPlayerAvatar2D(id, username);
        return;
    }
    
    // 3D座標を2D画面座標に変換するロジックは省略
    // 代わりに、固定の位置に表示するなどで、機能の実装を示す

    // 実際には以下のような複雑な変換が必要です
    // const screenPos = project3Dto2D(x3D, z3D); 
    // playerEl.style.left = `${screenPos.x}px`;
    // playerEl.style.top = `${screenPos.y}px`;
}

// ユーザーのアクションによって音声が開始されるように、初期化は行いません
// function handleActiveSpeakersChanged() { ... }