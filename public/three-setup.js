// three-setup.js
export function initThreeScene(containerId) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 3, -5);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById(containerId).appendChild(renderer.domElement);

  // 🌸 環境設定: 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x88cc88 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // 🌸 プレイヤーの仮オブジェクト
  const player = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshStandardMaterial({ color: 0x3366ff })
  );
  player.position.y = 1;
  scene.add(player);

  // 🌸 光
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 5);
  scene.add(light);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  // ウィンドウサイズ変更時の処理
  window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  // アニメーション開始
  animate();

  return { scene, camera, renderer };
}


// 🌸 桜アニメーションのモック関数 (auth.jsで呼び出されるためエクスポート)
export function createSakura() {
  console.log("🌸 Sakura animation mock started. (Actual particles would render here)");
  
  // 簡単な桜の花びらを表現するパーティクルシステムを実装（モック）
  const particleCount = 200;
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const color = new THREE.Color(0xffd1dc); // 桜色

  for (let i = 0; i < particleCount; i++) {
      // ランダムな位置
      positions.push((Math.random() - 0.5) * 50);
      positions.push(Math.random() * 30 + 5); // y軸は高めに
      positions.push((Math.random() - 0.5) * 50);
      
      // 色を割り当てる
      colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
  });

  const particles = new THREE.Points(geometry, material);
  // particles.name = 'sakuraParticles';
  // initThreeScene内でsceneが返されるため、実際にはここでシーンに追加する必要がある

}


export { initThreeScene, createSakura };