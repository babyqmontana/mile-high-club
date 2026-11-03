import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// Манекены (мужской и женский) в цветах отдела. Если у отдела загружена своя модель формы (.glb) — показываем её.
const BUILTIN = window.MHC_DEMO ? { male: 'models/male.json', female: 'models/female.json' } : { male: 'models/male.glb', female: 'models/female.glb' };

export function mountStaff(host, onReady, onFail) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  cam.position.set(1.3, 1.45, 4.6);
  const ctl = new OrbitControls(cam, renderer.domElement);
  ctl.target.set(0, 0.88, 0); ctl.enableDamping = true; ctl.enablePan = false; ctl.minDistance = 2.6; ctl.maxDistance = 7; ctl.maxPolarAngle = Math.PI * 0.56; ctl.minPolarAngle = Math.PI * 0.2; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.1;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x2a1a1c, 1.3), key = new THREE.DirectionalLight(0xffffff, 2.4), rim = new THREE.PointLight(0xd9822b, 10, 10), rim2 = new THREE.PointLight(0xf7b50a, 6, 10);
  key.position.set(2.5, 5, 3.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = 12; key.shadow.radius = 4;
  rim.position.set(-2.4, 2.2, -2); rim2.position.set(2.4, 1.2, -2.4); scene.add(hemi, key, rim, rim2);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0x1c1214, roughness: 0.5, metalness: 0.3 })); floor.position.y = -0.04; floor.receiveShadow = true; scene.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color: 0xf7b50a })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring);

  const loader = new GLTFLoader(), cache = new Map(); let cur = null, mixer = null, want = null, clock = new THREE.Clock();
  async function load(url) {
    if (cache.has(url)) return cache.get(url);
    const p = loader.loadAsync(url).then(g => {
      const root = g.scene, mix = new THREE.AnimationMixer(root);
      if (g.animations[0]) { mix.clipAction(g.animations[0]).play(); mix.update(0.5); }
      root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); } });
      // нормализуем рост ~1.8 и ставим ногами на подиум
      root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root, true); const h = b.max.y - b.min.y || 1;
      const s = 1.8 / h; root.scale.multiplyScalar(s); root.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(root, true); root.position.y -= b2.min.y; root.position.x -= (b2.min.x + b2.max.x) / 2; root.position.z -= (b2.min.z + b2.max.z) / 2;
      const meshes = []; root.traverse(o => o.isMesh && meshes.push(o));
      meshes.sort((a, b) => (b.geometry.attributes.position.count) - (a.geometry.attributes.position.count));
      return { root, mix, meshes, custom: !url.startsWith('models/') };
    });
    cache.set(url, p); return p;
  }
  async function show(dept, gender) {
    const url = dept.model || BUILTIN[gender] || BUILTIN.male; want = url;
    // своя модель не загрузилась — показываем встроенный манекен; не загрузился и он — сообщаем, а не висим на «Загружаем…»
    let m; try { m = await load(url); } catch (e) { console.error(e); try { if (url === BUILTIN[gender]) throw e; m = await load(BUILTIN[gender] || BUILTIN.male); } catch { onFail?.(); return; } }
    if (want !== url && !(dept.model && want === dept.model)) return;
    if (cur !== m) { if (cur) scene.remove(cur.root); scene.add(m.root); cur = m; mixer = m.mix; m.root.userData.t = 0; }
    if (!m.custom) {
      const [surface, joints] = m.meshes;
      surface?.material.color.set(dept.color || '#d8d0c0'); if (surface) { surface.material.roughness = 0.55; surface.material.metalness = 0.05; }
      joints?.material.color.set(dept.accent || '#222');
      // слишком тёмную форму чуть подсвечиваем, чтобы читался силуэт
      const c = new THREE.Color(dept.color || '#888'); const l = c.getHSL({}).l; if (surface) surface.material.emissive.set(l < 0.12 ? 0x1a1a1a : 0x000000);
    }
    ring.material.color.set(dept.accent || '#f7b50a'); rim.color.set('#d9822b');
    pop = 0; onReady?.(); kick();
  }
  let pop = 1;
  let active = false, visible = true, raf = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(host);
  function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); kick(); }
  new ResizeObserver(size).observe(host);
  function kick() { if (!raf && active && visible) { clock.getDelta(); raf = requestAnimationFrame(loop); } }
  function loop() {
    raf = 0; const dt = Math.min(0.05, clock.getDelta());
    mixer?.update(dt); ctl.update();
    if (cur && pop < 1) { pop = Math.min(1, pop + dt * 3); const e = 1 - Math.pow(1 - pop, 3); cur.root.rotation.y = (1 - e) * -0.6; }
    renderer.render(scene, cam);
    if (active && visible) raf = requestAnimationFrame(loop);
  }
  function relight() { const day = document.documentElement.dataset.mode === 'day'; hemi.intensity = day ? 2 : 1.3; floor.material.color.set(0x1c1214); rim.intensity = day ? 5 : 14; kick(); }
  relight(); size();
  return { show, active(on) { active = on; if (on) { size(); kick(); } }, relight };
}
