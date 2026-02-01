import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- UI要素 ---
const menu = document.getElementById('context-menu');
const moveInfo = document.getElementById('move-info');
const helpPanel = document.getElementById('help-panel');
const resetBtn = document.getElementById('reset-btn');
const inputW = document.getElementById('input-width');
const inputD = document.getElementById('input-depth');
const inputH = document.getElementById('input-height');
const valW = document.getElementById('val-w');
const valD = document.getElementById('val-d');
const valH = document.getElementById('val-h');
const closeBtn = document.getElementById('close-menu');

// イベント伝播遮断
const stopProp = (e) => e.stopPropagation();
menu.addEventListener('pointerdown', stopProp);
menu.addEventListener('pointermove', stopProp);
menu.addEventListener('wheel', stopProp);
resetBtn.addEventListener('pointerdown', stopProp);

// --- シーン設定 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(200, 200, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ★変更点1：Dampingを無効化（常時ループ計算を避けるため）
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; 

// ★変更点2：レンダリング関数の定義（必要な時だけこれを呼ぶ）
const render = () => {
    renderer.render(scene, camera);
};

// ★変更点3：カメラが動いたら描画するイベントリスナー
controls.addEventListener('change', render);

// --- インタラクション変数 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let hoveredObject = null;
let selectedObject = null;
let isDragging = false;
let dragOffset = new THREE.Vector3();
let dragStartPosition = new THREE.Vector3();
const blueBuildings = [];

// --- ローダー設定 ---
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

// --- ヘルパー関数 ---
const addEdges = (mesh, color = 0x888888) => {
    const oldEdges = mesh.children.find(c => c.isLineSegments);
    if (oldEdges) mesh.remove(oldEdges);
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, 15);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: color });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; 
    mesh.add(edges);
};

// 建物のセットアップ
const setupBlueBuilding = (mesh) => {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    mesh.userData.originalSize = { x: size.x, y: size.y, z: size.z };
    
    const shiftX = -center.x;
    const shiftY = -box.min.y;
    const shiftZ = -center.z;
    mesh.geometry.translate(shiftX, shiftY, shiftZ);
    
    mesh.position.x -= shiftX;
    mesh.position.y -= shiftY;
    mesh.position.z -= shiftZ;

    mesh.userData.initialPosition = mesh.position.clone();

    mesh.material = new THREE.MeshBasicMaterial({
        color: 0x0077ff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
    });
    addEdges(mesh, 0x00ffff);
    blueBuildings.push(mesh);
};

const loadModel = (fileName, setupAction) => {
    loader.load(`./asset/${fileName}`, (gltf) => {
        const model = gltf.scene;
        setupAction(model);
        scene.add(model);
        
        // ★変更点4：モデル読み込み完了時に描画
        render();
        
    }, undefined, (err) => console.error(err));
};

// --- モデル読み込み ---
loadModel('60m建物.glb', (model) => {
    model.traverse((child) => { if (child.isMesh) setupBlueBuilding(child); });
});

const setupStaticModel = (model, color, edgeColor, isTexture = false) => {
    model.traverse((child) => {
        if (child.isMesh) {
            if (isTexture && child.material) {
                child.material = new THREE.MeshBasicMaterial({ map: child.material.map });
            } else {
                child.material = new THREE.MeshBasicMaterial({ color: color });
                if (edgeColor) addEdges(child, edgeColor);
            }
        }
    });
};

loadModel('駅ビルと京都タワー以外結合.glb', (m) => setupStaticModel(m, 0xffffff, 0x999999));
loadModel('京都タワー.glb', (m) => setupStaticModel(m, null, null, true));
loadModel('京都駅ビル.glb', (m) => setupStaticModel(m, null, null, true));
loadModel('地盤面地図付き.glb', (m) => setupStaticModel(m, null, null, true));

// --- イベントリスナー ---

// リセットボタン
resetBtn.addEventListener('click', () => {
    let changed = false;
    blueBuildings.forEach(mesh => {
        if (mesh.userData.initialPosition) {
            mesh.position.copy(mesh.userData.initialPosition);
            changed = true;
        }
        mesh.scale.set(1, 1, 1);
        changed = true;
    });
    menu.style.display = 'none';
    
    // ★変更点5：リセット時に描画
    if (changed) render();
});

// 1. マウス移動
window.addEventListener('pointermove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // A. ドラッグ中の処理
    if (isDragging && selectedObject) {
        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, intersectPoint);
        
        if (intersectPoint) {
            let newX = intersectPoint.x - dragOffset.x;
            let newZ = intersectPoint.z - dragOffset.z;

            if (event.shiftKey) {
                const diffX = newX - dragStartPosition.x;
                const diffZ = newZ - dragStartPosition.z;
                if (Math.abs(diffX) > Math.abs(diffZ)) {
                    newZ = dragStartPosition.z;
                } else {
                    newX = dragStartPosition.x;
                }
            }
            
            // 位置が変わった場合のみ描画
            if (selectedObject.position.x !== newX || selectedObject.position.z !== newZ) {
                selectedObject.position.set(newX, selectedObject.position.y, newZ);
                
                // 表示テキスト更新
                const totalDiffX = newX - dragStartPosition.x;
                const totalDiffZ = newZ - dragStartPosition.z;
                const textX = Math.abs(totalDiffX) < 0.1 ? 
                    '東西移動なし' : 
                    (totalDiffX > 0 ? `東へ ${totalDiffX.toFixed(1)}m` : `西へ ${Math.abs(totalDiffX).toFixed(1)}m`);
                const textZ = Math.abs(totalDiffZ) < 0.1 ? 
                    '南北移動なし' :
                    (totalDiffZ > 0 ? `南へ ${totalDiffZ.toFixed(1)}m` : `北へ ${Math.abs(totalDiffZ).toFixed(1)}m`);
                
                moveInfo.style.display = 'block';
                moveInfo.style.left = event.clientX + 'px';
                moveInfo.style.top = event.clientY + 'px';
                moveInfo.innerHTML = `${textX}<br>${textZ}`;
                
                // ★変更点6：ドラッグ移動時に描画
                render();
            }
        }
        return;
    }

    // B. ホバー判定
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(blueBuildings);
    let needsRender = false; // ★描画が必要かフラグ

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj !== hoveredObject) {
            if (hoveredObject) {
                hoveredObject.material.color.setHex(0x0077ff);
                hoveredObject.material.opacity = 0.4;
            }
            hoveredObject = obj;
            hoveredObject.material.color.setHex(0x66aaff);
            hoveredObject.material.opacity = 0.6;
            document.body.style.cursor = 'move';
            helpPanel.style.display = 'block';
            
            needsRender = true; // 色が変わったので描画必要
        }
    } else {
        if (hoveredObject) {
            hoveredObject.material.color.setHex(0x0077ff);
            hoveredObject.material.opacity = 0.4;
            hoveredObject = null;
            document.body.style.cursor = 'default';
            helpPanel.style.display = 'none';
            
            needsRender = true; // 色が戻ったので描画必要
        }
    }

    // ★変更点7：ホバー状態に変化があった時だけ描画（マウスを振るだけでは描画しない）
    if (needsRender) render();
});

// 2. 左クリック
window.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (hoveredObject) {
        isDragging = true;
        selectedObject = hoveredObject;
        controls.enabled = false;
        dragStartPosition.copy(selectedObject.position);
        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, intersectPoint);
        if (intersectPoint) {
            dragOffset.copy(intersectPoint).sub(selectedObject.position);
        }
        if (menu.style.display !== 'none') {
            menu.style.display = 'none';
            render(); // メニュー消去の再描画はHTML側だが念のため
        }
    }
});

// 3. マウスアップ
window.addEventListener('pointerup', () => {
    isDragging = false;
    controls.enabled = true;
    if (moveInfo.style.display !== 'none') {
        moveInfo.style.display = 'none';
    }
});

// 4. 右クリック
window.addEventListener('contextmenu', (event) => {
    if (hoveredObject) {
        event.preventDefault();
        selectedObject = hoveredObject;

        const original = selectedObject.userData.originalSize;
        const currentScale = selectedObject.scale;

        const w = original.x * currentScale.x;
        const d = original.z * currentScale.z;
        const h = original.y * currentScale.y;

        inputW.value = w; valW.textContent = w.toFixed(1) + 'm';
        inputD.value = d; valD.textContent = d.toFixed(1) + 'm';
        inputH.value = h; valH.textContent = h.toFixed(1) + 'm';

        menu.style.display = 'block';
        menu.style.left = event.clientX + 'px';
        menu.style.top = event.clientY + 'px';
    } else {
        if (menu.style.display !== 'none') {
            menu.style.display = 'none';
        }
    }
});

// --- UI操作 ---
const updateSize = () => {
    if (!selectedObject) return;
    const original = selectedObject.userData.originalSize;
    
    const w = parseFloat(inputW.value);
    const d = parseFloat(inputD.value);
    const h = parseFloat(inputH.value);

    valW.textContent = w.toFixed(1) + 'm';
    valD.textContent = d.toFixed(1) + 'm';
    valH.textContent = h.toFixed(1) + 'm';

    selectedObject.scale.set(w / original.x, h / original.y, d / original.z);
    
    // ★変更点8：スライダー操作時に描画
    render();
};

inputW.addEventListener('input', updateSize);
inputD.addEventListener('input', updateSize);
inputH.addEventListener('input', updateSize);

closeBtn.addEventListener('click', () => {
    menu.style.display = 'none';
});

// ★変更点9：常時ループ(animate)を廃止。
// 初回描画やリサイズ対応のみ残す
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
});

// 最初の1回だけ描画しておく
render();