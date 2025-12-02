// script.js - ゲームロジック、WebRTC通信、3Dアバターの制御

import { initThreeScene, updateCamera, updatePlayerPosition, getMyPlayerMesh, removePlayerMesh, setPlayerSpeaking } from './three-setup.js';

// =========================================================
// 🌐 グローバル変数と初期設定
// =========================================================

// 🚨 シグナリングサーバーは以前のデプロイURLに戻しました。
const SERVER_URL = 'https://english-park-2f2y.onrender.com';
const socket = io(SERVER_URL); 

let myId; // 自分のSocket ID (通信用)
let myUsername;
let currentRoomName;

// プレイヤーの状態を格納 (キー: Socket ID, 値: { x, y, z, username, mesh, isSpeaking })
const players = {}; 
const peerConnections = {}; 
let localStream; // 自分のローカルメディアストリーム (音声のみ)

const statusDiv = document.getElementById('status');
const peersInfoDiv = document.getElementById('peers-info');
const micToggleButton = document.getElementById('micToggle');
const audioContext = new (window.AudioContext || window.webkitAudioContext)(); // 音声視覚化用
const analyser = audioContext.createAnalyser();

// 自分の音量監視用
let localStreamSource;

// 移動制御
let moveDirection = { x: 0, y: 0 }; 

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
        x: 0,
        y: 1,
        z: 0,
        username: myUsername,
        mesh: getMyPlayerMesh(), // Three.jsから自分のMeshを取得
        isSpeaking: false,
    };
    players[myId].mesh.name = `player-${myId}`; // 3DメッシュにIDを設定

    // 3. Socket.IOでの接続とルームへの参加
    setupSocketListeners();
    micToggleButton.addEventListener('click', getLocalMedia);
    
    // 4. ゲームループを開始
    gameLoop(); 
    checkLocalAudioAnalysisLoop(); // 自分の音量チェックを開始

    showStatus(`広場へ接続中... ルーム: ${currentRoomName}`);
    socket.emit('join', { room: currentRoomName, username: myUsername, uid: myId });

    setupInputControls();
}

// ------------------------------------------------------------------
// 🎙️ WebRTC メディアアクセスと音量分析
// ------------------------------------------------------------------

/**
 * ユーザーのメディアストリーム（音声のみ）を取得し、接続を準備します。
 */
async function getLocalMedia() {
    if (localStream) {
        // 既に接続されている場合はマイクをミュート/アンミュート
        const track = localStream.getAudioTracks()[0];
        const enabled = !track.enabled;
        track.enabled = enabled;
        updateMicButtonState(enabled);
        setPlayerSpeaking(myId, enabled && players[myId].isSpeaking); // 3Dアバターに状態を反映
        showStatus(enabled ? "マイクをONにしました。" : "マイクをOFFにしました。", false);
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        console.log("Local audio stream obtained.");

        // 音量分析ノードの設定 (自分の声の視覚化用)
        localStreamSource = audioContext.createMediaStreamSource(localStream);
        localStreamSource.connect(analyser);
        // analyser.connect(audioContext.destination); // デバッグ用。通常は不要

        updateMicButtonState(true);
        showStatus("マイク接続成功！他の参加者と通信します。");
        
        // 接続済みの全ピアに対して自分のストリームを追加
        Object.values(peerConnections).forEach(pc => {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        });

    } catch (error) {
        console.error("Local media access failed:", error);
        showStatus(`エラー: マイク接続失敗 (${error.name}). マイク許可を確認してください。`, true);
        micToggleButton.textContent = '❌ マイク許可エラー';
        micToggleButton.style.backgroundColor = '#ffdddd';
    }
}

/**
 * マイクボタンのUIを更新します。
 */
function updateMicButtonState(isEnabled) {
    if (isEnabled) {
        micToggleButton.textContent = '🎙️ マイクON (クリックでミュート)';
        micToggleButton.style.backgroundColor = '#ddffdd';
        micToggleButton.style.color = '#00838f';
    } else {
        micToggleButton.textContent = '🔇 マイクOFF (クリックでON)';
        micToggleButton.style.backgroundColor = '#ffdddd';
        micToggleButton.style.color = '#c62828';
    }
}


// ------------------------------------------------------------------
// 🌐 Socket.IOシグナリング
// ------------------------------------------------------------------

function setupSocketListeners() {
    socket.on('connect', () => {
        const oldId = myId;
        myId = socket.id; 
        
        // プレイヤーマップのキーをSocket IDに更新
        if (oldId && players[oldId]) {
            players[myId] = players[oldId];
            players[myId].mesh.name = `player-${myId}`; // 3DメッシュのIDも更新
            delete players[oldId];
        } 
        
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
        removePlayerMesh(data.peerId); // Three.jsシーンから削除
    });

    socket.on('signal', async (data) => {
        const pc = peerConnections[data.peerId];
        if (!pc) return;

        try {
            if (data.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === 'offer') {
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('signal', {
                        peerId: data.peerId,
                        sdp: pc.localDescription
                    });
                }
            } else if (data.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) {
            console.error('Signaling error:', e);
        }
    });

    socket.on('position_update', (data) => {
        if (data.id !== myId) {
            // 3Dアバターを更新 (three-setup.jsでメッシュの作成も処理される)
            updatePlayerPosition(data.id, data.x, data.y, data.z);
            
            // プレイヤーリストのユーザー名を更新 
            if (players[data.id]) {
                players[data.id].username = data.username;
            }

            // 2Dアバターの位置更新（実際には3D to 2D変換が必要なため、ここでは名前タグの更新のみ）
            updatePlayerAvatar2D(data.id, data.x, data.z, data.username); 
        }
    });
}

// ------------------------------------------------------------------
// 🤝 WebRTC PeerConnection
// ------------------------------------------------------------------

function createPeerConnection(peerId, isInitiator) {
    if (peerConnections[peerId]) return;

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
        if (event.streams && event.streams[0]) {
            const remoteAudio = document.createElement('audio');
            remoteAudio.autoplay = true;
            remoteAudio.controls = false; 
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.id = `audio-${peerId}`;
            remoteAudio.volume = 1.0; 
            document.getElementById('remote-audio-container').appendChild(remoteAudio);
            showStatus(`音声接続成功: ${peerId}`);
            
            // リモート音声の音量分析を設定
            setupRemoteAudioAnalysis(peerId, event.streams[0]);
        }
    };
    
    // 自分のストリームを追加 (マイクがONの場合のみ)
    if (localStream && localStream.getAudioTracks()[0].enabled) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Initiator の処理
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
    
    // プレイヤーリストに追加
    if (!players[peerId]) {
        players[peerId] = {
            x: 0,
            y: 1, 
            z: 0,
            username: peerId.substring(0, 8), // 仮のユーザー名
            mesh: null,
            isSpeaking: false,
        };
        createPlayerAvatar2D(peerId, players[peerId].username);
    }
    updatePeersInfo();
}

function closePeerConnection(peerId) {
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
        
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
// 🗣️ 音声視覚化 (Speaking Highlight)
// ------------------------------------------------------------------

const SPEAKING_THRESHOLD = 15; // 音量のしきい値 (0-255)
const VISUALIZATION_INTERVAL = 50; // 視覚化チェック間隔 (ms)

/**
 * リモートオーディオの音量分析を設定します。
 */
function setupRemoteAudioAnalysis(id, stream) {
    const source = audioContext.createMediaStreamSource(stream);
    const remoteAnalyser = audioContext.createAnalyser();
    
    source.connect(remoteAnalyser);
    // source.connect(audioContext.destination); // リモート音声が聞こえるように再生先に接続

    const bufferLength = remoteAnalyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkVolume = () => {
        if (!peerConnections[id]) return; // 接続が切断されていたら終了
        
        remoteAnalyser.getByteFrequencyData(dataArray);
        
        // 周波数データの平均を計算
        let sum = 0;
        for(let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;

        const isSpeaking = average > SPEAKING_THRESHOLD;
        
        if (players[id] && players[id].isSpeaking !== isSpeaking) {
            players[id].isSpeaking = isSpeaking;
            setPlayerSpeaking(id, isSpeaking); // 3Dアバターを更新
            updatePlayerAvatar2DHighlight(id, isSpeaking); // 2Dハイライトを更新
        }
        setTimeout(checkVolume, VISUALIZATION_INTERVAL);
    };
    checkVolume();
}

/**
 * 自分の音量分析を定期的にチェックします。
 */
function checkLocalAudioAnalysis() {
    if (!localStreamSource || !localStream.getAudioTracks()[0].enabled) {
        // マイクOFFの場合は話していない状態にする
        if (players[myId] && players[myId].isSpeaking) {
            players[myId].isSpeaking = false;
            setPlayerSpeaking(myId, false);
            updatePlayerAvatar2DHighlight(myId, false);
        }
        return;
    }
    
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for(let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
    }
    const average = sum / bufferLength;

    const isSpeaking = average > SPEAKING_THRESHOLD;

    if (players[myId] && players[myId].isSpeaking !== isSpeaking) {
        players[myId].isSpeaking = isSpeaking;
        setPlayerSpeaking(myId, isSpeaking); // 3Dアバターを更新
        updatePlayerAvatar2DHighlight(myId, isSpeaking); // 2Dハイライトを更新
    }
}

/**
 * 自分の音量チェックを繰り返し実行するループ
 */
function checkLocalAudioAnalysisLoop() {
    setInterval(checkLocalAudioAnalysis, VISUALIZATION_INTERVAL);
}


// ------------------------------------------------------------------
// 🕹️ ゲームの入力制御
// ------------------------------------------------------------------

let keys = {};
let lastMoveTime = 0;
const MOVE_SPEED = 0.05; // 移動速度 (Three.js座標)
const POSITION_UPDATE_INTERVAL = 100; // 移動ブロードキャスト間隔

function setupInputControls() {
    document.addEventListener('keydown', (e) => { 
        // 入力フォームでのキー操作を無視
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        keys[e.key.toLowerCase()] = true; 
    });
    document.addEventListener('keyup', (e) => { 
        keys[e.key.toLowerCase()] = false; 
    });
    
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
    if (keys['arrowup'] || keys['w']) dz -= MOVE_SPEED;
    if (keys['arrowdown'] || keys['s']) dz += MOVE_SPEED;
    if (keys['arrowleft'] || keys['a']) dx -= MOVE_SPEED;
    if (keys['arrowright'] || keys['d']) dx += MOVE_SPEED;

    // 仮想スティック入力
    if (moveDirection.x !== 0 || moveDirection.y !== 0) {
        dx += moveDirection.x * MOVE_SPEED * 1.5;
        dz += moveDirection.y * MOVE_SPEED * 1.5;
    }

    if (dx !== 0 || dz !== 0) {
        const playerMesh = players[myId].mesh;
        
        let newX = playerMesh.position.x + dx;
        let newZ = playerMesh.position.z + dz;

        // 境界チェック 
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
}


// ------------------------------------------------------------------
// 📱 仮想スティック
// ------------------------------------------------------------------
let stickActive = false;
let stickBaseRect;
let stickKnob; 

function setupJoystick() {
    const stickBase = document.getElementById('stickBase');
    stickKnob = document.getElementById('stickKnob');

    // PCの場合はスティックを非表示に
    if (!('ontouchstart' in window) && window.innerWidth > 768) {
        if(stickBase) stickBase.style.display = 'none';
        return;
    }

    if (!stickBase || !stickKnob) {
        console.warn("Joystick elements not found.");
        return;
    }

    stickBase.addEventListener('pointerdown', handleStart);
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
}

function handleStart(e) {
    e.preventDefault();
    const stickBase = document.getElementById('stickBase');
    if (!stickBase) return;

    stickActive = true;
    stickBaseRect = stickBase.getBoundingClientRect();
    stickBase.setPointerCapture(e.pointerId);
}

function handleMove(e) {
    if (!stickActive || !stickBaseRect || !stickKnob) return;

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
    if (!stickActive || !stickKnob) return;
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
    
    // 3D to 2D 変換は複雑で、Three.jsのProjectionMatrixとViewport情報を利用する必要があります。
    // そのロジックはここでは省略し、名前タグの更新のみを行います。

    const nameTag = playerEl.querySelector('.name-tag');
    if (nameTag && nameTag.textContent !== username) {
        nameTag.textContent = username;
    }
}

/**
 * 2Dアバターに話している時のハイライトを適用します。
 */
function updatePlayerAvatar2DHighlight(id, isSpeaking) {
    const playerEl = document.getElementById(`player-${id}`);
    if (playerEl) {
        if (isSpeaking) {
            playerEl.classList.add('speaking-highlight');
        } else {
            playerEl.classList.remove('speaking-highlight');
        }
    }
}