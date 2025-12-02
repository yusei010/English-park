// three-setup.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

let scene;
let camera;
let renderer;
let myPlayerMesh;

// リモートプレイヤーのメッシュを管理
const remotePlayers = {}; 

// =========================================================
// 🌐 初期化と設定
// =========================================================

/**
 * Three.jsシーンを初期化し、カメラと環境を設定します。
 */
export function initThreeScene(containerId) {
    scene = new THREE.Scene();
    
    // カメラ設定: プレイヤーの後ろ上方に配置
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, -10); // 初期位置
    camera.lookAt(0, 1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xadd8e6); // 空の色の設定 (Light Blue)
    document.getElementById(containerId).appendChild(renderer.domElement);

    // 🌸 環境設定: 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x88cc88 }) // Green
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // 🌸 自分のプレイヤーメッシュ
    myPlayerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshStandardMaterial({ color: 0x3366ff }) // Blue
    );
    myPlayerMesh.position.y = 1;
    myPlayerMesh.castShadow = true;
    scene.add(myPlayerMesh);

    // 🌸 光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // 影の設定
    renderer.shadowMap.enabled = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;


    // リサイズイベントの処理
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // アニメーション開始
    animate();
}

/**
 * Three.jsのレンダリングループ
 */
function animate() {
    requestAnimationFrame(animate);
    
    if (renderer) {
      renderer.render(scene, camera);
    }
}

// =========================================================
// 👤 プレイヤーメッシュ操作
// =========================================================

/**
 * 自分のプレイヤーメッシュを返します。
 */
export function getMyPlayerMesh() {
    return myPlayerMesh;
}

/**
 * リモートプレイヤーのメッシュをシーンに追加します。
 */
export function addRemotePlayerMesh(id, username) {
    if (remotePlayers[id]) return remotePlayers[id];

    // シンプルなアバター（赤色のカプセルで他のプレイヤーを表現）
    const geometry = new THREE.CapsuleGeometry( 0.5, 1.0, 4, 8 ); 
    const material = new THREE.MeshStandardMaterial({ color: 0xff6666 }); // Reddish-Pink
    const playerMesh = new THREE.Mesh(geometry, material);
    playerMesh.position.y = 1; // 地面から浮かせる
    playerMesh.name = `player-${id}`;
    playerMesh.castShadow = true;

    scene.add(playerMesh);
    remotePlayers[id] = playerMesh;
    console.log(`[3D] Remote player ${username} (${id}) added.`);
    return playerMesh;
}

/**
 * リモートプレイヤーのメッシュをシーンから削除します。
 */
export function removePlayerMesh(id) {
    const mesh = remotePlayers[id];
    if (mesh) {
        scene.remove(mesh);
        // メモリ解放のためにジオメトリとマテリアルを破棄
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        delete remotePlayers[id];
        console.log(`[3D] Remote player (${id}) removed.`);
    }
}

/**
 * プレイヤーメッシュの位置を更新します（リモートプレイヤー用）。
 */
export function updatePlayerPosition(id, x, y, z) {
    let mesh = remotePlayers[id];
    
    // メッシュが存在しない場合は作成
    if (!mesh) {
        // ユーザー名がまだわからない場合があるので、IDを仮ユーザー名として渡す
        mesh = addRemotePlayerMesh(id, id.substring(0, 8)); 
    }

    if (mesh) {
        // 位置を直接更新
        mesh.position.set(x, y, z);
    }
}

// =========================================================
// 🎥 カメラ操作
// =========================================================

/**
 * カメラをプレイヤーの位置に追従させます。
 */
export function updateCamera(playerX, playerZ) {
    if (!camera) return;

    // カメラをターゲットの少し後ろ上方に設定
    // Z軸をプレイヤー位置から10単位後ろ、Y軸を5単位上
    const cameraOffsetZ = -10;
    const cameraOffsetY = 5;

    camera.position.x = playerX;
    camera.position.y = cameraOffsetY;
    camera.position.z = playerZ + cameraOffsetZ;
    
    // カメラの視線をプレイヤーの中心(y=1)に向ける
    camera.lookAt(playerX, 1, playerZ); 
}

// =========================================================
// ⚡️ WebRTCの音声視覚化
// =========================================================

/**
 * 音声のアクティビティを3Dアバターに反映させる（色を変える）
 */
export function setPlayerSpeaking(id, isSpeaking) {
    let mesh;
    let isMyPlayer = false;
    
    // 自分のメッシュを探す（myPlayerMeshはグローバル）
    if (myPlayerMesh.name === `player-${id}`) {
        mesh = myPlayerMesh;
        isMyPlayer = true;
    } else {
        mesh = remotePlayers[id];
    }

    if (mesh && mesh.material) {
        // 話しているときは明るい色、そうでないときは元の色に戻す
        if (isSpeaking) {
            // 話している時の色: 自分は明るい緑、他は明るい赤
            mesh.material.color.setHex(isMyPlayer ? 0x66ff66 : 0xff3333); 
        } else {
            // 通常時の色: 自分は青、他は赤ピンク
            mesh.material.color.setHex(isMyPlayer ? 0x3366ff : 0xff6666); 
        }
    }
}