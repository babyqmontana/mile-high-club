import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// Башня Mile High Club в центре Лос-Сантоса, как в игре: стеклянная прямоугольная башня с крылом,
// фиолетовые светодиоды по рёбрам и вывеска с верблюдом. Этажи отеля горят по статусам номеров.
// Вокруг — даунтаун: кварталы, дороги с машинами, фонари, холмы, дымка и облака,
// которые прячут дальний план, чтобы внимание оставалось на отеле.
const STATUS = { free: '#f7b50a', booked: '#f0177a', occupied: '#ef5617', cleaning: '#3a2c2e', repair: '#3a2c2e' };
const FH = 0.46, W = 4.4, D = 3.0, COLS = 56;

// --- геометрия «кольца» этажа: стены по контуру, U идёт по периметру (окна не растягиваются) ---
function outline(s) {
  const w = W * s / 2, d = D * s / 2;
  return [[-w, d], [w, d], [w, -d], [-w, -d]];
}
function ringGeo(pts, h, y0 = 0, open = false) {
  const n = pts.length, len = []; let tot = 0;
  for (let i = 0; i < (open ? n - 1 : n); i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); len.push(l); tot += l; }
  const pos = [], uv = [], nor = [], idx = []; let acc = 0;
  for (let i = 0; i < (open ? n - 1 : n); i++) {
    const a = pts[i], b = pts[(i + 1) % n], u0 = acc / tot, u1 = (acc + len[i]) / tot; acc += len[i];
    const nx = -(b[1] - a[1]), nz = b[0] - a[0], nl = Math.hypot(nx, nz), k = pos.length / 3;
    pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y0 + h, b[1], a[0], y0 + h, a[1]);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    for (let j = 0; j < 4; j++) nor.push(nx / nl, 0, nz / nl);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
function slabGeo(pts, h) { const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; }

// --- офисные этажи: развёртка по периметру в метрах, чтобы окна были одной ширины на любом объёме ---
const PANE = 0.27, ROWS = 8;
function ringGeoAtlas(pts, h, y0, row) {
  const g = ringGeo(pts, h, y0), uv = g.attributes.uv, pos = g.attributes.position, v0 = 1 - (row + 1) / ROWS;
  let acc = 0; for (let i = 0; i < uv.count; i += 4) { const ax = pos.getX(i), az = pos.getZ(i), bx = pos.getX(i + 1), bz = pos.getZ(i + 1), l = Math.hypot(bx - ax, bz - az);
    const u0 = acc / (PANE * COLS / 4), u1 = (acc + l) / (PANE * COLS / 4); acc += l;
    uv.setXY(i, u0, v0); uv.setXY(i + 1, u1, v0); uv.setXY(i + 2, u1, v0 + 1 / ROWS); uv.setXY(i + 3, u0, v0 + 1 / ROWS); }
  return g;
}
function slabRing(pts, y, h) { const g = slabGeo(pts, h); g.translate(0, y, 0); return g; }
function mergeGeos(list) { const out = mergeGeometries(list.map(g => { const k = g.index ? g.toNonIndexed() : g; ['position', 'normal', 'uv'].forEach(a => { if (!k.attributes[a]) k.setAttribute(a, new THREE.Float32BufferAttribute(new Float32Array(k.attributes.position.count * (a === 'uv' ? 2 : 3)), a === 'uv' ? 2 : 3)); }); Object.keys(k.attributes).forEach(a => { if (!['position', 'normal', 'uv'].includes(a)) k.deleteAttribute(a); }); return k; }), false); list.forEach(g => g.dispose()); return out; }
// стекло фасада: отдельно цвет стекла (отражает небо) и свет в окнах (горит только ночью)
function glassAtlas() {
  const mk = () => { const c = document.createElement('canvas'); c.width = 1024; c.height = 64 * ROWS; return c; };
  const gc = mk(), lc = mk(), g = gc.getContext('2d'), l = lc.getContext('2d'), cols = COLS / 4, cw = 1024 / cols;
  const TONES = ['#1d2833', '#253240', '#2c3a49', '#18212b', '#33414f', '#3d3a36', '#2a2f36'];
  l.fillStyle = '#000'; l.fillRect(0, 0, 1024, 64 * ROWS); seedN = 7;
  for (let r = 0; r < ROWS; r++) {
    const y = r * 64, lit = .04 + (r % 4) * .035; let run = 0, runCol = '#e2b15f';
    g.fillStyle = '#10161c'; g.fillRect(0, y, 1024, 64);
    for (let i = 0; i < cols; i++) for (let h = 0; h < 2; h++) { // две квадратные панели на этаж, как на фасаде в игре
      const x = i * cw, py = y + 5 + h * 27, band = Math.sin(i * .23 + r * .7) > .55, k = rnd();
      g.fillStyle = band ? TONES[5 + (k < .5 ? 0 : 1)] : TONES[(k * 5) | 0]; g.fillRect(x + 1.5, py, cw - 3, 25);
      const sh = g.createLinearGradient(x, py, x + cw, py + 25); sh.addColorStop(0, 'rgba(255,255,255,.07)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(x + 1.5, py, cw - 3, 25);
      if (h === 0 && run > 0) { l.fillStyle = runCol; l.globalAlpha = .7 + rnd() * .3; l.fillRect(x + 2, y + 6, cw - 4, 52); l.globalAlpha = 1; run--; }
      else if (h === 0 && rnd() < lit * .35) { run = 1 + (rnd() * 4 | 0); runCol = rnd() < .75 ? '#e2b15f' : '#f1e1bf'; }
    }
    g.fillStyle = '#0c1116'; g.fillRect(0, y, 1024, 4); g.fillRect(0, y + 59, 1024, 5); g.fillStyle = '#20272e'; g.fillRect(0, y + 31, 1024, 2);
  }
  // фасад из Blender: перегородки, жалюзи, столы и потолочный свет за стеклом (та же сетка 14 × 8)
  paintBake(g, l);
  const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  return { glass: tex(gc), lit: tex(lc) };
}
function paintBake(g, l) {
  if (BAKE['fac-glass'] && BAKE['fac-lit']) { g.drawImage(BAKE['fac-glass'], 0, 0, 1024, 64 * ROWS); l.drawImage(BAKE['fac-lit'], 0, 0, 1024, 64 * ROWS); l.globalAlpha = .16; l.globalCompositeOperation = 'lighter'; l.drawImage(BAKE['fac-glass'], 0, 0, 1024, 64 * ROWS); l.globalAlpha = 1; l.globalCompositeOperation = 'source-over'; } // тусклый дежурный свет: жалюзи и перегородки видны и в тёмных окнах
}
// вертикальные импосты: тонкие рёбра по шагу панелей, дают фасаду глубину и блики
function finsFor(pts, y0, y1) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]), nx = (B[1] - A[1]) / L, nz = -(B[0] - A[0]) / L, ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    for (let u = PANE; u < L - .05; u += PANE) { const g = new THREE.BoxGeometry(.03, y1 - y0, .07); g.rotateY(-ang); g.translate(A[0] + (B[0] - A[0]) * u / L - nx * .035, (y0 + y1) / 2, A[1] + (B[1] - A[1]) * u / L - nz * .035); out.push(g); }
  }
  return out;
}
// этаж площадки: тёплый интерьер за стеклом и полоса фирменного цвета
function venueCanvas(v) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64; const g = c.getContext('2d'), cw = 2048 / COLS;
  const acc = new THREE.Color(v.accent || '#f7b50a'), warm = v.kind === 'pool' ? '#7fd6d0' : v.kind === 'club' ? '#d9a35a' : '#f0c47a';
  g.fillStyle = '#0d0a0b'; g.fillRect(0, 0, 2048, 64);
  for (let i = 0; i < COLS; i++) { const gr = g.createLinearGradient(0, 8, 0, 56); gr.addColorStop(0, warm); gr.addColorStop(1, '#' + acc.clone().multiplyScalar(.55).getHexString()); g.fillStyle = gr; g.globalAlpha = .75 + (i % 3) * .08; g.fillRect(i * cw + 4, 8, cw - 8, 48); g.globalAlpha = 1; g.fillStyle = '#2c3540'; g.fillRect(i * cw, 0, 2, 64); }
  g.fillStyle = '#' + acc.getHexString(); g.fillRect(0, 56, 2048, 5);
  g.fillStyle = '#141b22'; g.fillRect(0, 0, 2048, 6); g.fillRect(0, 61, 2048, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// места, где не ставим типовые дома: комплекс отеля и ориентиры района
const LANDMARKS = [[14, -14, 4.2], [13, -8.5, 4.8], [-14, -14, 3.6], [-7, 7, 4.5], [24, -27, 5]];
const reserved = (x, z) => (x > -7 && x < 13 && z > -6 && z < 7) || Math.abs(x - 17.5) < 3.2 || LANDMARKS.some(([lx, lz, r]) => Math.hypot(x - lx, z - lz) < r);
// светодиодная лента: короткие яркие сегменты с зазорами
function ledTex() { const c = document.createElement('canvas'); c.width = 4; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#2a0b3d'; g.fillRect(0, 0, 4, 32); g.fillStyle = '#ffffff'; g.fillRect(0, 4, 4, 22); const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t; }

// --- запечённое в Blender (Cycles): панорамы города для отражений, фасад офисов, интерьер номера, тень от комплекса.
// ~85 КБ webp, грузятся после первого кадра; пока не пришли или не загрузились — башня рисуется как раньше.
const BAKE = {}, BAKE_URL = 'img/tower/', BAKE_V = '?v=3'; // ?v — сброс кэша браузера при обновлении ассетов
// кровельный набор из Blender (баки, вентиляция, мачты, карнизы, короны, градирни, техэтаж, гондола мойки фасада)
let KIT = null;
function loadKit() {
  return import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader().loadAsync(BAKE_URL + 'kit.glb' + BAKE_V)).then(g => {
    const out = {}; g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingSphere(); out[o.name] = geo; } });
    out.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .15 }); KIT = out; return out;
  }).catch(() => null);
}
function loadBake() {
  return Promise.all(['env-night', 'fac-glass', 'fac-lit', 'room', 'shadow', 'city-fac'].concat(document.documentElement.dataset.mode === 'day' ? ['env-day'] : []).map(n => new Promise(ok => {
    const i = new Image(); i.decoding = 'async'; i.onload = () => { BAKE[n] = i; ok(); }; i.onerror = () => ok(); i.src = BAKE_URL + n + '.webp' + BAKE_V;
  })));
}

// --- окна этажа: для этажей отеля — по номерам, для остальных — офисные ---
let seedN = 1; const rnd = () => (seedN = seedN * 16807 % 2147483647) / 2147483647;
function floorCanvas(rooms, mode, hi = null, hov = null, dim = null) { // dim — номера, не прошедшие фильтр: окна гаснут
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#0a0f15'; g.fillRect(0, 0, 2048, 64);
  const cw = 2048 / COLS;
  for (let i = 0; i < COLS; i++) {
    let col, a = 1;
    if (rooms) {
      const n = Math.max(1, rooms.length), ri = Math.floor(i / COLS * n), room = rooms[ri];
      col = STATUS[room?.status] || '#24161a';
      if (dim && room && dim.has(room.id) && room.id !== hi) a = .14;
      if (room && (room.id === hi || room.id === hov)) { g.fillStyle = room.id === hi ? '#f9edc7' : 'rgba(249,237,199,.55)'; g.fillRect(i * cw, 0, cw, 7); g.fillRect(i * cw, 57, cw, 7); if (room.id === hi) col = '#fff4d8'; }
      const edge = Math.floor((ri + 1) * COLS / n) - 1 === i; // простенок между номерами
      if (edge && n > 1) { g.fillStyle = '#1d242c'; g.fillRect(i * cw + cw - 5, 6, 5, 52); }
    } else {
      seedN = (seedN + i * 31) % 2147483646 + 1; const r = rnd();
      col = r < mode ? (rnd() < 0.75 ? '#e8c27c' : '#f4ead0') : (rnd() < .5 ? '#1a2633' : '#121b25'); a = r < mode ? 0.55 + rnd() * 0.45 : 1; // тёмное синее стекло, часть окон светится
    }
    g.globalAlpha = a; const gr = g.createLinearGradient(0, 8, 0, 56); gr.addColorStop(0, col); gr.addColorStop(1, shade(col, -0.32));
    g.fillStyle = gr; g.fillRect(i * cw + 5, 8, cw - 11, 48);
    if (rooms && BAKE.room) { // комната из Blender: шторы, торшеры, кровать — умножается на цвет статуса
      const n = Math.max(1, rooms.length), ri = Math.floor(i / COLS * n), a0 = Math.ceil(ri * COLS / n), a1 = Math.floor((ri + 1) * COLS / n) - 1;
      const v = a0 === a1 ? 1 : i === a0 ? 0 : i === a1 ? 2 : 1;
      g.globalCompositeOperation = 'multiply'; g.drawImage(BAKE.room, v * 128 + 6, 6, 116, 231, i * cw + 5, 8, cw - 11, 48); g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
    g.fillStyle = '#2c3540'; g.fillRect(i * cw, 0, 2, 64); // стальной импост
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(i * cw + 3, 8, (cw - 8) * 0.35, 48);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * cw + 3, 30, cw - 8, 1.5); // импост
  }
  g.fillStyle = '#141b22'; g.fillRect(0, 0, 2048, 6); g.fillRect(0, 58, 2048, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function shade(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k * 0.5); return '#' + c.getHexString(); }

// --- мягкая текстура облака/дымки ---
function cloudTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const x = 60 + Math.random() * 136, y = 90 + Math.random() * 76, r = 30 + Math.random() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// --- городские здания: окна считаются в шейдере по мировым координатам, поэтому чёткие на любом размере ---
function cityMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x1f1517, roughness: 0.55, metalness: 0.35 });
  m.userData.uniforms = { uLit: { value: 0.35 }, uDay: { value: 0 }, uSnow: { value: 0 }, uFac: { value: null }, uHasFac: { value: 0 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;varying vec3 vN;varying float vId;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp4=instanceMatrix*vec4(position,1.);vWp=wp4.xyz;vN=normalize(mat3(instanceMatrix)*normal);vId=float(gl_InstanceID);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit,uDay,uSnow,uHasFac;uniform sampler2D uFac;varying vec3 vWp;varying vec3 vN;varying float vId;\nfloat h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if(abs(vN.y)<.5){
        float u=abs(vN.x)>abs(vN.z)?vWp.z:vWp.x; vec2 g=vec2(u/.34,vWp.y/.42); vec2 id=floor(g), f=fract(g);
        float aa=clamp(1.6-max(fwidth(g.x),fwidth(g.y))*2.2,0.,1.); // вдали окна сливаются в ровный тон без ряби
        float win=step(.18,f.x)*step(f.x,.82)*step(.2,f.y)*step(f.y,.78)*aa;
        // фасады из Blender: у каждого дома свой стиль (кирпич, ленточные окна, стеклянная стена, ар-деко),
        // кусок 4 окна × 3 этажа; альфа — стекло, по нему и горят окна
        if(uHasFac>.5&&aa>.02){ // дальние дома — без выборки из текстуры, там окна всё равно сливаются в тон
          float st=floor(h21(vec2(vId*.37,3.1))*4.); vec2 cell=vec2(mod(st,2.),1.-floor(st/2.)), q=g/vec2(4.,3.);
          vec4 fa=textureGrad(uFac,(cell+fract(q)*.992+.004)*.5,dFdx(q)*.5,dFdy(q)*.5);
          diffuseColor.rgb=mix(fa.rgb,fa.rgb*diffuseColor.rgb*2.4,.45);
          win=smoothstep(.15,.85,fa.a)*aa; // без порога: на среднем плане стекло мягко сливается, без ряби
        }
        float r=h21(id+vId*7.13);
        float on=step(1.-uLit,r)*win;
        totalEmissiveRadiance+=vec3(.91,.76,.49)*uLit*.22*(1.-aa)*(1.-uDay*.75);
        vec3 wc=mix(vec3(.91,.76,.49),vec3(.96,.92,.82),step(.8,h21(id.yx+vId)));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.6+vec3(.02,.04,.05),win*(1.-on));
        totalEmissiveRadiance+=wc*on*(.9+.6*r)*(1.-uDay*.75);
        float band=step(.94,fract(vWp.y/.42/6.));
        diffuseColor.rgb*=1.-band*.25;
      } else if(vN.y>.5){ diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.92,.9),uSnow); }`);
  };
  return m;
}
// --- асфальт с разметкой: кварталы по сетке ---
function groundMaterial(block, road) {
  return new THREE.ShaderMaterial({
    fog: true, uniforms: { ...THREE.UniformsLib.fog, uDay: { value: 0 }, uSnow: { value: 0 } },
    vertexShader: `varying vec3 vWp;\n#include <fog_pars_vertex>\nvoid main(){vec4 wp=modelMatrix*vec4(position,1.);vWp=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float uDay,uSnow;varying vec3 vWp;\n#include <fog_pars_fragment>\nvoid main(){
      vec2 p=vWp.xz+${(block / 2).toFixed(2)}; vec2 m=mod(p,${block.toFixed(2)}); vec2 dr=min(m,${block.toFixed(2)}-m);
      float rd=step(min(dr.x,dr.y),${(road / 2).toFixed(2)});
      float walk=step(min(dr.x,dr.y),${(road / 2 + .35).toFixed(2)})-rd;
      vec3 col=mix(vec3(.075,.055,.058),vec3(.045,.036,.04),rd);
      col=mix(col,vec3(.13,.11,.1),walk);
      float lane=rd*step(min(dr.x,dr.y),.03)*step(.5,fract((dr.x<dr.y?p.y:p.x)*.9));
      col+=vec3(.95,.72,.25)*lane*.5;
      col*=mix(1.,2.2,uDay);
      col=mix(col,mix(vec3(.32,.3,.31),vec3(.86,.85,.84),uDay)*(1.-rd*.35),uSnow*(1.-lane));
      gl_FragColor=vec4(col,1.);
      #include <fog_fragment>
    }`
  });
}

function beamMat(color, k, fall = 1.8) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uC: { value: new THREE.Color(color) }, uK: { value: k }, uF: { value: fall } },
    vertexShader: 'varying vec3 vN,vV;varying float vY;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);vY=uv.y;gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 uC;uniform float uK,uF;varying vec3 vN,vV;varying float vY;void main(){float f=pow(abs(dot(vN,vV)),2.);gl_FragColor=vec4(uC*f*pow(1.-vY,uF)*uK,1.);}' });
}
// конус луча с источником в начале координат, растёт вверх по Y
function beamGeo(r0, r1, h) { const g = new THREE.CylinderGeometry(r1, r0, h, 24, 1, true); g.translate(0, h / 2, 0); return g; }

export function mountTower(host, { onPick, onPickVenue, onSpin, onHoverFloor }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // чёткость: на телефонах сразу ниже, дальше подстраивается под реальную скорость кадров (только вниз, без скачков)
  const coarse = matchMedia('(pointer: coarse)').matches; let dpr = Math.min(devicePixelRatio, coarse ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0x2a1f24); scene.fog = new THREE.FogExp2(fogCol, 0.021); scene.background = fogCol.clone();
  const pm = new THREE.PMREMGenerator(renderer), envRoom = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture; scene.environment = envRoom;
  let envBake = null; // { night, day } — отражения настоящего города вместо студийного света
  const cam = new THREE.PerspectiveCamera(32, 1, 0.2, 400);
  const hemi = new THREE.HemisphereLight(0xf2e2c8, 0x1a120a, 0.55), key = new THREE.DirectionalLight(0xffcf98, 1.5), rim = new THREE.PointLight(0xb45cff, 34, 34, 1.6), rim2 = new THREE.PointLight(0xf7b50a, 30, 40, 1.6);
  key.position.set(-14, 22, 12); rim.position.set(-8, 22, -8); rim2.position.set(9, 2, -8); scene.add(hemi, key, rim, rim2);

  // ночное небо: глубокий сине-фиолетовый градиент, мерцающие звёзды, луна с ореолом, тонкие перистые облака
  // и засветка большого города у горизонта в фиолетово-розовых тонах
  const MOON = new THREE.Vector3(-.62, .2, -.76).normalize();
  const skyU = { uDay: { value: 0 }, uFog: { value: new THREE.Color() }, uTime: { value: 0 }, uMoon: { value: MOON } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uDay,uTime;uniform vec3 uFog,uMoon;varying vec3 vP;
      float h31(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
      float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float fbm(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n3(p);p*=2.03;a*=.5;}return v;}
      void main(){vec3 d=normalize(vP);float h=d.y;
        vec3 zen=vec3(.012,.014,.045), mid=vec3(.07,.035,.13), glow=vec3(.42,.12,.34), amber=vec3(.62,.28,.18);
        vec3 c=mix(mid,zen,smoothstep(.08,.65,h));
        // засветка города: розово-фиолетовая полоса у горизонта, к луне теплее
        float lp=exp(-max(h,0.)*9.);
        c+=mix(glow,amber,.35*smoothstep(.2,1.,dot(normalize(d.xz),normalize(uMoon.xz))))*lp*.55;
        // звёзды двух размеров с мерцанием, у горизонта тонут в засветке
        vec3 sp=d*180.;vec3 id=floor(sp);float r=h31(id);vec3 f=fract(sp)-.5-vec3(h31(id+1.)-.5,h31(id+2.)-.5,h31(id+3.)-.5)*.6;
        float star=smoothstep(.09,0.,length(f))*step(.95,r)*1.3*(.55+.45*sin(uTime*(1.5+r*3.)+r*40.));
        vec3 sp2=d*60.;vec3 id2=floor(sp2);float r2=h31(id2+7.);vec3 f2=fract(sp2)-.5;
        star+=smoothstep(.06,0.,length(f2))*step(.992,r2)*1.6;
        c+=vec3(.85,.88,1.)*star*smoothstep(.06,.22,h)*(1.-lp*.6);
        // луна: диск с лёгкими морями и широкий ореол
        float md=dot(d,uMoon);float disc=smoothstep(.99935,.99955,md);
        float maria=fbm(d*220.)*.35;
        c=mix(c,vec3(1.,.95,.86)*(1.-maria),disc);
        c+=vec3(.55,.5,.75)*pow(max(md,0.),900.)*.6+vec3(.25,.18,.4)*pow(max(md,0.),40.)*.35;
        // перистые облака медленно плывут, снизу подсвечены городом
        vec3 cp=vec3(d.x/(h+.25),0.,d.z/(h+.25))*2.2+vec3(uTime*.006,0.,uTime*.002);
        float cl=smoothstep(.5,.8,fbm(cp*vec3(1.,1.,3.)))*smoothstep(.02,.15,h)*(1.-smoothstep(.45,.8,h));
        c=mix(c,mix(vec3(.16,.07,.2),vec3(.35,.14,.3),lp*2.),cl*.75);
        c+=vec3(.6,.5,.8)*cl*pow(max(md,0.),25.)*.3;
        c=mix(pow(uFog,vec3(1./2.2)),c,smoothstep(-.02,.1,h)); // у горизонта небо = цвет дымки, город растворяется без границы
        gl_FragColor=vec4(c,1.);}` }));
  scene.add(sky);

  const root = new THREE.Group(); scene.add(root);
  const world = new THREE.Group(); scene.add(world);
  const brass = new THREE.MeshStandardMaterial({ color: 0xcfa451, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x241819, metalness: 0.25, roughness: 0.6 });
  const slabM = new THREE.MeshStandardMaterial({ color: 0x2a1c1f, metalness: 0.5, roughness: 0.4 });
  const neon = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const emis = (map, k) => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: k, metalness: 0.5, roughness: 0.18, envMapIntensity: 0.9 });

  // ---------- город ----------
  const BLOCK = 7, ROAD = 1.6, GROUND = -0.6;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMaterial(BLOCK, ROAD)); ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; world.add(ground);
  const cityM = cityMaterial(), cityAtlas = glassAtlas(), landmarkMats = []; let crownLit = null;
  const lots = []; seedN = 11;
  for (let gx = -9; gx <= 9; gx++) for (let gz = -9; gz <= 9; gz++) {
    const cx = gx * BLOCK, cz = gz * BLOCK, d = Math.hypot(cx, cz); if (reserved(cx, cz)) continue; // квартал отеля, площадь и ориентиры
    // в квартале 1–4 здания
    const parts = d < 48 ? (rnd() < .5 ? 2 : 4) : (rnd() < .5 ? 1 : 2), inner = BLOCK - ROAD - 0.9;
    for (let k = 0; k < parts; k++) {
      const sw = parts === 4 ? inner / 2 - .2 : parts === 2 ? inner : inner, sd = parts === 4 ? inner / 2 - .2 : parts === 2 ? inner / 2 - .2 : inner;
      const ox = parts === 4 ? (k % 2 ? 1 : -1) * (inner / 4 + .05) : 0, oz = parts >= 2 ? (k < parts / 2 ? -1 : 1) * (inner / 4 + .05) : 0;
      const downtown = cx < 4 && cz < 2, warehouses = cx > 12;
      const tall = warehouses ? .5 + rnd() * 1.2 : downtown ? (d < 30 ? 1.5 + rnd() * 3 : d < 70 ? 4 + rnd() * 8 : 2.5 + rnd() * 6) : d < 42 ? 0.8 + rnd() * 2.6 : d < 62 ? 3 + rnd() * 6 : 1.5 + rnd() * 4; // за отелем даунтаун, справа склады, спереди средняя застройка
      lots.push({ x: cx + ox, z: cz + oz, w: sw * (.9 + rnd() * .1), d: sd * (.9 + rnd() * .1), h: tall });
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const tiers = []; lots.forEach(l => { tiers.push(l); if (l.h > 8 && rnd() < .6) { const k = .62 + rnd() * .15; tiers.push({ x: l.x, z: l.z, w: l.w * k, d: l.d * k, h: l.h * (1.12 + rnd() * .18), top: true }); } });
  const city = new THREE.InstancedMesh(box, cityM, tiers.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
  const PALETTE = [0x8f8379, 0x7d746e, 0x6b635f, 0x958a80, 0x84786c, 0x4a5462, 0x3f4855, 0x887d71], C3 = new THREE.Color();
  tiers.forEach((t, i) => { M.compose(V.set(t.x, GROUND, t.z), Q, Sc.set(t.w, t.h, t.d)); city.setMatrixAt(i, M); const glassy = t.h > 8; city.setColorAt(i, C3.set(PALETTE[glassy ? 5 + (i % 2) : [0, 1, 2, 3, 4, 7][(i * 7) % 6]])); }); world.add(city);
  // ориентиры района как в игре: круглая башня с короной, высокий отель-пластина, театр с закруглённым углом, эстакада
  {
    const lmGlass = new THREE.MeshStandardMaterial({ map: cityAtlas.glass, emissiveMap: cityAtlas.lit, emissive: 0xffffff, emissiveIntensity: .8, metalness: .6, roughness: .2 }); landmarkMats.push(lmGlass);
    lmGlass.map = cityAtlas.glass.clone(); lmGlass.map.repeat.set(6, 22); lmGlass.map.needsUpdate = true; lmGlass.emissiveMap = cityAtlas.lit.clone(); lmGlass.emissiveMap.repeat.set(6, 22); lmGlass.emissiveMap.needsUpdate = true;
    lmGlass.map.wrapT = lmGlass.emissiveMap.wrapT = THREE.RepeatWrapping;
    // круглая ступенчатая башня с короной: светлый камень с горизонтальными лентами окон
    const stoneLM = new THREE.MeshStandardMaterial({ color: 0x3b3236, roughness: .55, metalness: .35 });
    const bandTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#6d6670'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#262c36'; g.fillRect(0, 18, 256, 26); for (let x = 0; x < 256; x += 16) { g.fillStyle = '#4a5560'; g.fillRect(x, 18, 2, 26); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const bandLit = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64); for (let x = 0; x < 256; x += 16) if (Math.random() < .35) { g.fillStyle = '#e6c487'; g.fillRect(x + 3, 20, 11, 22); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const RT = [14, -14];
    [[3.2, 3.4, 15, 0], [2.7, 2.95, 6, 15], [2.15, 2.4, 3.5, 21]].forEach(([r1, r2, h, y]) => {
      const m = new THREE.MeshStandardMaterial({ map: bandTex.clone(), emissiveMap: bandLit.clone(), emissive: 0xffffff, emissiveIntensity: .8, roughness: .6 }); [m.map, m.emissiveMap].forEach(t => { t.repeat.set(Math.round(r1 * 5), h * 2.2); t.needsUpdate = true; }); landmarkMats.push(m);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 48, 1, true), m); c.position.set(RT[0], GROUND + y + h / 2, RT[1]); world.add(c);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r1 + .08, r1 + .08, .28, 48), stoneLM); ring.position.set(RT[0], GROUND + y + h, RT[1]); world.add(ring); });
    crownLit = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 1.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2226, emissive: 0xffb45a, emissiveIntensity: 0, roughness: .5, side: THREE.DoubleSide })); crownLit.position.set(RT[0], GROUND + 25.25, RT[1]); world.add(crownLit);
    const padR = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, .12, 40), stoneLM); padR.position.set(RT[0], GROUND + 26, RT[1]); world.add(padR);
    // зелёная площадь с круглым фонтаном и деревьями у её подножия
    const park = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), new THREE.MeshStandardMaterial({ color: 0x5d7346, roughness: 1 })); park.rotation.x = -Math.PI / 2; park.position.set(RT[0] - 1, GROUND + .03, RT[1] + 5.5); world.add(park);
    const walk = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.2, 48), new THREE.MeshStandardMaterial({ color: 0x4a4246, roughness: .9 })); walk.rotation.x = -Math.PI / 2; walk.position.set(RT[0] - 1, GROUND + .05, RT[1] + 5.5); world.add(walk);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshStandardMaterial({ color: 0x4a8fa0, roughness: .1, metalness: .3 })); pool.rotation.x = -Math.PI / 2; pool.position.set(RT[0] - 1, GROUND + .06, RT[1] + 5.5); world.add(pool);
    const treesN = 22, trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.42, 0), new THREE.MeshStandardMaterial({ color: 0x46613a, roughness: 1, flatShading: true }), treesN);
    for (let k = 0; k < treesN; k++) { const a = k / treesN * Math.PI * 2, r = 3.4 + (k % 2) * .6; M.compose(V.set(RT[0] - 1 + Math.cos(a) * r, GROUND + .5, RT[1] + 5.5 + Math.sin(a) * r), Q.identity(), Sc.set(1, 1.25, 1)); trees.setMatrixAt(k, M); } world.add(trees);
    // отель «Баннер»: светлая пластина с короной слева за отелем
    const bannerTex = bandTex.clone(); bannerTex.repeat.set(4, 40); bannerTex.needsUpdate = true;
    const bannerM = new THREE.MeshStandardMaterial({ map: bannerTex, emissiveMap: bandLit.clone(), emissive: 0xffffff, emissiveIntensity: .8, roughness: .7 }); bannerM.emissiveMap.repeat.set(4, 40); bannerM.emissiveMap.needsUpdate = true; landmarkMats.push(bannerM);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(2.6, 18, 4.4), bannerM); banner.position.set(-14, GROUND + 9, -14); world.add(banner);
    const bcap = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1, 4.7), stoneLM); bcap.position.set(-14, GROUND + 18.5, -14); world.add(bcap);
    // две изогнутые стеклянные башни дальше справа
    [[28, -28, 0], [31, -24, .7]].forEach(([x, z, rot], k) => { const g = new THREE.CylinderGeometry(6, 6, 20 - k * 3, 24, 1, true, rot, 1.05); const m = new THREE.Mesh(g, lmGlass); m.position.set(x - 6, GROUND + (20 - k * 3) / 2, z); world.add(m); });
    const theaterM = new THREE.MeshStandardMaterial({ color: 0x2e2629, roughness: .92, metalness: 0 });
    const mqM = new THREE.MeshBasicMaterial({ color: 0xffb45a, toneMapped: false }), marquee = new THREE.Mesh(new THREE.BoxGeometry(5.1, .22, 3.5), [mqM, mqM, theaterM, theaterM, mqM, mqM]); marquee.position.set(-8, GROUND + 2.25, 7.3); world.add(marquee);
    const thGlow = new THREE.Mesh(beamGeo(2.2, 3.4, 2.4), beamMat(0xffb45a, .5)); thGlow.position.set(-8, GROUND, 7.3); thGlow.scale.set(1.25, 1, .85); world.add(thGlow);
    const th = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 3.4), theaterM); th.position.set(-8, GROUND + 1.1, 7.3); world.add(th);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(.5, 3.2, .5), new THREE.MeshStandardMaterial({ color: 0x2c2428, roughness: .5 })); pylon.position.set(-10.8, GROUND + 1.6, 9.4); world.add(pylon);
    const thr = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.2, 32, 1, false, 0, Math.PI / 2), theaterM); thr.position.set(-5.5, GROUND + 1.1, 7.3); world.add(thr);
    const bands = new THREE.Mesh(new THREE.BoxGeometry(5.05, .08, 3.45), new THREE.MeshStandardMaterial({ color: 0x241d20 })); [.6, 1.2, 1.8].forEach(y => { const b = bands.clone(); b.position.set(-8, GROUND + y, 7.3); world.add(b); });
    const deckM = new THREE.MeshStandardMaterial({ color: 0x575350, roughness: .9 });
    // широкая эстакада справа, как на кадре сверху: две полосы с разметкой
    const fwTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#3a3836'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#d8d0b8'; [16, 32, 48].forEach(x => { g.fillRect(x - 1, 0, 2, 60); }); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 30); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    [17.5 - 1.3, 17.5 + 1.3].forEach(x => { const fw = new THREE.Mesh(new THREE.BoxGeometry(2.4, .3, 130), [deckM, deckM, new THREE.MeshStandardMaterial({ map: fwTex, roughness: .9 }), deckM, deckM, deckM]); fw.position.set(x, GROUND + 2.2, 0); world.add(fw); });
    const fwPiers = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 2.2, .5), deckM, 22); for (let k = 0; k < 22; k++) { M.compose(V.set(17.5, GROUND + 1.1, -63 + k * 6), Q.identity(), Sc.set(1, 1, 1)); fwPiers.setMatrixAt(k, M); } world.add(fwPiers);
    // поперечной эстакады нет: на кадрах только одна, вдоль правой стороны
  }
  // крыши: техэтажи и красные огни на высоких
  const roofs = new THREE.InstancedMesh(box, stone, lots.length); lots.forEach((l, i) => { M.compose(V.set(l.x + (rnd() - .5) * l.w * .3, GROUND + l.h, l.z + (rnd() - .5) * l.d * .3), Q, Sc.set(l.w * .3, .35, l.d * .3)); roofs.setMatrixAt(i, M); }); world.add(roofs);
  const tipPts = []; tiers.forEach(t => { if (t.h > 10) tipPts.push(t.x, GROUND + t.h + .25, t.z); });
  const beaconsG = new THREE.BufferGeometry(); beaconsG.setAttribute('position', new THREE.Float32BufferAttribute(tipPts, 3));
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const beacons = new THREE.Points(beaconsG, new THREE.PointsMaterial({ map: dotTex, color: 0xef5617, size: .7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); world.add(beacons);
  // фонари вдоль дорог
  const lamp = []; for (let a = -9; a <= 9; a++) for (let b = -60; b <= 60; b += 2.3) { const r = a * BLOCK + BLOCK / 2; [[r + ROAD / 2 + .15, b], [b, r + ROAD / 2 + .15]].forEach(([x, z]) => { if (Math.hypot(x, z) < 70) lamp.push(x, GROUND + .55, z); }); }
  const lampG = new THREE.BufferGeometry(); lampG.setAttribute('position', new THREE.Float32BufferAttribute(lamp, 3));
  const lamps = new THREE.Points(lampG, new THREE.PointsMaterial({ map: dotTex, color: 0xffc46a, size: .55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); world.add(lamps);
  // машины: пары фар и стопов бегут по дорогам
  const CARS = 220, cars = []; for (let i = 0; i < CARS; i++) { const axis = rnd() < .5 ? 0 : 1, line = Math.round((rnd() - .5) * 16) * BLOCK + BLOCK / 2, dir = rnd() < .5 ? 1 : -1; cars.push({ axis, line: line + dir * ROAD * .22, dir, p: (rnd() - .5) * 120, v: 2 + rnd() * 2.5 }); }
  const carG = new THREE.BufferGeometry(), carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3);
  cars.forEach((c, i) => { const col = c.dir > 0 ? [1, .92, .78] : [1, .18, .45]; carCol.set(col, i * 3); });
  carG.setAttribute('position', new THREE.BufferAttribute(carPos, 3)); carG.setAttribute('color', new THREE.BufferAttribute(carCol, 3));
  const carPts = new THREE.Points(carG, new THREE.PointsMaterial({ map: dotTex, vertexColors: true, size: .5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); world.add(carPts);
  // холмы Вайнвуда — тёмный силуэт по кругу, закрывают горизонт
  const hillsG = new THREE.CylinderGeometry(150, 150, 1, 160, 8, true), hp = hillsG.attributes.position;
  for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), z = hp.getZ(i), y = hp.getY(i), a = Math.atan2(z, x); const hgt = 10 + Math.sin(a * 3) * 6 + Math.sin(a * 7 + 1) * 4 + Math.sin(a * 17) * 1.5; hp.setY(i, (y + .5) * hgt - 1); }
  hillsG.computeVertexNormals();
  const hills = new THREE.Mesh(hillsG, new THREE.MeshStandardMaterial({ color: 0x170e10, roughness: 1, side: THREE.BackSide })); // холмы растворяются в дымке; их не видно как стену
  hills.visible = false; world.add(hills);
  // дымка и облака
  const ct = cloudTex(), clouds = new THREE.Group(); world.add(clouds); const cloudMats = [];
  for (let i = 0; i < 76; i++) {
    const ring = i < 46, a = rnd() * Math.PI * 2, r = ring ? 46 + rnd() * 40 : 30 + rnd() * 50, y = ring ? GROUND + 3 + rnd() * 9 : 24 + rnd() * 14;
    const m = new THREE.SpriteMaterial({ map: ct, color: 0xffffff, transparent: true, depthWrite: false, opacity: ring ? .42 : .22, fog: false }); cloudMats.push(m);
    const s = new THREE.Sprite(m); s.position.set(Math.cos(a) * r, y, Math.sin(a) * r); const k = ring ? 16 + rnd() * 14 : 22 + rnd() * 18; s.scale.set(k, k * .45, 1); clouds.add(s);
  }

  // ---------- осадки ----------
  const RAIN = 2200, rainPos = new Float32Array(RAIN * 6), rainV = new Float32Array(RAIN);
  const reset = (i, top) => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 38, x = Math.cos(a) * r, z = Math.sin(a) * r, y = top ? 30 + Math.random() * 10 : GROUND + Math.random() * 40; rainPos.set([x, y, z, x - .05, y + .7, z], i * 6); rainV[i] = 26 + Math.random() * 12; };
  for (let i = 0; i < RAIN; i++) reset(i, false);
  const rainG = new THREE.BufferGeometry(); rainG.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: 0xd8d2c8, transparent: true, opacity: .32, depthWrite: false })); rain.visible = false; rain.frustumCulled = false; world.add(rain);
  const SNOW = 2600, snowPos = new Float32Array(SNOW * 3), snowPh = new Float32Array(SNOW);
  const resetS = (i, top) => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 40; snowPos.set([Math.cos(a) * r, top ? 32 + Math.random() * 6 : GROUND + Math.random() * 38, Math.sin(a) * r], i * 3); snowPh[i] = Math.random() * 6.283; };
  for (let i = 0; i < SNOW; i++) resetS(i, false);
  const snowG = new THREE.BufferGeometry(); snowG.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowG, new THREE.PointsMaterial({ map: dotTex, color: 0xffffff, size: .32, transparent: true, opacity: .9, depthWrite: false })); snow.visible = false; snow.frustumCulled = false; world.add(snow);
  let wx = { kind: 'clear', newyear: false };
  function applyWx() {
    const k = wx.kind, snowy = k === 'snow' || wx.newyear;
    rain.visible = k === 'rain'; snow.visible = k === 'snow';
    cityM.userData.uniforms.uSnow.value = snowy ? .85 : 0; ground.material.uniforms.uSnow.value = snowy ? .8 : 0;
    if (snowCaps) snowCaps.visible = snowy; if (garland) garland.visible = !!wx.newyear;
    relight();
  }

  // ---------- отель ----------
  let dim = null; // Set id номеров, которые фильтр гасит на фасаде
  let searchBeams = [], officeK = .6, bannerM = null, shopM = null, screenM = null; // днём окна гаснут, стекло отражает небо, вывески приглушены
  let snowCaps = null, garland = null, garlandBase = null, floors = [], hotel = [], sel = null, curRooms = [], built = '', topY = 0, camTargetY = 0, beacon = null, hl = null;
  // Здание как в игре. Объёмы в плане (x вправо, z к фасаду с вывеской):
  //   A — главная башня, на ней этажи отеля, вывеска и вертолётная площадка;
  //   B — объём за ней справа, ниже на два этажа: даёт уступ и внутренний угол со светодиодом;
  //   C — правая башня пониже, между A и C ниша с баннером над входом.
  // Офисные этажи каждого объёма слиты в одну геометрию: десятки этажей рисуются за один вызов.
  const VOL = { B: { x: 3.0, z: -.55, w: 2.9, d: 2.9, drop: 2 }, C: { x: 5.65, z: .05, w: 2.8, d: 2.9, k: .74 } };
  const volPts = (v, s = 1) => rect(v.x, v.z, v.w * s, v.d * s);
  const rect = (cx, cz, w, d) => [[cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2], [cx + w / 2, cz - d / 2], [cx - w / 2, cz - d / 2]];
  const setbackAt = () => 1;
  // видимая часть главной башни: от стыка с объёмом B по задней грани, левой, передней и кусок правой до стыка
  const hotelPath = () => { const w = W / 2, d = D / 2, bx = VOL.B.x - VOL.B.w / 2, bz = VOL.B.z + VOL.B.d / 2; return [[bx, -d], [-w, -d], [-w, d], [w, d], [w, bz]]; };
  let ledM = null, officeMats = [], venues = [], venueMeshes = [], poolWater = [], hoverV = null;
  function build(rooms) {
    root.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { o.geometry?.dispose?.(); const ms = [].concat(o.material || []); ms.forEach(mm => { mm.map?.dispose?.(); mm.emissiveMap?.dispose?.(); }); } }); root.clear(); floors = []; hotel = []; officeMats = [];
    const hF = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b), maxF = hF.at(-1) ?? 26;
    const n = Math.max(44, maxF + 12), podH = 3;
    topY = n * FH;
    const roofM0 = new THREE.MeshStandardMaterial({ color: 0x161b21, metalness: .3, roughness: .8 });
    const atlas = glassAtlas(), steel = new THREE.MeshStandardMaterial({ color: 0x2a323b, metalness: .85, roughness: .32 });
    const glassM = () => { const m = new THREE.MeshStandardMaterial({ map: atlas.glass, emissiveMap: atlas.lit, emissive: 0xffffff, emissiveIntensity: .9, metalness: .85, roughness: .09, envMapIntensity: 1.3 }); officeMats.push(m); return m; };
    // офисные этажи объёма: одна сетка, у каждого этажа свой ряд атласа
    const officeBlock = (pts, from, to, skip) => {
      const geos = [], slabs = [];
      for (let i = from; i < to; i++) { if (skip?.(i)) continue; geos.push(ringGeoAtlas(pts, FH * .86, i * FH, (i * 5 + (pts[0][0] * 3 | 0)) & 7)); slabs.push(slabRing(pts, i * FH + FH * .86, FH * .14)); }
      if (geos.length) root.add(new THREE.Mesh(mergeGeos(geos), glassM()), new THREE.Mesh(mergeGeos(slabs), steel));
    };
    // A: номера отеля — отдельные этажи с подсветкой по статусам, остальные в общей сетке
    for (let i = podH; i < n; i++) {
      const f = i + 1; if (!hF.includes(f)) continue;
      const m = new THREE.Mesh(ringGeo(hotelPath(), FH * .86, 0, true), emis(floorCanvas(rooms.filter(r => r.floor === f), 0, null, null, dim), 1)); m.position.y = i * FH; m.userData = { floor: f, hotel: true, s: 1 };
      root.add(m); floors.push(m); hotel.push(m);
      const sl = new THREE.Mesh(slabRing(outline(1), 0, FH * .14), steel); sl.position.y = i * FH + FH * .86; root.add(sl); m.userData.slab = sl;
    }
    officeBlock(outline(1), podH, n, i => hF.includes(i + 1) || venues.some(v => v.floor === i + 1 && v.floor > podH));
    // этажи площадок: свой свет и цвет, наведение и клик ведут на страницу площадки
    venueMeshes = [];
    const vf = new Map(venues.filter(v => v.floor > podH && v.floor <= n).map(v => [v.floor, v]));
    vf.forEach((v, f) => {
      const y = (f - 1) * FH, tex = venueCanvas(v), mat = emis(tex, 1);
      if (v.kind === 'pool') { // открытая терраса: стеклянное ядро, вода, ограждение и колонны
        const core = new THREE.Mesh(ringGeo(outline(.7), FH * .86), mat); core.position.y = y; root.add(core);
        const deck = new THREE.Mesh(slabRing(outline(1), y - .02, .06), steel); root.add(deck);
        const water = new THREE.Mesh(slabGeo(rect(0, D * .5 - .45, W * .86, .7), .03), new THREE.MeshStandardMaterial({ color: new THREE.Color(v.accent).lerp(new THREE.Color(0x2ad1c9), .6), emissive: new THREE.Color(v.accent).lerp(new THREE.Color(0x2ad1c9), .6), emissiveIntensity: .7, metalness: .2, roughness: .05, transparent: true, opacity: .9 }));
        water.position.y = y + .05; root.add(water); poolWater.push(water.material);
        const rail = new THREE.Mesh(ringGeo(outline(.998), FH * .28), new THREE.MeshStandardMaterial({ color: 0x9fd9e0, transparent: true, opacity: .22, roughness: .05, metalness: .3, side: THREE.DoubleSide, depthWrite: false })); rail.position.y = y; root.add(rail);
        outline(.985).forEach(([x, z]) => { const c = new THREE.Mesh(new THREE.BoxGeometry(.14, FH * .86, .14), steel); c.position.set(x, y + FH * .43, z); root.add(c); });
        const hit = new THREE.Mesh(ringGeo(outline(1), FH * .86), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.y = y; hit.userData = { venue: v, floor: f, light: mat }; root.add(hit); venueMeshes.push(hit);
      } else {
        const m = new THREE.Mesh(ringGeo(outline(1), FH * .86), mat); m.position.y = y; m.userData = { venue: v, floor: f, light: mat }; root.add(m); venueMeshes.push(m);
      }
      root.add(new THREE.Mesh(slabRing(outline(1.006), y + FH * .86, FH * .14), steel));
    });

    const nB = n - VOL.B.drop, nC = Math.round(n * VOL.C.k), topB = nB * FH, topC = nC * FH;
    officeBlock(volPts(VOL.B), podH, nB); officeBlock(volPts(VOL.C), podH, nC);

    // верхушка как в игре: две колонны с просветом и мост с вертолётной площадкой
    const crownN = 5, crownTop = topY + crownN * FH;
    const colL = rect(-W / 2 + 1, 0, 2, D), colR = rect(W / 2 - 1.1, 0, 1.8, D);
    officeBlock(colL, n, n + crownN); officeBlock(colR, n, n + crownN);
    const bridge = new THREE.Mesh(slabGeo(outline(1.01), .3), roofM0); bridge.position.y = crownTop; root.add(bridge);
    // пристройки у правой башни: L-корпус с вырезом и низкий каменный блок с витринами
    const E1 = rect(VOL.C.x + VOL.C.w / 2 + 1.7, -1, 3.4, 3.4), E2 = rect(VOL.C.x + VOL.C.w / 2 + 1.1, 2.1, 2.2, 2.8), nE = 14, stoneH = 5;
    officeBlock(E1, 0, nE); officeBlock(E2, 0, Math.round(nE * .6));
    const notch = new THREE.Mesh(new THREE.BoxGeometry(1.2, nE * FH * .45, .9), new THREE.MeshStandardMaterial({ color: 0x0e1318, roughness: .6 })); notch.position.set(E1[0][0] + .62, nE * FH * .5, E1[0][1] - .4); root.add(notch);
    const stoneTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#4a4045'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#332b2f'; g.fillRect(0, 60, 64, 4); g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(31, 0, 2, 60); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(10, stoneH); return t; })();
    const SB = rect(-W / 2 - 2.4, 1.2, 3.6, 3.2), sbM = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: .9, color: 0x9a8f96 });
    const sb = new THREE.Mesh(slabGeo(SB, stoneH * FH * 1.3), sbM); root.add(sb);
    const sbRoof = new THREE.Mesh(new THREE.BoxGeometry(1.2, .4, .9), roofM0); sbRoof.position.set(SB[0][0] + 1, stoneH * FH * 1.3 + .2, SB[0][1] - 1); root.add(sbRoof);
    const fins = [...finsFor(outline(1.004), podH * FH, topY), ...finsFor(volPts(VOL.B, 1.004), podH * FH, topB), ...finsFor(volPts(VOL.C, 1.004), podH * FH, topC), ...finsFor(rect(E1[0][0] + 1.7, -1, 3.4 * 1.004, 3.4 * 1.004), 0, nE * FH)];
    root.add(new THREE.Mesh(mergeGeos(fins), new THREE.MeshStandardMaterial({ color: 0x3b454f, metalness: .9, roughness: .3 })));
    // крыши: тёмный парапет с белым пунктиром по кромке, вертолётная площадка, техэтажи, антенна
    const roofM = roofM0;
    [[outline(1.012), topY], [volPts(VOL.B, 1.012), topB], [volPts(VOL.C, 1.012), topC], [rect(VOL.C.x + VOL.C.w / 2 + 1.7, -1, 3.45, 3.45), 14 * FH], [rect(VOL.C.x + VOL.C.w / 2 + 1.1, 2.1, 2.25, 2.85), Math.round(14 * .6) * FH]].forEach(([P, y]) => { const r = new THREE.Mesh(slabGeo(P, .26), roofM); r.position.y = y; root.add(r); });
    const dash = []; [[outline(1.014), topY + .25], [volPts(VOL.C, 1.014), topC + .25]].forEach(([P, y]) => { for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]); for (let u = 0; u < L; u += .3) { const t = u / L; dash.push(A[0] + (B[0] - A[0]) * t, y, A[1] + (B[1] - A[1]) * t); } } });
    const dashG = new THREE.BufferGeometry(); dashG.setAttribute('position', new THREE.Float32BufferAttribute(dash, 3));
    root.add(new THREE.Points(dashG, new THREE.PointsMaterial({ map: dotTex, color: 0xf3e6cc, size: .18, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    const padTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#9ea4aa'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill(); g.strokeStyle = '#3a4048'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.stroke(); g.fillStyle = '#3a4048'; g.font = '700 120px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 128, 134); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .08, 40), [new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: .7 }), new THREE.MeshStandardMaterial({ map: padTex, roughness: .7 }), new THREE.MeshStandardMaterial({ color: 0x6d737a })]);
    pad.position.set(-.3, crownTop + .62, .1); root.add(pad);
    const struts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.04, .04, .36, 6), steel, 6);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; M.compose(V.set(-.3 + Math.cos(a) * .9, crownTop + .42, .1 + Math.sin(a) * .9), Q.identity(), Sc.set(1, 1, 1)); struts.setMatrixAt(k, M); } root.add(struts);
    const mech = new THREE.Mesh(new THREE.BoxGeometry(1.3, .55, 1.1), roofM); mech.position.set(1.3, crownTop + .52, -.7); root.add(mech);
    const mastA = new THREE.Mesh(new THREE.CylinderGeometry(.03, .07, 2.6, 6), steel); mastA.position.set(1.6, crownTop + 1.6, -.9); root.add(mastA);
    const mechC = new THREE.Mesh(new THREE.BoxGeometry(1.2, .45, 1), roofM); mechC.position.set(VOL.C.x - .3, topC + .47, VOL.C.z - .4);
    if (KIT) { // детали отеля из Blender: техэтаж с жалюзи, градирни и гондола мойки фасада, вентиляция и бак на пристройках
      const add = (k, x, y, z, s = 1, ry = 0) => { const m = new THREE.Mesh(KIT[k], KIT.mat); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = ry; root.add(m); };
      add('louver', VOL.C.x - .3, topC + .25, VOL.C.z - .4);
      add('coolers', VOL.B.x + .2, topB + .25, VOL.B.z - .7); add('bmu', VOL.B.x, topB + .25, VOL.B.z + .55, 1, 0);
      add('hvac', E1[0][0] + 2.4, nE * FH + .25, E1[0][1] - 1.2, 1, Math.PI / 2); add('hvac', E1[0][0] + 1.2, nE * FH + .25, E1[0][1] - 2.4);
      add('tank', SB[0][0] + 2.6, stoneH * FH * 1.3, SB[0][1] - 2.2, 1.3); add('hvac', SB[0][0] + 1, stoneH * FH * 1.3, SB[0][1] - 2.4);
    } else root.add(mechC);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.02, .05, 1.5, 6), steel); mast.position.set(VOL.C.x + .9, topC + 1, VOL.C.z - .9); root.add(mast);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), neon(0xef5617)); beacon.position.set(VOL.C.x + .9, topC + 1.78, VOL.C.z - .9); root.add(beacon);
    // светодиодные ленты по рёбрам: пунктир, как в игре. Все ленты — одна сетка
    const ledEdges = [...outline(1.012).map(p => [p, topY + .25]), ...[0, 1, 2].map(i => [volPts(VOL.B, 1.012)[i + 1], topB + .25]), ...volPts(VOL.C, 1.012).map(p => [p, topC + .25])];
    root.add(new THREE.Mesh(mergeGeos(ledEdges.map(([[x, z], top]) => { const g = new THREE.BoxGeometry(.075, top - podH * FH, .075); g.translate(x, podH * FH + (top - podH * FH) / 2, z); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (top - podH * FH) / .3); return g; })), (ledM = new THREE.MeshBasicMaterial({ map: ledTex(), color: 0xb766ff, toneMapped: false }))));
    // вывеска главного фасада: белая подсвеченная антиква и верблюд
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 192; const sg = sc.getContext('2d'), st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const drawSign = img => { sg.clearRect(0, 0, 1024, 192); sg.shadowColor = 'rgba(255,236,205,.75)'; sg.shadowBlur = 10; sg.fillStyle = '#f6efe2'; sg.font = '400 92px "Times New Roman", Georgia, serif'; sg.textBaseline = 'middle'; sg.fillText('The Mile High Club', 214, 104); if (img) sg.drawImage(img, 22, 14, 176, 142); st.needsUpdate = true; kick(); };
    drawSign(null); { const im = new Image(); im.onload = () => drawSign(im); im.src = 'img/camel-mask.png'; }
    const signM = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, toneMapped: false, color: 0xe9e2d6 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, .75), signM); sign.position.set(-.1, topY - 1.15, D / 2 + .03); root.add(sign);
    // ниша между A и C: баннер отеля в тонах сайта, приглушённый, в стальной раме
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 768; const bx = bc.getContext('2d'), bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
    const drawBanner = img => { const gr = bx.createLinearGradient(0, 0, 0, 768); gr.addColorStop(0, '#1a0d10'); gr.addColorStop(.55, '#3b1119'); gr.addColorStop(1, '#59161e'); bx.fillStyle = gr; bx.fillRect(0, 0, 256, 768); bx.strokeStyle = 'rgba(247,181,10,.55)'; bx.lineWidth = 3; bx.strokeRect(14, 14, 228, 740);
      if (img) { bx.globalAlpha = .9; bx.drawImage(img, 48, 210, 160, 129); bx.globalAlpha = 1; }
      bx.fillStyle = '#e9dcc0'; bx.textAlign = 'center'; bx.font = '400 40px "Times New Roman", Georgia, serif'; bx.fillText('Mile High', 128, 420); bx.fillText('Club', 128, 462); bx.fillStyle = 'rgba(247,181,10,.8)'; bx.font = '600 15px Inter, sans-serif'; bx.fillText('ОТЕЛЬ НАД ЛОС-САНТОСОМ', 128, 520); bt.needsUpdate = true; kick(); };
    drawBanner(null); { const im = new Image(); im.onload = () => drawBanner(im); im.src = 'img/camel-mask.png'; }
    bannerM = new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: .45, roughness: .8 });
    const bW = 1.5, bH = 5.6, bX = (W / 2 + (VOL.C.x - VOL.C.w / 2)) / 2, bZ = VOL.B.z + VOL.B.d / 2 + .05, bY = podH * FH + 1.2 + bH / 2;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bW, bH), bannerM); banner.position.set(bX, bY, bZ); root.add(banner);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(bW + .12, bH + .12, .04), steel); frame.position.set(bX, bY, bZ - .03); root.add(frame);
    // подиум: светлый камень, витрины, изогнутый белый козырёк, табличка у входа
    const podM = new THREE.MeshStandardMaterial({ color: 0x3a3135, metalness: .05, roughness: .85 });
    const podPts = [[-W / 2 - .25, D / 2 + .2], [VOL.C.x + VOL.C.w / 2 + .2, D / 2 + .2], [VOL.C.x + VOL.C.w / 2 + .2, VOL.B.z - VOL.B.d / 2 - .2], [-W / 2 - .25, -D / 2 - .25]];
    const pod = new THREE.Mesh(slabGeo(podPts, podH * FH - .02), podM); root.add(pod);
    const shopTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 32); for (let i = 0; i < 32; i++) { g.fillStyle = i % 5 === 2 ? '#3a2a1c' : '#ffd9a0'; g.fillRect(i * 16 + 2, 4, 12, 24); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    shopTex.repeat.x = 6;
    shopM = new THREE.MeshBasicMaterial({ map: shopTex, transparent: true, opacity: .55, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const shop = new THREE.Mesh(ringGeo(podPts.map(([x, z]) => [x * 1.002, z * 1.002]), FH * 1.5), shopM); shop.position.y = .1; root.add(shop);
    const atrium = venues.find(v => v.floor <= podH); if (atrium) { shop.userData = { venue: atrium, floor: atrium.floor, light: shopM }; venueMeshes.push(shop); }
    // въезд в гараж под каменным блоком, как в игре: рама, тёмный проём, табло и пандус вниз
    const gx = SB[0][0] + 1.8, gz = SB[0][1] + .02, frameM = new THREE.MeshStandardMaterial({ color: 0x3a3336, roughness: .8 });
    [[-1, 0], [1, 0]].forEach(([s]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.25, .5), frameM); p.position.set(gx + s * .95, .62, gz + .2); root.add(p); });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.3, .4, .55), frameM); lintel.position.set(gx, 1.42, gz + .2); root.add(lintel);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), new THREE.MeshBasicMaterial({ color: 0x050607 })); hole.position.set(gx, .6, gz + .01); root.add(hole);
    const gs = document.createElement('canvas'); gs.width = 512; gs.height = 96; const gsx = gs.getContext('2d'); gsx.fillStyle = '#d9d2c4'; gsx.font = '400 54px "Times New Roman", Georgia, serif'; gsx.textAlign = 'center'; gsx.textBaseline = 'middle'; gsx.fillText('Garage', 256, 50);
    const gst = new THREE.CanvasTexture(gs); gst.colorSpace = THREE.SRGBColorSpace;
    const gsign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .3), new THREE.MeshBasicMaterial({ map: gst, transparent: true, color: 0xb8b0a2, toneMapped: false })); gsign.position.set(gx, 1.43, gz + .48); root.add(gsign);
    const lamps3 = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([gx - .4, 1.18, gz + .48, gx, 1.18, gz + .48, gx + .4, 1.18, gz + .48], 3)), new THREE.PointsMaterial({ map: dotTex, color: 0xffb04a, size: .3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); root.add(lamps3);
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.2), new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: .9 })); ramp.rotation.x = -Math.PI / 2 + .16; ramp.position.set(gx, -.1, gz + 1.25); root.add(ramp);
    const canopyShape = new THREE.Shape(); canopyShape.moveTo(-1.6, 0); canopyShape.quadraticCurveTo(0, 2.1, 1.6, 0); canopyShape.lineTo(-1.6, 0);
    const canopyG = new THREE.ExtrudeGeometry(canopyShape, { depth: .1, bevelEnabled: false }); canopyG.rotateX(Math.PI / 2);
    const canopy = new THREE.Mesh(canopyG, new THREE.MeshStandardMaterial({ color: 0x3a2d28, metalness: .7, roughness: .35 })); canopy.position.set(bX, FH * 2.2, D / 2 + .2); root.add(canopy);
    const plc = document.createElement('canvas'); plc.width = 512; plc.height = 80; const pg = plc.getContext('2d'); pg.fillStyle = '#d9d2c4'; pg.font = '400 52px "Times New Roman", Georgia, serif'; pg.textAlign = 'center'; pg.textBaseline = 'middle'; pg.fillText('Mile High Club', 256, 42);
    const plt = new THREE.CanvasTexture(plc); plt.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .34), new THREE.MeshBasicMaterial({ map: plt, transparent: true, toneMapped: false, color: 0xbdb5a6 })); plate.position.set(VOL.C.x - .3, FH * .9, D / 2 + .22); root.add(plate);
    // пальмы вдоль правого фасада
    const palmN = 6, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.04, .07, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 }), palmN);
    const frondG = new THREE.ConeGeometry(.55, .3, 7, 1, true); frondG.translate(0, -.15, 0);
    const fronds = new THREE.InstancedMesh(frondG, new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1, side: THREE.DoubleSide }), palmN);
    for (let k = 0; k < palmN; k++) { const x = VOL.C.x + VOL.C.w / 2 + .55, z = D / 2 + .3 - k * .55; M.compose(V.set(x, 1.3, z), Q.setFromEuler(new THREE.Euler(.03 * (k % 3 - 1), 0, .04 * (k % 2 ? 1 : -1))), Sc.set(1, 1, 1)); trunks.setMatrixAt(k, M); M.compose(V.set(x, 2.66, z), Q.setFromEuler(new THREE.Euler(0, k, 0)), Sc.set(1, 1, 1)); fronds.setMatrixAt(k, M); }
    root.add(trunks, fronds);
    // решётчатые пилоны-«песочные часы» с экранами
    const truss = [], scrPos = [];
    [[VOL.C.x - .6, D / 2 + 2.3], [VOL.C.x + 1.4, D / 2 + 1.9]].forEach(([px, pz]) => {
      const h = 3.4, b0 = .42, mid = .14, ring = (y, r, rot) => [0, 1, 2, 3].map(q => { const a = q / 4 * Math.PI * 2 + Math.PI / 4 + rot; return [px + Math.cos(a) * r, y, pz + Math.sin(a) * r]; });
      const levels = []; for (let s = 0; s <= 8; s++) { const y = s / 8 * h, t = Math.abs(y - h / 2) / (h / 2), r = mid + (b0 - mid) * t * t; levels.push(ring(y, r, (s % 2) * .35)); }
      levels.forEach((L, s) => L.forEach((p, q) => { truss.push(...p, ...L[(q + 1) % 4]); if (s) truss.push(...levels[s - 1][q], ...p, ...levels[s - 1][(q + 1) % 4], ...p); }));
      scrPos.push([px, 1.9, pz + .46]);
    });
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(truss, 3));
    root.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0x8a6a3e, transparent: true, opacity: .8 })));
    const sx = document.createElement('canvas'); sx.width = 256; sx.height = 128; const sxg = sx.getContext('2d'); const sgr = sxg.createLinearGradient(0, 0, 256, 128); sgr.addColorStop(0, '#2a0f17'); sgr.addColorStop(1, '#4a1424'); sxg.fillStyle = sgr; sxg.fillRect(0, 0, 256, 128); sxg.fillStyle = '#e9dcc0'; sxg.font = '400 46px "Times New Roman", Georgia, serif'; sxg.textAlign = 'center'; sxg.textBaseline = 'middle'; sxg.fillText('MHC', 128, 60); sxg.fillStyle = 'rgba(247,181,10,.8)'; sxg.fillRect(78, 92, 100, 2);
    const sxt = new THREE.CanvasTexture(sx); sxt.colorSpace = THREE.SRGBColorSpace;
    screenM = new THREE.MeshStandardMaterial({ map: sxt, emissiveMap: sxt, emissive: 0xffffff, emissiveIntensity: .5, roughness: .7, side: THREE.DoubleSide });
    scrPos.forEach(([x, y, z]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(.95, .48), screenM); p.position.set(x, y, z); root.add(p); });
    // площадь перед отелем: плитка в тон камня
    const tile = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#4a4744'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#56524e'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) g.fillRect(i * 32, j * 32, 32, 32); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 4); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(W + VOL.C.w + 8, 6), new THREE.MeshStandardMaterial({ map: tile, roughness: .95 })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(2.2, .01, D / 2 + 3); root.add(plaza);
    // подсветка выбранного этажа: тонкое неоновое кольцо
    hl = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline(1.07).map(([x, z]) => new THREE.Vector3(x, 0, z))), new THREE.LineBasicMaterial({ color: 0xf7b50a, toneMapped: false, transparent: true, opacity: 0 })); root.add(hl);
    // снег на крышах, подиуме и козырьке
    snowCaps = new THREE.Group(); snowCaps.visible = false; root.add(snowCaps);
    const snowM = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: .9, metalness: 0 });
    [[outline(1.005), topY + .26], [volPts(VOL.B, 1.005), topB + .26], [volPts(VOL.C, 1.005), topC + .26], [podPts, podH * FH - .02]].forEach(([P, y]) => { const c = new THREE.Mesh(slabGeo(P, .07), snowM); c.position.y = y; snowCaps.add(c); });
    // новогодние гирлянды по кромкам крыш и звезда на антенне
    garland = new THREE.Group(); garland.visible = false; root.add(garland);
    const gp = [], gc = [], PAL = [[1, .71, .04], [.94, .09, .48], [.98, .93, .78], [.94, .34, .09]];
    [[outline(1.04), topY + .3], [volPts(VOL.C, 1.04), topC + .3]].forEach(([P, y]) => { for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]), k = Math.max(3, Math.round(L / .22)); for (let q = 0; q < k; q++) { const u = q / k; gp.push(A[0] + (B[0] - A[0]) * u, y - Math.sin(u * Math.PI) * .22, A[1] + (B[1] - A[1]) * u); gc.push(...PAL[(gp.length / 3) % 4]); } } });
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    garlandBase = Float32Array.from(gc);
    garland.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: dotTex, vertexColors: true, size: .42, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffe7a0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); star.scale.set(1.4, 1.4, 1); star.position.set(VOL.C.x + .9, topC + 1.85, VOL.C.z - .9); garland.add(star);
    // подсветка фасада с крыши подиума: лучи вверх по стеклу, фиолетовые и золотые через один
    [[-1.7, 0xb766ff], [-.55, 0xffb45a], [.55, 0xb766ff], [1.7, 0xffb45a]].forEach(([x, c]) => { const b = new THREE.Mesh(beamGeo(.06, .75, 7.5), beamMat(c, .9, 1.4)); b.position.set(x, podH * FH, D / 2 + .3); b.rotation.x = -.09; root.add(b); });
    [[VOL.C.x - .8, 0xb766ff], [VOL.C.x + .8, 0xffb45a]].forEach(([x, c]) => { const b = new THREE.Mesh(beamGeo(.06, .6, 5.5), beamMat(c, .8, 1.4)); b.position.set(x, podH * FH, VOL.C.z + VOL.C.d / 2 + .3); b.rotation.x = -.09; root.add(b); });
    // два прожектора с крыши медленно обходят небо
    searchBeams = [[1.3, -.7, 0], [-1.6, .8, Math.PI]].map(([x, z, ph]) => { const piv = new THREE.Group(); piv.position.set(x, topY + 5 * FH + .8, z); piv.userData.ph = ph; const b = new THREE.Mesh(beamGeo(.07, 2.6, 70), beamMat(0xd6c2ff, .55, .9)); b.rotation.z = .42; piv.add(b); root.add(piv); return piv; });
    applyWx(); relight();
    root.position.y = GROUND; world.position.y = 0;
    if (BAKE.shadow) root.add(shadowM ??= contactShadow());
    built = JSON.stringify(rooms.map(r => [r.id, r.floor])) + venueKey();
  }
  const venueKey = () => JSON.stringify(venues.map(v => [v.id, v.floor, v.kind]));
  let hiRoom = null, hovRoom = null, rotTarget = null;
  function retexture(rooms, only) { hotel.forEach(m => { if (only != null && m.userData.floor !== only) return; const t = floorCanvas(rooms.filter(r => r.floor === m.userData.floor), 0, hiRoom, hovRoom, dim); m.material.map.dispose(); m.material.map = t; m.material.emissiveMap = t; m.material.needsUpdate = true; }); }
  // направление «лицом к номеру»: позиция номера по периметру этажа -> угол камеры
  function roomAngle(id) {
    const r = curRooms.find(x => x.id === id); if (!r) return null; const fr = curRooms.filter(x => x.floor === r.floor), i = fr.indexOf(r), n = fr.length;
    const P = hotelPath(), L = []; let tot = 0;
    for (let k = 0; k < P.length - 1; k++) { const a = P[k], b = P[(k + 1) % P.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(l); tot += l; }
    let u = (i + 0.5) / n * tot;
    for (let k = 0; k < P.length - 1; k++) { if (u <= L[k]) { const a = P[k], b = P[(k + 1) % P.length], t = u / L[k]; return Math.atan2(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); } u -= L[k]; }
    return null;
  }
  function focusRoom(id) { const prev = curRooms.find(x => x.id === hiRoom)?.floor; hiRoom = id; const f = curRooms.find(x => x.id === id)?.floor; if (prev != null && prev !== f) retexture(curRooms, prev); if (f != null) retexture(curRooms, f); if (id) { const a = roomAngle(id); if (a != null) { rotTarget = a; idle = 0; vel = 0; } } kick(); }
  function hoverRoom(id) { if (id === hovRoom) return; const prev = curRooms.find(x => x.id === hovRoom)?.floor; hovRoom = id; const f = curRooms.find(x => x.id === id)?.floor; if (prev != null && prev !== f) retexture(curRooms, prev); if (f != null) retexture(curRooms, f); kick(); }
  function update(rooms, floor) {
    const k = JSON.stringify(rooms.map(r => [r.id, r.floor])) + venueKey();
    if (k !== built) build(rooms); else if (rooms.map(r => r.status).join() !== curRooms.map(r => r.status).join()) retexture(rooms);
    curRooms = rooms; sel = floor;
    const fm = hotel.find(m => m.userData.floor === sel); camTargetY = fm ? fm.position.y + root.position.y : topY * .5;
    if (fm && hl) { hl.position.y = fm.position.y + FH * .42; hl.scale.setScalar(fm.userData.s); }
    kick();
  }

  // ---------- управление ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), el = renderer.domElement, tip = host.querySelector('.tip');
  let zk = 1, spun = 0, drag = null, rotY = 0.55, vel = 0, idle = 3, hover = null, pitch = 0, pitchT = 0;
  const pick = e => { const r = el.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam); const o = ray.intersectObjects([...hotel, ...venueMeshes], false)[0]?.object; return o ? (o.userData.venue ? { venue: o.userData.venue } : o.userData.floor) : null; };
  el.addEventListener('pointerdown', e => { rotTarget = null; drag = { x: e.clientX, y: e.clientY, rot: rotY, p: pitchT, moved: false, last: e.clientX }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; vel = (e.clientX - drag.last) * 0.005; spun += Math.abs(vel); if (spun > Math.PI * 6 && onSpin) { onSpin(); onSpin = null; } drag.last = e.clientX; rotY = drag.rot + dx * 0.005; if (e.pointerType !== 'touch') pitchT = Math.max(-1, Math.min(1, drag.p + dy * 0.004)); idle = 0; kick(); return; }
    const got = pick(e), v = got?.venue || null, f = v ? null : got;
    if (v !== hoverV) { hoverV = v; kick(); }
    if (f !== hover) { hover = f; onHoverFloor?.(f); kick(); }
    el.style.cursor = f !== null || v ? 'pointer' : 'grab';
    if (tip && v) { const r = host.getBoundingClientRect(); tip.textContent = `${v.floor > 4 ? v.floor + ' этаж · ' : ''}${v.name}${v.label ? ' · ' + v.label : ''}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1; }
    else if (tip) { if (f !== null) { const fr = curRooms.filter(r => r.floor === f), r = host.getBoundingClientRect(); tip.textContent = `${f} этаж · свободно ${fr.filter(x => x.status === 'free').length} из ${fr.length}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1; } else tip.style.opacity = 0; }
  });
  el.addEventListener('pointerup', e => { if (drag && !drag.moved) { const f = pick(e); if (f?.venue) onPickVenue?.(f.venue.id); else if (f !== null) onPick?.(f); } drag = null; });
  el.addEventListener('pointerleave', () => { if (hover !== null) onHoverFloor?.(null); hover = null; if (tip) tip.style.opacity = 0; });

  let active = false, visible = true, raf = 0, last = performance.now(), camY = 0, first = true, travelling = false, arriveAt = 0;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(host);
  function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); kick(); }
  new ResizeObserver(size).observe(host);
  function kick() { if (!raf && active && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  let odd = 0, prevT = 0, ftSum = 0, ftN = 0, lite = false;
  function liteCity() { lite = true; cityM.userData.uniforms.uHasFac.value = 0; roofKit.forEach(m => { m.visible = false; }); roofs.visible = true; }
  function loop(t) {
    raf = 0;
    const ft = t - prevT; prevT = t;
    // каждые ~2 с смотрим среднее время кадра: сначала снижаем чёткость, а если и на минимальной медленно —
    // облегчённый город (простые фасады, без кровельных деталей). Только вниз, без скачков туда-обратно
    if (ft > 0 && ft < 1500) { ftSum += ft; ftN++; if (ftSum > 2000 && ftN >= 8) { const avg = ftSum / ftN;
      if (avg > 26 && dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); size(); } else if (avg > 40 && !lite) liteCity();
      ftSum = ftN = 0; } }
    // в покое рисуем 30 кадров в секунду: машины и огни плывут так же плавно, а нагрузка на видеокарту вдвое ниже
    const calm = !drag && rotTarget == null && Math.abs(vel) < 1e-3 && Math.abs(camTargetY - camY) < .01 && !rain.visible && !snow.visible;
    if (calm && (odd ^= 1)) { if (active && visible) raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (!drag && rotTarget != null) { let d = rotTarget - rotY; d = Math.atan2(Math.sin(d), Math.cos(d)); rotY += d * Math.min(1, dt * 3); if (Math.abs(d) < 0.002) rotTarget = null; idle = 0; }
    else if (!drag) { rotY += vel; vel *= 0.92; idle += dt; if (idle > 6 && !hiRoom) rotY += dt * 0.05; }
    if (first) { camY = camTargetY; first = false; }
    camY += (camTargetY - camY) * Math.min(1, dt * 2.5); pitch += (pitchT - pitch) * Math.min(1, dt * 4);
    // камера по кругу вокруг башни; высота ограничена, чтобы горизонт всегда был закрыт городом, дымкой и холмами
    // переезд на дальний этаж: камера немного отъезжает, пока «кабина» в пути, и возвращается к прибытию;
    // когда камера доехала, выбранный этаж дважды вспыхивает
    const gap = Math.abs(camTargetY - camY), far = RM ? 0 : Math.min(1, gap / Math.max(1, topY * .3));
    if (gap > .3) travelling = true; else if (travelling && gap < .05) { travelling = false; if (!RM) arriveAt = t; }
    zk += ((hiRoom ? .72 : 1) + far * .22 - zk) * Math.min(1, dt * 2.5);
    const ap = arriveAt ? (t - arriveAt) / 1200 : 1, pulse = ap < 1 ? (1 - ap) * (.5 - .5 * Math.cos(ap * Math.PI * 4)) * 1.4 : 0; const dist = (cam.aspect < 0.8 ? 44 : cam.aspect < 1.2 ? 36 : 31) * zk, el2 = 0.1 + pitch * 0.18;
    cam.position.set(Math.sin(rotY) * dist * Math.cos(el2), camY + 2 + Math.sin(el2) * dist, Math.cos(rotY) * dist * Math.cos(el2)); cam.lookAt(0, camY + 1.2, 0);
    venueMeshes.forEach(m => { const L = m.userData.light, t2 = hoverV === m.userData.venue ? 1.9 : 1; if (L.emissiveIntensity != null) L.emissiveIntensity += (t2 - L.emissiveIntensity) * Math.min(1, dt * 8); else L.opacity += ((hoverV === m.userData.venue ? .95 : .55) - L.opacity) * Math.min(1, dt * 8); });
    poolWater.forEach(w => { w.emissiveIntensity = .55 + .15 * Math.sin(t / 700); });
    floors.forEach(m => { const on = m.userData.floor === sel, hv = m.userData.floor === hover; const target = on ? 1.6 + pulse : hv && m.userData.hotel ? 1.25 : m.userData.hotel ? (sel !== null ? 0.75 : 1) : officeK; m.material.emissiveIntensity += (target - m.material.emissiveIntensity) * Math.min(1, dt * 8); const sc = on ? 1.035 : 1; m.scale.x += (sc - m.scale.x) * Math.min(1, dt * 8); m.scale.z = m.scale.x; m.userData.slab?.scale.set(m.scale.x, 1, m.scale.x); });
    if (hl) hl.material.opacity += ((sel !== null ? .9 : 0) - hl.material.opacity) * Math.min(1, dt * 6);
    if (beacon) beacon.material.color.setHSL(0.05, .9, 0.42 + Math.max(0, Math.sin(t / 420)) * 0.18);
    beacons.material.opacity = .55 + .45 * Math.sin(t / 500);
    const s = t / 1000; cars.forEach((c, i) => { c.p += c.v * c.dir * dt; if (c.p > 63) c.p = -63; if (c.p < -63) c.p = 63; const x = c.axis ? c.line : c.p, z = c.axis ? c.p : c.line; carPos[i * 3] = x; carPos[i * 3 + 1] = GROUND + .12; carPos[i * 3 + 2] = z; }); carG.attributes.position.needsUpdate = true;
    clouds.rotation.y = s * 0.004; skyU.uTime.value = s; searchBeams.forEach(p => { p.rotation.y = s * .22 + p.userData.ph; });
    if (rain.visible) { for (let i = 0; i < RAIN; i++) { const o = i * 6, d = rainV[i] * dt; rainPos[o + 1] -= d; rainPos[o + 4] -= d; rainPos[o] -= d * .07; rainPos[o + 3] -= d * .07; if (rainPos[o + 1] < GROUND) reset(i, true); } rainG.attributes.position.needsUpdate = true; }
    if (snow.visible) { for (let i = 0; i < SNOW; i++) { const o = i * 3; snowPh[i] += dt; snowPos[o + 1] -= dt * (1.1 + (i % 7) * .12); snowPos[o] += Math.sin(snowPh[i]) * dt * .35; snowPos[o + 2] += Math.cos(snowPh[i] * .8) * dt * .25; if (snowPos[o + 1] < GROUND) resetS(i, true); } snowG.attributes.position.needsUpdate = true; }
    if (garland?.visible && garlandBase) { const ca = garland.children[0].geometry.attributes.color; for (let i = 0; i < ca.count; i++) { const k = .45 + .55 * Math.max(0, Math.sin(s * 2.2 + i * 1.7)); ca.array[i * 3] = garlandBase[i * 3] * k; ca.array[i * 3 + 1] = garlandBase[i * 3 + 1] * k; ca.array[i * 3 + 2] = garlandBase[i * 3 + 2] * k; } ca.needsUpdate = true; garland.children[1].material.opacity = .75 + .25 * Math.sin(s * 3); }
    renderer.render(scene, cam);
    if (active && visible) raf = requestAnimationFrame(loop);
  }
  // мягкая тень комплекса на земле, посчитанная в Blender от того же ключевого света: одна плоскость, без карт теней
  let shadowM = null;
  function contactShadow() {
    const t = new THREE.Texture(BAKE.shadow); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), new THREE.MeshBasicMaterial({ color: 0x07040a, alphaMap: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(3, .012, 0); m.renderOrder = -1; return m;
  }
  // когда запечённое пришло: отражения города, фасады, комнаты и тень
  // крыши города из набора: карниз по контуру каждого дома, на верхних ярусах — вентиляция, выходы, баки на старых
  // невысоких домах, короны ар-деко и мачты на высоких, градирни на складах. По одному InstancedMesh на деталь.
  const roofKit = [];
  function cityRoofs(K) {
    let s = 97; const r = () => (s = s * 16807 % 2147483647) / 2147483647, P = {}, put = (k, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => (P[k] ??= []).push([x, y, z, sx, sy, sz, ry]);
    tiers.forEach((t, i) => {
      // дальше ~45 ед. всё тонет в дымке — там детали не ставим, это сотни тысяч вершин впустую
      const y = GROUND + t.h, dist = Math.hypot(t.x, t.z), top = !tiers.some((u, j) => j > i && u.x === t.x && u.z === t.z && u.h > t.h);
      if (dist > (t.h > 8 ? 58 : 44)) return;
      put('cornice', t.x, y, t.z, t.w, t.h > 8 ? 1.4 : 1, t.d);
      if (!top) return;
      const ox = () => (r() - .5) * t.w * .55, oz = () => (r() - .5) * t.d * .55, ry = () => (r() * 4 | 0) * Math.PI / 2;
      if (t.x > 12) { put('coolers', t.x + ox() * .5, y, t.z + oz() * .5, 1, 1, 1, ry()); return; }
      if (t.h > 10 && r() < .55) put('crown', t.x, y, t.z, Math.min(t.w, t.d) * .95, Math.min(t.w, t.d) * 1.1, Math.min(t.w, t.d) * .95);
      else if (t.h > 7 && r() < .5) put('mast', t.x + ox() * .4, y, t.z + oz() * .4);
      if (t.h < 4.5 && dist < 34 && r() < .45) put('tank', t.x + ox(), y, t.z + oz(), 1.2, 1.2, 1.2);
      const nH = dist < 30 ? 1 + (r() < .5) : r() < .6 ? 1 : 0; for (let k = 0; k < nH; k++) put('hvac', t.x + ox(), y, t.z + oz(), 1, 1, 1, ry());
      if (dist < 34 && r() < .5) put('bulkhead', t.x + ox(), y, t.z + oz(), 1, 1, 1, ry());
    });
    const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), V4 = new THREE.Vector3(), S4 = new THREE.Vector3(), E4 = new THREE.Euler();
    Object.entries(P).forEach(([k, list]) => { if (!K[k]) return; const im = new THREE.InstancedMesh(K[k], K.mat, list.length);
      list.forEach(([x, y, z, sx, sy, sz, ry], i) => { M4.compose(V4.set(x, y, z), Q4.setFromEuler(E4.set(0, ry, 0)), S4.set(sx, sy, sz)); im.setMatrixAt(i, M4); });
      im.computeBoundingSphere(); world.add(im); roofKit.push(im); });
    roofs.visible = false; if (lite) liteCity();
  }
  Promise.all([loadBake(), loadKit()]).then(([, K]) => { // текстуры и модели параллельно — башня пересобирается один раз
    if (K) cityRoofs(K);
    const eq = img => { const t = new THREE.Texture(img); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; const r = pm.fromEquirectangular(t).texture; t.dispose(); return r; };
    if (BAKE['env-night']) { const night = eq(BAKE['env-night']); envBake = { night, day: BAKE['env-day'] ? eq(BAKE['env-day']) : envRoom }; }
    if (BAKE['city-fac']) { const t = new THREE.Texture(BAKE['city-fac']); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.needsUpdate = true; cityM.userData.uniforms.uFac.value = t; cityM.userData.uniforms.uHasFac.value = lite ? 0 : 1; }
    // стеклянные ориентиры города получают тот же фасад
    const gi = cityAtlas.glass.image, li = cityAtlas.lit.image; paintBake(gi.getContext('2d'), li.getContext('2d'));
    world.traverse(o => [].concat(o.material || []).forEach(m => [m.map, m.emissiveMap].forEach(t => { if (t && (t.image === gi || t.image === li)) t.needsUpdate = true; })));
    if (curRooms.length) { build(curRooms); update(curRooms, sel); } else relight();
  });
  function relight() {
    const day = document.documentElement.dataset.mode === 'day' ? 1 : 0;
    skyU.uDay.value = day; ground.material.uniforms.uDay.value = day; cityM.userData.uniforms.uDay.value = day; cityM.userData.uniforms.uLit.value = day ? .12 : .42;
    fogCol.set(day ? 0xd9c49a : 0x1d1430); skyU.uFog.value.copy(fogCol); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); scene.fog.density = (day ? .012 : .016) * ({ fog: 2.3, rain: 1.45, snow: 1.6 }[wx?.kind] || 1);
    if (wx?.kind === 'rain' || wx?.kind === 'fog') { fogCol.lerp(new THREE.Color(day ? 0x9a948c : 0x2e2427), .55); skyU.uFog.value.copy(fogCol); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); }
    if (wx?.kind === 'snow') { fogCol.lerp(new THREE.Color(day ? 0xe6e1d8 : 0x463a3d), .5); skyU.uFog.value.copy(fogCol); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); }
    rain.material.color.set(day ? 0x8f8a84 : 0xd8d2c8);
    const cityEnv = envBake ? (day ? envBake.day : envBake.night) : null;
    world.traverse(o => { if (o.isMesh || o.isInstancedMesh) [].concat(o.material).forEach(m => { if (m?.isMeshStandardMaterial) { m.userData.env0 ??= m.envMapIntensity; m.envMapIntensity = m.userData.env0 * (day ? 1 : .25); } }); });
    hemi.intensity = day ? 1.6 : .42; hemi.color.set(day ? 0xf2e2c8 : 0x6a58b0); hemi.groundColor.set(day ? 0x1a120a : 0x120a10); key.intensity = day ? 2.8 : .75; cityM.roughness = day ? .55 : .9; cityM.metalness = day ? .35 : .1; stone.roughness = day ? .6 : .9; key.color.set(day ? 0xfff0d8 : 0xaab6ff); if (!day) key.position.copy(MOON).multiplyScalar(30);
    cityM.color.set(day ? 0x6a5f5c : 0x1f1517); hills.material.color.set(day ? 0x6a5a52 : 0x0c0814);
    cloudMats.forEach(m => m.color.set(day ? 0xfff3dc : 0x4a3460)); lamps.visible = carPts.visible = true; lamps.material.opacity = day ? .25 : 1; carPts.material.opacity = day ? .4 : 1;
    rim.intensity = day ? 6 : 34; officeK = day ? .16 : .6; ledM?.color.set(day ? 0x39c6e6 : 0xb766ff); if (crownLit) crownLit.material.emissiveIntensity = day ? 0 : 1.1; landmarkMats.forEach(m => { m.emissiveIntensity = day ? .04 : .85; m.color.set(day ? 0xffffff : 0x353b4a); }); if (shadowM) shadowM.material.opacity = day ? .62 : .38; KIT?.mat.color.set(day ? 0xffffff : 0x5a5560); officeMats.forEach(m => { m.emissiveIntensity = day ? .04 : .9; m.color.set(day ? 0xffffff : 0x4a5562); m.metalness = day ? .45 : .85; m.envMapIntensity = day ? 1.6 : cityEnv ? 1.2 : .5; if (m.envMap !== cityEnv) { m.envMap = cityEnv; m.needsUpdate = true; } }); hotel.forEach(f => { if (f.material.envMap !== cityEnv) { f.material.envMap = cityEnv; f.material.needsUpdate = true; } }); if (bannerM) bannerM.emissiveIntensity = day ? .1 : .42; if (shopM) shopM.opacity = day ? .12 : .55; if (screenM) screenM.emissiveIntensity = day ? .12 : .45; kick();
  }
  relight(); size();
  function setVenues(list) { const before = venueKey(); venues = list || []; if (venueKey() !== before && curRooms.length) { build(curRooms); update(curRooms, sel); } else venueMeshes.forEach(m => { const nv = venues.find(x => x.id === m.userData.venue.id); if (nv) m.userData.venue = nv; }); kick(); }
  return { setVenues, setWeather(w) { if (!w || (w.kind === wx.kind && w.newyear === wx.newyear)) return; wx = { kind: w.kind, newyear: w.newyear }; applyWx(); }, update, focusRoom, hoverRoom, setFilter(ids) { const next = ids ? new Set(curRooms.filter(r => !ids.has(r.id)).map(r => r.id)) : null; if (String([...(next || [])]) === String([...(dim || [])])) return; dim = next; retexture(curRooms); kick(); }, hoverFloor(f) { if (f !== hover) { hover = f; kick(); } }, active(on) { active = on; if (on) { size(); kick(); } }, relight };
}
