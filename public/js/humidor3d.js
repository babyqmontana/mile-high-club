import * as THREE from 'three';
// 3D-хьюмидор в духе GTA V / RDR2: мало полигонов, рисованные текстуры, тёплый свет.
const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const rnd = (() => { let s = 7; return () => (s = s * 16807 % 2147483647) / 2147483647; })();

function wood(base, dark, light, rings = 26) {
  return tex(512, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < rings; i++) {
      const y0 = rnd() * h, a = 0.06 + rnd() * 0.18, amp = 2 + rnd() * 6, fq = 0.01 + rnd() * 0.02;
      g.strokeStyle = rnd() > 0.5 ? dark : light; g.globalAlpha = a; g.lineWidth = 1 + rnd() * 3; g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * fq + i) * amp); g.stroke();
    }
    g.globalAlpha = 0.05; for (let i = 0; i < 1600; i++) { g.fillStyle = rnd() > 0.5 ? dark : light; g.fillRect(rnd() * w, rnd() * h, 2, 1); }
    g.globalAlpha = 1;
  });
}
function seeded(str) { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
// покровный лист: пятна, прожилки и спиральный шов — у каждой сигары свой рисунок
function wrapperTex(color, id) {
  const r = seeded(id || color);
  return tex(256, 256, (g, w, h) => {
    const c = new THREE.Color(color), hex = x => '#' + x.getHexString();
    const lt = hex(c.clone().offsetHSL(0.005, -0.04, 0.07)), dk = hex(c.clone().offsetHSL(-0.005, 0.03, -0.09)), dk2 = hex(c.clone().offsetHSL(0, 0.02, -0.16));
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) { g.globalAlpha = 0.05 + r() * 0.12; g.fillStyle = r() > 0.5 ? lt : dk; g.beginPath(); g.ellipse(r() * w, r() * h, 4 + r() * 26, 3 + r() * 10, r() * 3, 0, 7); g.fill(); }
    // спиральный шов листа
    const slope = 0.35 + r() * 0.3; g.globalAlpha = 0.45; g.strokeStyle = dk2; g.lineWidth = 1.5;
    for (let k = -2; k < 4; k++) { g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, (k * h / 2 + x * slope) % (h * 2)); g.stroke(); }
    // прожилки
    g.globalAlpha = 0.3; g.strokeStyle = lt; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20 - r() * 40, y + 30, x + 30 - r() * 60, y + 60 + r() * 40); g.stroke(); }
    g.globalAlpha = 0.07; for (let i = 0; i < 2500; i++) { g.fillStyle = r() > 0.5 ? '#fff' : '#000'; g.fillRect(r() * w, r() * h, 1, 1); }
    g.globalAlpha = 1;
  });
}
function seal(g, x, y, rad, gold, fill, t) {
  g.fillStyle = gold; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.fillStyle = fill; g.beginPath(); g.arc(x, y, rad * 0.8, 0, 7); g.fill();
  g.strokeStyle = gold; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rad * 0.64, 0, 7); g.stroke();
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.fillStyle = gold; g.fillRect(x + Math.cos(a) * rad * 0.9 - 1, y + Math.sin(a) * rad * 0.9 - 1, 2, 2); }
  g.fillStyle = gold; g.font = `800 ${Math.round(rad * 0.62)}px "Cormorant Garamond", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y + 2);
}
// кольцо: classic, medallion, double, foot, stripe — пять разных дизайнов
function bandTex(c, kind = 'main') {
  const main = c.band || '#c9a24a', sec = c.band2 || '#1a1a1a', style = c.bandStyle || 'classic';
  const text = String(kind === 'main' ? (c.bandText || (c.name || 'MHC').split(' ')[0]) : (c.bandText2 || 'MHC')).toUpperCase().slice(0, 14);
  const gold = '#dcb45e', goldD = '#7d5c1e';
  return tex(512, 128, (g, w, h) => {
    g.fillStyle = main; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.07; for (let i = 0; i < 700; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect((i * 97) % w, (i * 53) % h, 2, 1); } g.globalAlpha = 1;
    const txt = (t, size, font = '"Cormorant Garamond", Georgia, serif', y = h / 2 + 2, col = gold) => { g.fillStyle = col; g.font = `800 ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, y); };
    if (style === 'stripe') { g.fillStyle = sec; g.fillRect(0, 0, w, 7); g.fillRect(0, h - 7, w, 7); seal(g, w / 2, h / 2, h * 0.38, gold, main, text.slice(0, 4)); return; }
    g.fillStyle = gold; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillStyle = goldD; g.fillRect(0, 10, w, 2); g.fillRect(0, h - 12, w, 2);
    if (kind === 'second') { g.fillStyle = sec; g.fillRect(0, 14, w, h - 28); txt(text, 44); g.fillStyle = gold; g.fillRect(40, h / 2 - 1, 90, 2); g.fillRect(w - 130, h / 2 - 1, 90, 2); return; }
    if (style === 'medallion' || style === 'double') {
      g.fillStyle = sec; g.fillRect(0, 22, w, h - 44); g.fillStyle = gold; for (let x = 0; x < w; x += 12) g.fillRect(x, 24, 6, 2);
      seal(g, w / 2, h / 2, h * 0.47, gold, main, text.slice(0, 2));
      g.font = '700 17px Onest, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w * 0.24, h / 2); g.fillText(text, w * 0.76, h / 2);
    } else if (style === 'foot') {
      g.fillStyle = sec; for (let x = 0; x < w; x += 26) { g.beginPath(); g.moveTo(x, 22); g.lineTo(x + 13, h / 2); g.lineTo(x, h - 22); g.fill(); }
      g.fillStyle = main; g.fillRect(w / 2 - 110, 20, 220, h - 40); txt(text, 30, 'Unbounded, "Arial Black", sans-serif');
    } else {
      g.strokeStyle = gold; g.lineWidth = 2; for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, h / 2, 5, 0, 7); g.stroke(); }
      g.fillStyle = main; g.fillRect(w / 2 - 125, 22, 250, h - 44); g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(w / 2 - 122, 25, 244, h - 50); txt(text, 34);
    }
  });
}
const tobacco = tex(64, 64, (g, w, h) => { g.fillStyle = '#4a2c16'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = ['#6b4022', '#2e1a0c', '#8a5a33'][i % 3]; g.globalAlpha = 0.6; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 1 + rnd() * 2); } g.globalAlpha = 1; });
const emberTex = tex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.35, '#ff8a1e'); gr.addColorStop(0.75, '#b8270c'); gr.addColorStop(1, '#3a1206'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(40,10,4,.6)' : 'rgba(255,220,120,.5)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); } });
export const smokeTex = tex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(230,225,215,.55)'); gr.addColorStop(1, 'rgba(230,225,215,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });

// Профили низкополигональные (8 граней), голова заострена гранями, как у сигар в GTA V / RDR2
const PROFILES = {
  straight: [[0, 1], [0.9, 1], [0.95, 0.86], [0.985, 0.52], [1, 0.14], [1.006, 0]],
  torpedo: [[0, 1], [0.7, 1], [0.84, 0.8], [0.94, 0.45], [0.99, 0.14], [1, 0]],
  belicoso: [[0, 1], [0.82, 1], [0.91, 0.8], [0.97, 0.46], [1, 0.1], [1.004, 0]],
  perfecto: [[0, 0.46], [0.05, 0.7], [0.14, 0.94], [0.25, 1], [0.78, 1], [0.9, 0.8], [0.97, 0.42], [1, 0]]
};
const shapeProfile = s => s === 'torpedo' ? PROFILES.torpedo : s === 'belicoso' ? PROFILES.belicoso : s === 'perfecto' ? PROFILES.perfecto : PROFILES.straight;
const SEG = 8;
export function buildCigar(c, mats) {
  const L = Math.max(90, Math.min(240, c.length || 140)) / 70, R = (Math.max(30, Math.min(64, c.ring || 50)) / 64 * 25.4) / 2 / 62;
  const prof = shapeProfile(c.shape);
  const pts = [new THREE.Vector2(0, 0)].concat(prof.map(([u, r]) => new THREE.Vector2(Math.max(0.0001, r * R), u * L)));
  const geo = new THREE.LatheGeometry(pts, SEG);
  const wrap = wrapperTex(c.wrapper || '#7a4a28', c.id || c.name); wrap.wrapS = wrap.wrapT = THREE.RepeatWrapping; wrap.repeat.set(1, Math.max(1, Math.round(L)));
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.82, metalness: 0 }));
  mats.push(body.material, wrap);
  const g = new THREE.Group(); g.add(body);
  const foot = new THREE.Mesh(new THREE.CircleGeometry(prof[0][1] * R * 0.97, SEG), new THREE.MeshStandardMaterial({ map: tobacco, roughness: 1 }));
  foot.rotation.x = Math.PI / 2; foot.position.y = -0.003; g.add(foot);
  const addBand = (u, height, kind) => {
    const t = bandTex(c, kind); t.wrapS = THREE.RepeatWrapping;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, height, SEG, 1, true), new THREE.MeshStandardMaterial({ map: t, roughness: 0.32, metalness: 0.4, side: THREE.DoubleSide }));
    b.position.y = u * L; b.rotation.y = Math.PI; g.add(b); mats.push(b.material, t); return b;
  };
  const style = c.bandStyle || 'classic', bu = c.shape === 'torpedo' ? 0.6 : c.shape === 'belicoso' ? 0.7 : c.shape === 'perfecto' ? 0.7 : 0.78;
  addBand(bu, style === 'stripe' ? 0.16 : 0.13, 'main');
  if (style === 'double') addBand(bu - 0.11, 0.09, 'second');
  if (style === 'foot') addBand(0.06, 0.08, 'second');
  g.children.forEach(m => m.position.y -= L / 2);
  const holder = new THREE.Group(); g.rotation.x = -Math.PI / 2; holder.add(g); holder.userData = { L, R, foot, inner: g };
  return holder;
}

export function mountHumidor(host, { onPick, onLid }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  cam.position.set(0, 6.6, 6.9); const look = new THREE.Vector3(0, 0.9, 0.1); cam.lookAt(look);
  const hemi = new THREE.HemisphereLight(0xffe6c4, 0x2a160a, 1.2), key = new THREE.DirectionalLight(0xffe2b8, 2.6), fill = new THREE.PointLight(0xff9a4a, 18, 20), rim = new THREE.PointLight(0xd9822b, 8, 18);
  key.position.set(3, 7, 5); fill.position.set(-4, 3, 4); rim.position.set(0, 3, -5); scene.add(hemi, key, fill, rim);

  const W = 6, D = 3.7, H = 1.5, T = 0.16;
  const box = new THREE.Group(); scene.add(box);
  // на телефонах обычный материал, на компьютере — с прозрачным лаком поверх дерева
  const coarse = matchMedia('(pointer: coarse)').matches;
  const outer = new (coarse ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial)({ map: wood('#3a1c0e', '#1a0b05', '#6b3a1d', 34), roughness: 0.38, metalness: 0.05, ...(coarse ? {} : { clearcoat: 0, clearcoatRoughness: 0.12 }) });
  const cedar = new THREE.MeshStandardMaterial({ map: wood('#b9774a', '#8a4f2c', '#d9a172', 22), roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.9 });
  const part = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); box.add(o); return o; };
  part(W, T, D, 0, T / 2, 0, outer);
  part(W, H, T, 0, H / 2, D / 2 - T / 2, outer); part(W, H, T, 0, H / 2, -D / 2 + T / 2, outer);
  part(T, H, D, W / 2 - T / 2, H / 2, 0, outer); part(T, H, D, -W / 2 + T / 2, H / 2, 0, outer);
  part(W - T * 2, 0.04, D - T * 2, 0, T + 0.02, 0, cedar);
  part(W - T * 2 - 0.02, H * 0.55, 0.03, 0, H * 0.4, D / 2 - T - 0.02, cedar); part(W - T * 2 - 0.02, H * 0.55, 0.03, 0, H * 0.4, -D / 2 + T + 0.02, cedar);
  [-1, 1].forEach(s => { const f = part(0.36, 0.12, 0.36, s * (W / 2 - 0.25), 0.02, s > 0 ? D / 2 - 0.25 : D / 2 - 0.25, brass); part(0.36, 0.12, 0.36, s * (W / 2 - 0.25), 0.02, -D / 2 + 0.25, brass); });
  part(0.5, 0.32, 0.05, 0, H - 0.2, D / 2 + 0.02, brass);
  // тень
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, D * 1.8), new THREE.MeshBasicMaterial({ map: tex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = -0.04; box.add(sh);

  // крышка на петлях у задней стенки
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, H, -D / 2); box.add(lidPivot);
  const lidT = 0.22, lid = new THREE.Group(); lidPivot.add(lid);
  const lidBox = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, lidT, D + 0.06), outer); lidBox.position.set(0, lidT / 2, D / 2); lid.add(lidBox);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.8), new THREE.MeshStandardMaterial({ map: tex(512, 192, (g, w, h) => { g.fillStyle = '#c9a24a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7a5a20'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#3a2408'; g.font = '800 52px Unbounded, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MILE HIGH', w / 2, h / 2 - 22); g.font = '700 28px Onest, Arial, sans-serif'; g.fillText('CIGAR CLUB', w / 2, h / 2 + 34); }), roughness: 0.3, metalness: 0.8 }));
  plaque.position.set(0, lidT + 0.015, D / 2 + 0.2); lid.add(plaque);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.02, D - 0.3), cedar); inner.position.set(0, -0.005, D / 2); lid.add(inner);
  const hygro = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), new THREE.MeshStandardMaterial({ map: tex(256, 256, (g, w) => { g.fillStyle = '#efe4c8'; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, 7); g.fill(); g.strokeStyle = '#c9a24a'; g.lineWidth = 14; g.stroke(); g.fillStyle = '#2a1a0c'; g.font = '700 22px Onest, Arial'; g.textAlign = 'center'; g.fillText('HUMIDITY', w / 2, w * 0.7); for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.8 + i * 0.14); g.fillRect(w / 2 + Math.cos(a) * 92, w / 2 + Math.sin(a) * 92, 4, 4); } g.strokeStyle = '#c0392b'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + Math.cos(Math.PI * 1.75) * 84, w / 2 + Math.sin(Math.PI * 1.75) * 84); g.stroke(); g.font = '800 34px Onest, Arial'; g.fillText('69%', w / 2, w * 0.86); }), roughness: 0.4 }));
  hygro.position.set(W / 2 - 1, -0.04, D / 2); hygro.rotation.y = Math.PI; lid.add(hygro);
  [-1, 1].forEach(s => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), brass); h.rotation.z = Math.PI / 2; h.position.set(s * (W / 2 - 0.9), H, -D / 2); box.add(h); });

  // сигары
  const tray = new THREE.Group(); tray.position.y = T + 0.05; box.add(tray);
  let cigars = [], meshes = [], extras = [], sel = 0, open = false, lidA = 0, lidTarget = 0, mats = [];
  const show = new THREE.Group(); show.position.set(0, 2.55, 1.15); scene.add(show);
  function setCigars(list, idx = 0) {
    const key = JSON.stringify(list.map(c => [c.id, c.shape, c.length, c.ring, c.wrapper, c.band, c.band2, c.bandStyle, c.bandText, c.bandText2]));
    if (key !== setCigars.key) {
      setCigars.key = key; meshes.concat(extras).forEach(m => m.parent?.remove(m)); extras = []; mats.forEach(m => m.dispose?.()); mats = []; meshes = [];
      cigars = list; const n = list.length, cols = n > 6 ? 2 : 1, rows = Math.ceil(n / cols), sp = Math.min(0.46, (D - 0.7) / Math.max(rows, 1)), cw = (W - 0.5) / cols;
      list.forEach((c, i) => { const m = buildCigar(c, mats); const col = cols === 2 ? (i < rows ? 0 : 1) : 0, row = cols === 2 ? i % rows : i; m.userData.slot = new THREE.Vector3(cols === 2 ? (col - 0.5) * cw : 0, m.userData.R, (row - (rows - 1) / 2) * sp); m.userData.rest = new THREE.Euler(0, Math.PI / 2 + (rnd() - 0.5) * 0.04, 0); m.position.copy(m.userData.slot); m.rotation.copy(m.userData.rest); m.userData.i = i; m.traverse(o => o.userData.i = i); tray.add(m); meshes.push(m); });
      // кедровая перегородка между рядами
      if (cols === 2) { const div = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, D - 0.4), cedar); div.position.set(0, 0.17, 0); tray.add(div); extras.push(div); }
    }
    select(Math.min(idx, cigars.length - 1), true);
  }
  let spin = 0, dragSpin = 0;
  // тлеющий кончик и дым у выбранной сигары
  const emberMat = new THREE.MeshBasicMaterial({ map: emberTex, toneMapped: false });
  const emberLight = new THREE.PointLight(0xff7a2a, 3, 1.6);
  const PUFFS = 26, puffs = [], smokeMat = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.5 });
  for (let i = 0; i < PUFFS; i++) { const sp = new THREE.Sprite(smokeMat.clone()); sp.visible = false; scene.add(sp); puffs.push({ sp, life: 1 + i / PUFFS, v: new THREE.Vector3() }); }
  const footWorld = new THREE.Vector3();
  function light(m, on) { const f = m?.userData.foot; if (!f) return; if (on) { f.userData.orig ||= f.material; f.material = emberMat; f.add(emberLight); emberLight.position.set(0, 0, -0.08); } else if (f.userData.orig) { f.material = f.userData.orig; f.remove(emberLight); } }
  function select(i, quiet) {
    if (!meshes.length) return; i = (i + meshes.length) % meshes.length;
    const prev = meshes[sel]; if (prev && prev.parent === show) { show.remove(prev); tray.add(prev); prev.position.copy(prev.userData.slot); prev.rotation.copy(prev.userData.rest); prev.scale.setScalar(1); }
    light(prev, false); sel = i; const m = meshes[sel]; light(m, true); tray.remove(m); show.add(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.userData.t = 0;
    if (!open && !quiet) { setOpen(true); onLid?.(true); }
    show.visible = open; kick();
  }
  function setOpen(v) { open = v; lidTarget = v ? -1.82 : 0; show.visible = open; if (!open) puffs.forEach(p => p.sp.visible = false); kick(); return open; }

  // ввод
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), el = renderer.domElement;
  let drag = null, tilt = { x: 0, y: 0 }, tiltT = { x: 0, y: 0 };
  const hit = e => { const r = el.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam); return ray.intersectObjects([box, show], true)[0]?.object; };
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, s: dragSpin, moved: false }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect(); tiltT.y = ((e.clientX - r.left) / r.width - 0.5) * 0.25; tiltT.x = ((e.clientY - r.top) / r.height - 0.5) * 0.08;
    if (drag) { const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; dragSpin = drag.s + dx * 0.012; }
    else { const o = hit(e); el.style.cursor = o && (o.userData.i !== undefined || !open) ? 'pointer' : 'grab'; }
    kick();
  });
  el.addEventListener('pointerup', e => {
    if (drag && !drag.moved) { const o = hit(e); if (o) { if (!open) { setOpen(true); onLid?.(true); } else if (o.userData.i !== undefined && o.userData.i !== sel) { select(o.userData.i); onPick?.(sel); } } }
    drag = null;
  });
  el.addEventListener('pointerleave', () => { tiltT.x = tiltT.y = 0; kick(); });

  let active = false, visible = true, raf = 0, last = performance.now();
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(host);
  function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; const k = w / h < 1.25 ? 1.25 / (w / h) : 1; cam.position.set(0, 6.6 * k, 6.9 * k); cam.lookAt(look); cam.updateProjectionMatrix(); kick(); }
  new ResizeObserver(size).observe(host);
  function kick() { if (!raf && active && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(t) {
    raf = 0; const dt = Math.min(0.05, (t - last) / 1000); last = t; let moving = false;
    const dl = lidTarget - lidA; if (Math.abs(dl) > 0.001) { lidA += dl * Math.min(1, dt * 5); moving = true; } lidPivot.rotation.x = lidA;
    tilt.x += (tiltT.x - tilt.x) * Math.min(1, dt * 6); tilt.y += (tiltT.y - tilt.y) * Math.min(1, dt * 6); box.rotation.set(tilt.x, tilt.y, 0); if (Math.abs(tiltT.y - tilt.y) > 0.001) moving = true;
    if (open && meshes[sel]) {
      const m = meshes[sel]; m.userData.t = Math.min(1, (m.userData.t || 0) + dt * 2.2); const e = 1 - Math.pow(1 - m.userData.t, 3);
      spin += dt * (drag ? 0 : 0.5);
      // сигара поднимается из коробки и поворачивается боком к зрителю
      show.position.set(0, 1.0 + 2.1 * e + Math.sin(t / 700) * 0.04, 0.2 + 2.3 * e); show.scale.setScalar(1 + 0.25 * e);
      show.rotation.set(0.35, (Math.PI / 2) * e + dragSpin, 0.08 * Math.sin(t / 1300));
      m.rotation.set(0, 0, 0); m.children[0].rotation.y = spin * 0.6;
      // дым поднимается от кончика
      m.userData.foot.getWorldPosition(footWorld); emberMat.color.setScalar(0.85 + Math.sin(t / 180) * 0.15);
      puffs.forEach(p => { p.life += dt * 0.55; if (p.life >= 1) { p.life -= 1; p.sp.position.copy(footWorld); p.v.set((Math.random() - 0.5) * 0.08, 0.32 + Math.random() * 0.2, (Math.random() - 0.5) * 0.08); }
        p.sp.visible = e > 0.9; p.sp.position.addScaledVector(p.v, dt); p.sp.position.x += Math.sin(t / 500 + p.life * 6) * 0.002; const sc = 0.08 + p.life * 0.55; p.sp.scale.set(sc, sc, 1); p.sp.material.opacity = Math.sin(p.life * Math.PI) * 0.32; });
      moving = true;
    }
    renderer.render(scene, cam);
    if (active && visible && moving) raf = requestAnimationFrame(loop);
  }
  // текстуры из Blender: орех с рельефом волокон, испанский кедр и сигарный лаунж, который отражается в лаке и латуни.
  // ~75 КБ webp, грузятся после первого кадра; если не пришли — остаются рисованные текстуры.
  const BASE = 'img/hum/', ld = n => new Promise(ok => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = BASE + n + '.webp'; });
  Promise.all(['walnut', 'walnut-n', 'cedar', 'lounge'].map(ld)).then(([wal, wn, ced, env]) => {
    const T = (img, srgb = true) => { const t = new THREE.Texture(img); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; return t; };
    if (wal) { outer.map.dispose(); outer.map = T(wal); outer.roughness = 0.42; if (outer.isMeshPhysicalMaterial) outer.clearcoat = 1; }
    if (wn) { outer.normalMap = T(wn, false); outer.normalScale.set(0.35, 0.35); }
    if (ced) { cedar.map.dispose(); cedar.map = T(ced); }
    if (env) { const pm = new THREE.PMREMGenerator(renderer), e = T(env); e.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pm.fromEquirectangular(e).texture; e.dispose(); pm.dispose(); brass.roughness = 0.22; scene.environmentIntensity = 0.4; }
    outer.needsUpdate = cedar.needsUpdate = true; kick();
  });
  function relight() { const day = document.documentElement.dataset.mode === 'day'; hemi.intensity = day ? 2 : 1.2; rim.intensity = day ? 3 : 10; kick(); }
  relight(); size();
  return {
    active(on) { active = on; if (on) { size(); kick(); } },
    setCigars, select(i) { select(i); },
    toggleLid() { return setOpen(!open); },
    get open() { return open; }, relight
  };
}
