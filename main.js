import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- UI要素 ---
const menu = document.getElementById('context-menu');
const moveInfo = document.getElementById('move-info');
const commentTooltip = document.getElementById('comment-tooltip'); // ★追加
const helpPanel = document.getElementById('help-panel');
const cameraInfo = document.getElementById('camera-info');
const resetBtn = document.getElementById('reset-btn');
const saveBtn = document.getElementById('save-btn');
const loadBtn = document.getElementById('load-btn');
const fileInput = document.getElementById('file-input');
const duplicateBtn = document.getElementById('duplicate-btn');
const deleteBtn = document.getElementById('delete-btn');
const inputW = document.getElementById('input-width');
const inputD = document.getElementById('input-depth');
const inputH = document.getElementById('input-height');
const inputComment = document.getElementById('input-comment'); // ★追加
const valW = document.getElementById('val-w');
const valD = document.getElementById('val-d');
const valH = document.getElementById('val-h');
const closeBtn = document.getElementById('close-menu');

const subViewPanel = document.getElementById('sub-view-panel');
const fixedSubContainer = document.getElementById('fixed-sub-container');
const addSubBtn = document.getElementById('add-sub-btn');

const heightSteps = [20, 31, 45, 60];

// イベント伝播遮断（コメント入力欄でもホイールなどを無効化しないとカメラが動くため追加）
const stopProp = (e) => e.stopPropagation();
menu.addEventListener('pointerdown', stopProp);
menu.addEventListener('pointermove', stopProp);
menu.addEventListener('wheel', stopProp);
// キー入力を伝播させない（誤操作防止）
menu.addEventListener('keydown', stopProp);
menu.addEventListener('keyup', stopProp);

resetBtn.addEventListener('pointerdown', stopProp);
saveBtn.addEventListener('pointerdown', stopProp);
loadBtn.addEventListener('pointerdown', stopProp);

// メニューのドラッグ移動機能
const menuHeader = menu.querySelector('h3');
let isMenuDragging = false;
let menuDragOffset = { x: 0, y: 0 };

menuHeader.addEventListener('pointerdown', (e) => {
    isMenuDragging = true;
    const rect = menu.getBoundingClientRect();
    menuDragOffset.x = e.clientX - rect.left;
    menuDragOffset.y = e.clientY - rect.top;
    menuHeader.setPointerCapture(e.pointerId);
});

menuHeader.addEventListener('pointermove', (e) => {
    if (!isMenuDragging) return;
    menu.style.left = (e.clientX - menuDragOffset.x) + 'px';
    menu.style.top = (e.clientY - menuDragOffset.y) + 'px';
});

menuHeader.addEventListener('pointerup', (e) => {
    isMenuDragging = false;
    menuHeader.releasePointerCapture(e.pointerId);
});


// --- シーン設定 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// --- メインカメラ & レンダラー ---
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(200, 200, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.id = 'main-canvas';
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; 


// ----------------------------------------------------
//  サブカメラ管理
// ----------------------------------------------------

const createFrustumMesh = (cam) => {
    const fov = cam.fov;
    const aspect = cam.aspect;
    const far = cam.far;
    const fovRad = (fov * Math.PI) / 180;
    const y = Math.tan(fovRad / 2) * far;
    const x = y * aspect;
    const vertices = new Float32Array([
        0, 0, 0, -x, y, -far, x, y, -far, -x, -y, -far, x, -y, -far
    ]);
    const indices = [
        0, 2, 1, 0, 4, 2, 0, 3, 4, 0, 1, 3, 1, 2, 3, 2, 4, 3
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffff00, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(cam.position);
    mesh.quaternion.copy(cam.quaternion);
    return mesh;
};

// 1. 固定サブカメラ
const fixedSubCamera = new THREE.PerspectiveCamera(45, 4/3, 1, 5000);
fixedSubCamera.position.set(-17.1, 30.3, -121.3);
const fixedTarget = new THREE.Vector3(-68.0, 31.7, -131.5);
fixedSubCamera.lookAt(fixedTarget);

const fixedSubRenderer = new THREE.WebGLRenderer({ antialias: true });
fixedSubRenderer.setSize(fixedSubContainer.clientWidth, fixedSubContainer.clientHeight);
fixedSubRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
fixedSubContainer.appendChild(fixedSubRenderer.domElement);

const fixedHelperCam = fixedSubCamera.clone();
fixedHelperCam.far = 30;
fixedHelperCam.updateProjectionMatrix();
fixedHelperCam.updateMatrixWorld(true);
const fixedHelper = new THREE.CameraHelper(fixedHelperCam);
scene.add(fixedHelper);
const fixedFrustumMesh = createFrustumMesh(fixedHelperCam);
scene.add(fixedFrustumMesh);

fixedSubRenderer.domElement.addEventListener('click', () => {
    camera.position.copy(fixedSubCamera.position);
    controls.target.copy(fixedTarget);
    controls.update();
});


// 2. 動的サブカメラ配列
const dynamicSubCameras = []; 

const addDynamicCamera = (pos, target) => {
    if (dynamicSubCameras.length >= 2) return;

    const newCam = new THREE.PerspectiveCamera(45, 4/3, 1, 5000);
    newCam.position.copy(pos);
    newCam.lookAt(target);

    const div = document.createElement('div');
    div.className = 'sub-cam-container';
    
    const newRenderer = new THREE.WebGLRenderer({ antialias: true });
    newRenderer.setSize(fixedSubContainer.clientWidth || 300, fixedSubContainer.clientHeight || 225); 
    newRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    div.appendChild(newRenderer.domElement);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-sub-btn';
    removeBtn.textContent = '×';
    div.appendChild(removeBtn);

    subViewPanel.insertBefore(div, addSubBtn);

    const hCam = newCam.clone();
    hCam.far = 30;
    hCam.updateProjectionMatrix();
    hCam.updateMatrixWorld(true);
    
    const newHelper = new THREE.CameraHelper(hCam);
    scene.add(newHelper);
    const newMesh = createFrustumMesh(hCam);
    scene.add(newMesh);

    const camData = {
        camera: newCam,
        renderer: newRenderer,
        target: target.clone(),
        helper: newHelper,
        mesh: newMesh,
        div: div,
        helperCam: hCam
    };
    dynamicSubCameras.push(camData);

    newRenderer.domElement.addEventListener('click', () => {
        camera.position.copy(newCam.position);
        controls.target.copy(camData.target);
        controls.update();
    });

    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeDynamicCamera(camData);
    });

    if (dynamicSubCameras.length >= 2) addSubBtn.style.display = 'none';
    
    requestAnimationFrame(() => {
        const w = div.clientWidth;
        const h = div.clientHeight;
        if(w && h) newRenderer.setSize(w, h);
        renderAll();
    });
};

const removeDynamicCamera = (camData) => {
    camData.div.remove();
    scene.remove(camData.helper);
    scene.remove(camData.mesh);
    camData.renderer.dispose();
    if(camData.mesh.geometry) camData.mesh.geometry.dispose();
    if(camData.mesh.material) camData.mesh.material.dispose();

    const idx = dynamicSubCameras.indexOf(camData);
    if (idx > -1) dynamicSubCameras.splice(idx, 1);

    addSubBtn.style.display = 'flex';
    renderAll();
};

addSubBtn.addEventListener('click', () => {
    addDynamicCamera(camera.position, controls.target);
});


// --- インタラクション変数 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let hoveredObject = null;
let selectedObject = null;
let isDragging = false;
let dragOffset = new THREE.Vector3();
let dragStartPosition = new THREE.Vector3();
let blueBuildings = [];
let baseMeshes = [];

const downRaycaster = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);
let groundModels = []; 

// --- 情報表示更新 ---
const updateCameraInfo = () => {
    const pos = camera.position;
    const tgt = controls.target;
    const dist = pos.distanceTo(tgt);

    let altText = '-';
    if (groundModels.length > 0) {
        const rayOrigin = new THREE.Vector3(pos.x, 1000, pos.z);
        downRaycaster.set(rayOrigin, downDirection);
        const hits = downRaycaster.intersectObjects(groundModels, true);
        if (hits.length > 0) {
            const groundY = hits[0].point.y;
            const diff = pos.y - groundY;
            altText = `${diff.toFixed(1)}m`;
        } else {
            altText = '計測不能';
        }
    }

    cameraInfo.innerHTML = `
        Camera: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}<br>
        Target: ${tgt.x.toFixed(1)}, ${tgt.y.toFixed(1)}, ${tgt.z.toFixed(1)}<br>
        Dist: ${dist.toFixed(1)}m<br>
        <span style="color: #ffff00;">カメラの地盤面からの高さ：${altText}</span>
    `;
};


// ----------------------------------------------------
//  描画制御
// ----------------------------------------------------

const renderMain = () => {
    const hideThreshold = 2.0; 

    const distFixed = camera.position.distanceTo(fixedSubCamera.position);
    const isInsideFixed = distFixed < hideThreshold;
    fixedHelper.visible = !isInsideFixed;
    fixedFrustumMesh.visible = !isInsideFixed;

    dynamicSubCameras.forEach(dc => {
        const dist = camera.position.distanceTo(dc.camera.position);
        const isInside = dist < hideThreshold;
        dc.helper.visible = !isInside;
        dc.mesh.visible = !isInside;
    });

    renderer.render(scene, camera);
    updateCameraInfo();
};

const renderSubViews = () => {
    const fixedHVis = fixedHelper.visible;
    const fixedMVis = fixedFrustumMesh.visible;
    
    const dynamicsVis = dynamicSubCameras.map(dc => ({
        h: dc.helper.visible,
        m: dc.mesh.visible
    }));

    fixedHelper.visible = false;
    fixedFrustumMesh.visible = false;
    dynamicSubCameras.forEach(dc => {
        dc.helper.visible = false;
        dc.mesh.visible = false;
    });

    fixedSubRenderer.render(scene, fixedSubCamera);
    dynamicSubCameras.forEach(dc => {
        dc.renderer.render(scene, dc.camera);
    });

    fixedHelper.visible = fixedHVis;
    fixedFrustumMesh.visible = fixedMVis;
    dynamicSubCameras.forEach((dc, i) => {
        dc.helper.visible = dynamicsVis[i].h;
        dc.mesh.visible = dynamicsVis[i].m;
    });
};

const renderAll = () => {
    renderMain();
    renderSubViews();
};

controls.addEventListener('change', renderMain);


// --- ローダー設定 ---
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

// --- ヘルパー関数 ---
const getColorByHeight = (height) => {
    if (height >= 59.5) return 0x0077ff; 
    if (height >= 44.5) return 0xffdd00; 
    return 0xff6600;
};

const getHoverColor = (baseColorHex) => {
    if (baseColorHex === 0x0077ff) return 0x66aaff; 
    if (baseColorHex === 0xffdd00) return 0xffff66; 
    if (baseColorHex === 0xff6600) return 0xff9933; 
    return 0xffffff;
};

const updateObjectColor = (mesh) => {
    const h = mesh.userData.originalSize.y * mesh.scale.y;
    const colorHex = getColorByHeight(h);
    mesh.userData.baseColor = colorHex;
    mesh.material.color.setHex(colorHex);
};

const addEdges = (mesh, color = 0x888888) => {
    const oldEdges = mesh.children.find(c => c.isLineSegments);
    if (oldEdges) mesh.remove(oldEdges);
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, 15);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: color });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {}; 
    mesh.add(edges);
};

const setupBaseMesh = (mesh, index) => {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const shiftX = -center.x;
    const shiftY = -box.min.y;
    const shiftZ = -center.z;
    mesh.geometry.translate(shiftX, shiftY, shiftZ);
    
    mesh.userData.originalSize = { x: size.x, y: size.y, z: size.z };
    
    mesh.userData.initialScenePos = mesh.position.clone();
    mesh.userData.initialScenePos.x -= shiftX;
    mesh.userData.initialScenePos.y -= shiftY;
    mesh.userData.initialScenePos.z -= shiftZ;

    mesh.userData.templateId = index;

    mesh.material = new THREE.MeshBasicMaterial({
        color: 0x0077ff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
    });
    mesh.userData.baseColor = 0x0077ff;
    addEdges(mesh, 0x00ffff);

    baseMeshes.push(mesh);
};

const spawnInstance = (templateId, position, scale, isOriginal = false) => {
    const template = baseMeshes[templateId];
    if (!template) return null;

    const instance = template.clone();
    
    instance.children.forEach(child => {
        if (child.isLineSegments) {
            child.raycast = () => {}; 
        }
    });

    instance.material = template.material.clone();
    instance.userData.originalSize = { ...template.userData.originalSize };
    instance.userData.templateId = templateId;
    instance.userData.isOriginal = isOriginal;

    if (position) instance.position.copy(position);
    if (scale) instance.scale.copy(scale);

    if (isOriginal) {
        instance.userData.initialPosition = instance.position.clone();
    }

    updateObjectColor(instance);
    
    scene.add(instance);
    blueBuildings.push(instance);
    return instance;
};


const loadModel = (fileName, setupAction) => {
    loader.load(`./asset/${fileName}`, (gltf) => {
        const model = gltf.scene;
        setupAction(model);
        scene.add(model);
        renderAll();
    }, undefined, (err) => console.error(err));
};

loader.load('./asset/buildings_60m.glb', (gltf) => {
    const model = gltf.scene;
    let index = 0;
    
    model.traverse((child) => {
        if (child.isMesh) {
            setupBaseMesh(child, index++);
        }
    });

    baseMeshes.forEach(base => {
        spawnInstance(base.userData.templateId, base.userData.initialScenePos, new THREE.Vector3(1,1,1), true);
    });

    renderAll();
}, undefined, (err) => console.error(err));


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

loadModel('buildings_static.glb', (m) => setupStaticModel(m, 0xffffff, 0x999999));
loadModel('kyoto_tower.glb', (m) => setupStaticModel(m, null, null, true));
loadModel('kyoto_station.glb', (m) => setupStaticModel(m, null, null, true));

loadModel('ground.glb', (m) => { setupStaticModel(m, null, null, true); groundModels.push(m); });
loadModel('ground52353681.glb', (m) => { setupStaticModel(m, null, null, true); groundModels.push(m); });
loadModel('buildings_static52353681.glb', (m) => setupStaticModel(m, 0xffffff, 0x999999));
loadModel('ground52353670.glb', (m) => { setupStaticModel(m, null, null, true); groundModels.push(m); });
loadModel('buildings_static52353670.glb', (m) => setupStaticModel(m, 0xffffff, 0x999999));
loadModel('ground52353671.glb', (m) => { setupStaticModel(m, null, null, true); groundModels.push(m); });
loadModel('buildings_static52353671.glb', (m) => setupStaticModel(m, 0xffffff, 0x999999));


// --- イベントリスナー ---

duplicateBtn.addEventListener('click', () => {
    if (!selectedObject) return;
    
    const tid = selectedObject.userData.templateId;
    const currentScale = selectedObject.scale.clone();
    
    // ★追加：コメントも引き継ぐ
    const currentComment = selectedObject.userData.comment;

    const newPos = selectedObject.position.clone();
    newPos.x += 10; 
    newPos.z += 10;

    const newMesh = spawnInstance(tid, newPos, currentScale, false);
    
    // コメント適用
    if (currentComment) newMesh.userData.comment = currentComment;

    if (groundModels.length > 0) {
        const rayOrigin = new THREE.Vector3(newMesh.position.x, 1000, newMesh.position.z);
        downRaycaster.set(rayOrigin, downDirection);
        const hits = downRaycaster.intersectObjects(groundModels, true);
        if (hits.length > 0) {
            newMesh.position.y = hits[0].point.y;
        } else {
            newMesh.position.y = 0;
        }
    }
    
    updateObjectColor(newMesh);
    menu.style.display = 'none';
    renderAll();
});

deleteBtn.addEventListener('click', () => {
    if (!selectedObject) return;

    scene.remove(selectedObject);

    const index = blueBuildings.indexOf(selectedObject);
    if (index > -1) {
        blueBuildings.splice(index, 1);
    }

    if (selectedObject.material) {
        selectedObject.material.dispose();
    }

    selectedObject = null;
    hoveredObject = null;
    menu.style.display = 'none';
    document.body.style.cursor = 'default';
    commentTooltip.style.display = 'none'; // 削除時はチップも消す

    renderAll();
});

resetBtn.addEventListener('click', () => {
    for (let i = blueBuildings.length - 1; i >= 0; i--) {
        scene.remove(blueBuildings[i]);
        if (blueBuildings[i].material) blueBuildings[i].material.dispose();
    }
    blueBuildings = [];

    baseMeshes.forEach(base => {
        spawnInstance(base.userData.templateId, base.userData.initialScenePos, new THREE.Vector3(1,1,1), true);
    });

    menu.style.display = 'none';
    renderAll();
});


saveBtn.addEventListener('click', () => {
    const data = {
        format: 'kyoto-sim-data-v1',
        camera: {
            position: camera.position.toArray(),
            target: controls.target.toArray()
        },
        buildings: blueBuildings.map(b => ({
            templateId: b.userData.templateId,
            position: b.position.toArray(),
            scale: b.scale.toArray(),
            originalSize: b.userData.originalSize,
            isOriginal: b.userData.isOriginal,
            initialPosition: b.userData.initialPosition ? b.userData.initialPosition.toArray() : null,
            comment: b.userData.comment // ★保存：コメント
        })),
        subCameras: dynamicSubCameras.map(dc => ({
            position: dc.camera.position.toArray(),
            target: dc.target.toArray()
        }))
    };

    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const now = new Date();
    const dateStr = now.getFullYear() +
        ('0' + (now.getMonth() + 1)).slice(-2) +
        ('0' + now.getDate()).slice(-2) + '_' +
        ('0' + now.getHours()).slice(-2) +
        ('0' + now.getMinutes()).slice(-2);
        
    const a = document.createElement('a');
    a.href = url;
    a.download = `kyoto_sim_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

loadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            
            if (!data.format || data.format !== 'kyoto-sim-data-v1') {
                alert('このファイルは京都シミュレーターのデータではありません。');
                fileInput.value = '';
                return;
            }

            for (let i = blueBuildings.length - 1; i >= 0; i--) {
                scene.remove(blueBuildings[i]);
                if (blueBuildings[i].material) blueBuildings[i].material.dispose();
            }
            blueBuildings = [];

            if (data.camera) {
                camera.position.set(data.camera.position[0], data.camera.position[1], data.camera.position[2]);
                controls.target.set(data.camera.target[0], data.camera.target[1], data.camera.target[2]);
                camera.updateProjectionMatrix();
                controls.update(); 
            }

            if (data.buildings) {
                data.buildings.forEach(bData => {
                    const pos = new THREE.Vector3().fromArray(bData.position);
                    const scl = new THREE.Vector3().fromArray(bData.scale);
                    
                    const mesh = spawnInstance(bData.templateId, pos, scl, bData.isOriginal);
                    
                    if (mesh) {
                        mesh.userData.originalSize = bData.originalSize;
                        if (bData.initialPosition) {
                            mesh.userData.initialPosition = new THREE.Vector3().fromArray(bData.initialPosition);
                        }
                        // ★読込：コメント
                        if (bData.comment) {
                            mesh.userData.comment = bData.comment;
                        }
                        updateObjectColor(mesh);
                    }
                });
            }

            while(dynamicSubCameras.length > 0) {
                removeDynamicCamera(dynamicSubCameras[0]);
            }
            
            if (data.subCameras) {
                data.subCameras.forEach(camData => {
                    const pos = new THREE.Vector3().fromArray(camData.position);
                    const tgt = new THREE.Vector3().fromArray(camData.target);
                    addDynamicCamera(pos, tgt);
                });
            }
            
            fileInput.value = '';
            renderAll();
            alert('読み込みが完了しました');

        } catch (err) {
            console.error(err);
            alert('ファイルの読み込みに失敗しました');
        }
    };
    reader.readAsText(file);
});


// 1. マウス移動
window.addEventListener('pointermove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // A. ドラッグ中の処理
    if (isDragging && selectedObject) {
        // ドラッグ中はツールチップを消す
        commentTooltip.style.display = 'none';

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

            let newY = selectedObject.position.y;
            if (groundModels.length > 0) {
                const rayOrigin = new THREE.Vector3(newX, 1000, newZ);
                downRaycaster.set(rayOrigin, downDirection);
                const hits = downRaycaster.intersectObjects(groundModels, true);
                if (hits.length > 0) {
                    newY = hits[0].point.y;
                }
            }
            
            if (selectedObject.position.x !== newX || selectedObject.position.z !== newZ || selectedObject.position.y !== newY) {
                selectedObject.position.set(newX, newY, newZ);
                
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
                
                renderAll();
            }
        }
        return;
    }

    // B. ホバー判定
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(blueBuildings);
    let needsRender = false;

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj !== hoveredObject) {
            if (hoveredObject) {
                hoveredObject.material.color.setHex(hoveredObject.userData.baseColor);
                hoveredObject.material.opacity = 0.4;
            }
            hoveredObject = obj;
            
            const hoverColor = getHoverColor(hoveredObject.userData.baseColor);
            hoveredObject.material.color.setHex(hoverColor);
            hoveredObject.material.opacity = 0.6;
            
            document.body.style.cursor = 'move';
            helpPanel.style.display = 'block';
            
            needsRender = true;
        }

        // ★追加：コメント表示ロジック
        if (hoveredObject && hoveredObject.userData.comment) {
            commentTooltip.style.display = 'block';
            commentTooltip.innerText = hoveredObject.userData.comment;
            // マウスの右下に表示
            commentTooltip.style.left = event.clientX + 'px';
            commentTooltip.style.top = event.clientY + 'px';
        } else {
            commentTooltip.style.display = 'none';
        }

    } else {
        if (hoveredObject) {
            hoveredObject.material.color.setHex(hoveredObject.userData.baseColor);
            hoveredObject.material.opacity = 0.4;
            hoveredObject = null;
            document.body.style.cursor = 'default';
            helpPanel.style.display = 'none';
            commentTooltip.style.display = 'none'; // ホバー外れたら消す
            
            needsRender = true;
        }
    }

    if (needsRender) renderMain();
});

// 2. 左クリック
window.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (hoveredObject) {
        isDragging = true;
        selectedObject = hoveredObject;
        controls.enabled = false;
        dragStartPosition.copy(selectedObject.position);
        
        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), selectedObject.position);

        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(dragPlane, intersectPoint);
        if (intersectPoint) {
            dragOffset.copy(intersectPoint).sub(selectedObject.position);
            dragOffset.y = 0; 
        }
        if (menu.style.display !== 'none') {
            menu.style.display = 'none';
            renderMain();
        }
        // クリック時はツールチップを隠す（ドラッグの邪魔になるため）
        commentTooltip.style.display = 'none';
    }
});

window.addEventListener('pointerup', () => {
    isDragging = false;
    controls.enabled = true;
    if (moveInfo.style.display !== 'none') {
        moveInfo.style.display = 'none';
    }
});

// 4. 右クリック
window.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    if (hoveredObject) {
        selectedObject = hoveredObject;

        const original = selectedObject.userData.originalSize;
        const currentScale = selectedObject.scale;

        const w = original.x * currentScale.x;
        const d = original.z * currentScale.z;
        const h = original.y * currentScale.y;

        inputW.value = w; valW.textContent = w.toFixed(1) + 'm';
        inputD.value = d; valD.textContent = d.toFixed(1) + 'm';
        
        let closestIndex = 0;
        let minDiff = Infinity;
        heightSteps.forEach((val, index) => {
            const diff = Math.abs(val - h);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = index;
            }
        });
        inputH.value = closestIndex;
        valH.textContent = heightSteps[closestIndex].toFixed(1) + 'm';

        // ★追加：コメントをフォームに反映
        inputComment.value = selectedObject.userData.comment || '';

        menu.style.display = 'block';
        menu.style.left = event.clientX + 'px';
        menu.style.top = event.clientY + 'px';
        
        // メニューを開いた時もツールチップは邪魔なので消す
        commentTooltip.style.display = 'none';

    } else {
        if (menu.style.display !== 'none') {
            menu.style.display = 'none';
        }
    }
});

// ★追加：コメント入力イベント
inputComment.addEventListener('input', () => {
    if (selectedObject) {
        selectedObject.userData.comment = inputComment.value;
    }
});


// --- UI操作 ---
const updateSize = () => {
    if (!selectedObject) return;
    const original = selectedObject.userData.originalSize;
    
    const w = parseFloat(inputW.value);
    const d = parseFloat(inputD.value);
    const stepIndex = parseInt(inputH.value);
    const h = heightSteps[stepIndex];

    valW.textContent = w.toFixed(1) + 'm';
    valD.textContent = d.toFixed(1) + 'm';
    valH.textContent = h.toFixed(1) + 'm';
    
    selectedObject.scale.set(w / original.x, h / original.y, d / original.z);

    if (groundModels.length > 0) {
        const pos = selectedObject.position;
        const rayOrigin = new THREE.Vector3(pos.x, 1000, pos.z);
        downRaycaster.set(rayOrigin, downDirection);
        const hits = downRaycaster.intersectObjects(groundModels, true);
        if (hits.length > 0) {
            selectedObject.position.y = hits[0].point.y;
        }
    }
    
    updateObjectColor(selectedObject);
    renderAll();
};

inputW.addEventListener('input', updateSize);
inputD.addEventListener('input', updateSize);
inputH.addEventListener('input', updateSize);

closeBtn.addEventListener('click', () => {
    menu.style.display = 'none';
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    if(fixedSubContainer.clientWidth && fixedSubContainer.clientHeight) {
        fixedSubRenderer.setSize(fixedSubContainer.clientWidth, fixedSubContainer.clientHeight);
        fixedSubCamera.aspect = 4/3;
        fixedSubCamera.updateProjectionMatrix();
        fixedHelperCam.aspect = 4/3;
        fixedHelperCam.updateProjectionMatrix();
        fixedHelper.update();
    }

    dynamicSubCameras.forEach(dc => {
        const w = dc.div.clientWidth;
        const h = dc.div.clientHeight;
        if(w && h) {
            dc.renderer.setSize(w, h);
            dc.camera.aspect = 4/3;
            dc.camera.updateProjectionMatrix();
            dc.helperCam.aspect = 4/3;
            dc.helperCam.updateProjectionMatrix();
            dc.helper.update();
        }
    });

    renderAll();
});

renderAll();