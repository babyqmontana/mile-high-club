import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
// Башня Mile High Club в духе логотипа: овальный стеклянный ствол, золотые рёбра,
// ступенчатая ар-деко корона со шпилем. Этажи отеля подсвечены по статусам номеров.
const STATUS = { free: '#f7b50a', booked: '#f0177a', occupied: '#ef5617', cleaning: '#3a4644', repair: '#3a4644' };
const RX = 2.3, RZ = 1.55, FH = 0.36, SEG = 48;

function shadeHex(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k * 0.5); return '#' + c.getHexString(); }
function windowsCanvas(rooms, lit, seed) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#0b1a22'; g.fillRect(0, 0, 1024, 64);
  const cols = 64, cw = 1024 / cols; let s = seed;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < cols; i++) {
    let col;
    if (rooms) { const n = rooms.length, room = rooms[Math.floor(i / cols * n)]; col = STATUS[room?.status] || '#1b2c33'; if (room && room.status !== 'free' && r() < 0.25) col = '#1b2c33'; }
    else col = r() < lit ? (r() < 0.8 ? '#e9c27a' : '#f6dca8') : '#13252e';
    const gr = g.createLinearGradient(0, 8, 0, 56); gr.addColorStop(0, col); gr.addColorStop(1, shadeHex(col, -0.35));
    g.fillStyle = gr; g.fillRect(i * cw + 2, 9, cw - 4, 46);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(i * cw + 2, 9, (cw - 4) * 0.4, 46);
  }
  g.fillStyle = '#2a3a40'; g.fillRect(0, 0, 1024, 7); g.fillRect(0, 57, 1024, 7);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; return t;
}

export function mountTower(host, { onPick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x0d0809, 34, 80);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x20140c, 0.6), key = new THREE.DirectionalLight(0xffd2a0, 1.6), rim = new THREE.PointLight(0xf0177a, 40, 30), rim2 = new THREE.PointLight(0xf7b50a, 18, 30);
  key.position.set(8, 14, 10); rim.position.set(-7, 8, -4); rim2.position.set(7, 4, -6); scene.add(hemi, key, rim, rim2);
  const root = new THREE.Group(); scene.add(root);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a94a, metalness: 1, roughness: 0.28, envMapIntensity: 1.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1214, metalness: 0.6, roughness: 0.45 });
  const emis = (map, k = 1) => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: k, metalness: 0.4, roughness: 0.22, envMapIntensity: 0.7 });
  let floors = [], hotel = [], sel = null, curRooms = [], built = '', topY = 0, camTargetY = 0;
  const shellAt = (i, n) => { const t = i / n; return t > 0.86 ? 0.72 : t > 0.7 ? 0.86 : 1; };
  const oval = (r1, r2, h, open) => { const g = new THREE.CylinderGeometry(r1, r2, h, SEG, 1, open); g.scale(1, 1, RZ / RX); return g; };

  function build(rooms) {
    root.traverse(o => { o.geometry?.dispose?.(); }); root.clear(); floors = []; hotel = [];
    const hFloors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b);
    const minF = hFloors[0] ?? 20, maxF = hFloors.at(-1) ?? 26;
    const total = Math.max(40, maxF + 8), base = Math.max(1, minF - 14), n = total - base + 1;
    const deco = windowsCanvas(null, 0.35, 7);
    for (let i = 0; i < n; i++) {
      const f = base + i, s = shellAt(i, n), y = i * FH, isHotel = hFloors.includes(f);
      let mat; if (isHotel) mat = emis(windowsCanvas(rooms.filter(r => r.floor === f), 0, f), 1.15); else { const t = deco.clone(); t.needsUpdate = true; t.offset.x = (i * 0.37) % 1; mat = emis(t, 0.55); }
      const m = new THREE.Mesh(oval(RX * s, RX * s, FH * 0.86, true), mat); m.position.y = y; m.userData = { floor: f, hotel: isHotel };
      root.add(m); floors.push(m); if (isHotel) hotel.push(m);
      const slab = new THREE.Mesh(oval(RX * s * 1.02, RX * s * 1.02, FH * 0.14, false), isHotel ? gold : dark); slab.position.y = y + FH * 0.5; root.add(slab); m.userData.slab = slab;
    }
    topY = n * FH;
    [[0, 0.7, 1], [0.7, 0.86, 0.86], [0.86, 1, 0.72]].forEach(([a, b, s]) => {
      const h = (b - a) * topY, fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, h, 0.12), gold, 16), M = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let k = 0; k < 16; k++) { const ang = k / 16 * Math.PI * 2; q.setFromEuler(new THREE.Euler(0, -ang, 0)); M.compose(new THREE.Vector3(Math.cos(ang) * RX * s * 1.03, a * topY + h / 2 - FH / 2, Math.sin(ang) * RZ * s * 1.03), q, new THREE.Vector3(1, 1, 1)); fins.setMatrixAt(k, M); }
      root.add(fins);
    });
    const crown = new THREE.Group(); crown.position.y = topY - FH / 2; root.add(crown);
    [[0.72, 0.25], [0.6, 0.3], [0.48, 0.35], [0.34, 0.4], [0.2, 0.5]].reduce((y, [s, h], i) => { const m = new THREE.Mesh(oval(RX * s, RX * s * 1.06, h, false), i % 2 ? dark : gold); m.position.y = y + h / 2; crown.add(m); return y + h; }, 0);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.09, 3.2, 12), gold); spire.position.y = 3.4; crown.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf0177a, toneMapped: false })); beacon.position.y = 5.05; crown.add(beacon); root.userData.beacon = beacon;
    const pod = new THREE.Mesh(oval(RX * 1.45, RX * 1.55, 1.1, false), dark); pod.position.y = -FH / 2 - 0.55; root.add(pod);
    const lobby = new THREE.Mesh(oval(RX * 1.46, RX * 1.46, 0.35, true), new THREE.MeshBasicMaterial({ color: 0xffc46a, toneMapped: false, transparent: true, opacity: 0.55 })); lobby.position.y = -FH / 2 - 0.5; root.add(lobby);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x0c1716, metalness: 0.7, roughness: 0.35 })); plaza.rotation.x = -Math.PI / 2; plaza.position.y = -FH / 2 - 1.1; root.add(plaza);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: 0xf0177a, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = plaza.position.y + 0.02; root.add(ring);
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0e1c1c, metalness: 0.5, roughness: 0.6 }), 26), M = new THREE.Matrix4();
    let rs = 3; const rr = () => (rs = rs * 16807 % 2147483647) / 2147483647;
    for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2 + rr() * 0.2, d = 11 + rr() * 6, h = 2 + rr() * topY * 0.45, w = 0.8 + rr() * 1.4; M.compose(new THREE.Vector3(Math.cos(a) * d, plaza.position.y + h / 2, Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(w, h, w)); city.setMatrixAt(k, M); }
    root.add(city);
    const mid = hotel[Math.floor(hotel.length / 2)]; root.position.y = -(mid ? mid.position.y : topY / 2);
    built = JSON.stringify(rooms.map(r => [r.id, r.floor]));
  }
  function retexture(rooms) { hotel.forEach(m => { const t = windowsCanvas(rooms.filter(r => r.floor === m.userData.floor), 0, m.userData.floor); m.material.map.dispose(); m.material.map = t; m.material.emissiveMap = t; m.material.needsUpdate = true; }); }
  function update(rooms, floor) {
    const k = JSON.stringify(rooms.map(r => [r.id, r.floor]));
    if (k !== built) build(rooms); else if (rooms.map(r => r.status).join() !== curRooms.map(r => r.status).join()) retexture(rooms);
    curRooms = rooms; sel = floor;
    const fm = hotel.find(m => m.userData.floor === sel); camTargetY = fm ? fm.position.y + root.position.y : 0;
    kick();
  }

  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), el = renderer.domElement, tip = host.querySelector('.tip');
  let drag = null, rotY = 0.6, vel = 0, idle = 3, hover = null;
  const pick = e => { const r = el.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam); return ray.intersectObjects(hotel, false)[0]?.object.userData.floor ?? null; };
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, rot: rotY, moved: false, last: e.clientX }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; vel = (e.clientX - drag.last) * 0.006; drag.last = e.clientX; rotY = drag.rot + dx * 0.006; idle = 0; kick(); return; }
    const f = pick(e); if (f !== hover) { hover = f; el.style.cursor = f !== null ? 'pointer' : 'grab'; kick(); }
    if (tip) { if (f !== null) { const fr = curRooms.filter(r => r.floor === f), r = host.getBoundingClientRect(); tip.textContent = `${f} этаж · свободно ${fr.filter(x => x.status === 'free').length} из ${fr.length}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1; } else tip.style.opacity = 0; }
  });
  el.addEventListener('pointerup', e => { if (drag && !drag.moved) { const f = pick(e); if (f !== null) onPick?.(f); } drag = null; });
  el.addEventListener('pointerleave', () => { hover = null; if (tip) tip.style.opacity = 0; });

  let active = false, visible = true, raf = 0, last = performance.now(), camY = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(host);
  function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); kick(); }
  new ResizeObserver(size).observe(host);
  function kick() { if (!raf && active && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(t) {
    raf = 0; const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (!drag) { rotY += vel; vel *= 0.92; idle += dt; if (idle > 2.5) rotY += dt * 0.1; }
    root.rotation.y = rotY;
    camY += (camTargetY - camY) * Math.min(1, dt * 3);
    const dist = cam.aspect < 0.9 ? 34 : 25; cam.position.set(0, camY + 5, dist); cam.lookAt(0, camY + 1.2, 0);
    floors.forEach(m => { const on = m.userData.floor === sel, hv = m.userData.floor === hover; const target = on ? 1.7 : hv && m.userData.hotel ? 1.4 : m.userData.hotel ? 1.15 : 0.55; m.material.emissiveIntensity += (target - m.material.emissiveIntensity) * Math.min(1, dt * 8); const sc = on ? 1.06 : 1; m.scale.x += (sc - m.scale.x) * Math.min(1, dt * 8); m.scale.z = m.scale.x; m.userData.slab?.scale.set(m.scale.x, 1, m.scale.x); });
    const b = root.userData.beacon; if (b) b.material.color.setHSL(0.92, 1, 0.45 + Math.sin(t / 380) * 0.15);
    renderer.render(scene, cam);
    if (active && visible) raf = requestAnimationFrame(loop);
  }
  function relight() { const day = document.documentElement.dataset.mode === 'day'; hemi.intensity = day ? 1.4 : 0.6; key.intensity = day ? 2.6 : 1.6; scene.fog.color.set(0x0d0809); kick(); }
  relight(); size();
  return { update, active(on) { active = on; if (on) { size(); kick(); } }, relight };
}
