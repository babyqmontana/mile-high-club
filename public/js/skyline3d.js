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
// этаж площадки: тёплый интерьер за стеклом и полоса фирменного цвета
function venueCanvas(v) {
  const c = document.createElement('canvas'); c.width = 4096; c.height = 128; const g = c.getContext('2d'), cw = 4096 / COLS; let q = 11 + String(v.id).length * 7; const r = () => (q = q * 16807 % 2147483647) / 2147483647;
  const acc = new THREE.Color(v.accent || '#f7b50a'), warm = v.kind === 'pool' ? '#e9b878' : v.kind === 'club' ? '#d9a35a' : '#f0c47a';
  g.fillStyle = '#0b0a0d'; g.fillRect(0, 0, 4096, 128);
  for (let i = 0; i < COLS; i++) {
    const x = i * cw + 5, w = cw - 10, k = .5 + r() * .5, wall = new THREE.Color(warm).multiplyScalar(k * .72).lerp(acc, .1 + r() * .14);
    // комната за стеклом: потолок светлее, низ темнее, стены уходят вглубь
    const gr = g.createLinearGradient(0, 12, 0, 116); gr.addColorStop(0, '#' + wall.clone().multiplyScalar(1.25).getHexString()); gr.addColorStop(.55, '#' + wall.getHexString()); gr.addColorStop(1, '#' + wall.clone().multiplyScalar(.34).getHexString()); g.fillStyle = gr; g.fillRect(x, 12, w, 104);
    const sd = g.createLinearGradient(x, 0, x + w, 0); sd.addColorStop(0, 'rgba(0,0,0,.5)'); sd.addColorStop(.22, 'rgba(0,0,0,0)'); sd.addColorStop(.8, 'rgba(0,0,0,0)'); sd.addColorStop(1, 'rgba(0,0,0,.42)'); g.fillStyle = sd; g.fillRect(x, 12, w, 104);
    g.fillStyle = 'rgba(255,240,214,.9)'; g.fillRect(x + w * .3, 16, w * .4, 3);                                            // светильник
    g.fillStyle = 'rgba(14,10,18,.82)'; const f = r(), bx = x + w * (.15 + r() * .45);
    if (f < .3) { g.beginPath(); g.arc(bx, 74, 5, 0, 7); g.fill(); g.fillRect(bx - 5, 79, 10, 22); g.fillRect(bx - 4, 100, 3, 16); g.fillRect(bx + 1, 100, 3, 16); }   // гость
    else if (f < .55) { g.fillRect(bx - 2, 84, 4, 32); for (let a = 0; a < 5; a++) { g.beginPath(); g.ellipse(bx + Math.cos(a * 1.2 - 2.6) * 12, 80 + Math.sin(a * 1.2 - 2.6) * 11, 10, 3.2, a * 1.2 - 2.6, 0, 7); g.fill(); } }                       // пальма в кадке
    else if (f < .8) { g.fillRect(bx - 18, 98, 44, 7); g.fillRect(bx - 16, 105, 4, 11); g.fillRect(bx + 18, 105, 4, 11); g.fillRect(bx - 20, 86, 6, 14); }                       // диван
    else { g.fillRect(bx, 40, 3, 40); g.fillStyle = '#ffe2ad'; g.beginPath(); g.moveTo(bx - 9, 92); g.lineTo(bx + 12, 92); g.lineTo(bx + 7, 78); g.lineTo(bx - 4, 78); g.fill(); }  // лампа
    if (r() < .3) { g.fillStyle = 'rgba(20,14,26,.55)'; const cu = w * (.18 + r() * .2); g.fillRect(x, 12, cu, 104); g.fillStyle = 'rgba(255,255,255,.05)'; for (let z = 0; z < cu; z += 6) g.fillRect(x + z, 12, 2, 104); } // штора
    g.fillStyle = 'rgba(160,190,255,.07)'; g.beginPath(); g.moveTo(x + w * .55, 12); g.lineTo(x + w * .8, 12); g.lineTo(x + w * .45, 116); g.lineTo(x + w * .2, 116); g.fill();      // отражение в стекле
    g.fillStyle = '#12161d'; g.fillRect(x - 5, 0, 5, 128); g.fillRect(x + w, 0, 5, 128); g.fillRect(x + w / 2 - 1, 34, 2, 82); g.fillRect(x, 32, w, 3);                              // рамы
  }
  g.fillStyle = '#' + acc.getHexString(); g.fillRect(0, 118, 4096, 5); g.fillStyle = '#12161d'; g.fillRect(0, 0, 4096, 12); g.fillRect(0, 123, 4096, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// план города: сетка кварталов по 7, дороги по линиям 3.5 + 7k. Отель занимает свой большой квартал, ориентиры — по целому кварталу,
// эстакада — кривая, под которой домов нет. Ничто не стоит на дороге
const GY = -0.6, SUPER = { x0: -10.5, x1: 10.5, z0: -3.5, z1: 10.5 }, LANDMARKS = [[14, -14], [14, -7], [-14, -14], [-14, 7]];
const reserved = (x, z) => (x > SUPER.x0 && x < SUPER.x1 && z > SUPER.z0 && z < SUPER.z1) || LANDMARKS.some(([lx, lz]) => Math.abs(x - lx) < 1 && Math.abs(z - lz) < 1);
const FREEWAY = new THREE.CatmullRomCurve3([[-84, 34], [-52, 27], [-30, 20], [-8, 18.6], [10, 20], [21, 14.5], [24.6, 3], [22.8, -9], [26, -23], [40, -36], [66, -46], [92, -52]].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal').getSpacedPoints(420);
const nearFreeway = (x, z, r) => FREEWAY.some(p => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r);
// путь по сторонам прямоугольника дорог со скруглёнными углами; off — полоса (наружу +, внутрь −), dir — направление
function loopPath(x0, x1, z0, z1, off, dir) {
  x0 -= off; x1 += off; z0 -= off; z1 += off; const r = .75 + Math.max(0, off) * .9, out = [], corner = (cx, cz, a) => { for (let k = 0; k <= 8; k++) { const t = a + k / 8 * Math.PI / 2; out.push(new THREE.Vector3(cx + Math.cos(t) * r, 0, cz + Math.sin(t) * r)); } };
  corner(x1 - r, z1 - r, 0); corner(x0 + r, z1 - r, Math.PI / 2); corner(x0 + r, z0 + r, Math.PI); corner(x1 - r, z0 + r, Math.PI * 1.5);
  const full = []; out.forEach((a, i) => { const b = out[(i + 1) % out.length], n = Math.max(1, Math.ceil(a.distanceTo(b) / 1.2)); for (let k = 0; k < n; k++) full.push(a.clone().lerp(b, k / n)); });
  if (dir < 0) full.reverse(); full.push(full[0].clone()); return full;
}
// лента вдоль пути. tau — время в пути: на прямой машина разгоняется, перед крутым поворотом заранее тормозит
function ribbon(path, width, y, vmax, grip, loop, side = 0) {
  const n = path.length, seg = [], v = [], tan = [];
  for (let i = 0; i < n; i++) { const a = path[i - 1] || (loop ? path[n - 2] : path[0]), b = path[i + 1] || (loop ? path[1] : path[n - 1]); tan.push(b.clone().sub(a).normalize()); seg.push(i ? path[i].distanceTo(path[i - 1]) : 0); }
  for (let i = 0; i < n; i++) { const a = tan[i - 1] || (loop ? tan[n - 2] : tan[0]), b = tan[i + 1] || (loop ? tan[1] : tan[n - 1]), ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))), L = (seg[i] || .5) + (seg[i + 1] || .5); v.push(Math.min(vmax, Math.sqrt(grip * L / Math.max(1e-3, ang)))); }
  for (let pass = 0; pass < (loop ? 2 : 1); pass++) { // не больше разумного разгона и торможения
    for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * grip * .7 * seg[i])); if (loop) v[0] = Math.min(v[0], v[n - 1]);
    for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * grip * 1.1 * seg[i + 1])); if (loop) v[n - 1] = Math.min(v[n - 1], v[0]);
  }
  const pos = [], uv = [], tau = [], idx = []; let T = 0, len = 0;
  for (let i = 0; i < n; i++) { if (i) { T += seg[i] * 2 / (v[i] + v[i - 1]); len += seg[i]; } const nx = -tan[i].z, nz = tan[i].x, c = path[i];
    for (const k of [-1, 1]) { pos.push(c.x + nx * (side + k * width / 2), y, c.z + nz * (side + k * width / 2)); uv.push(k, len); tau.push(T); }
    if (i) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); } }
  return { pos, uv, tau, idx, T };
}
// все полосы — одна сетка: шлейфы рисует видеокарта, процессор не двигает ни одной машины
function trafficMesh(list) {
  const pos = [], uv = [], tau = [], info = [], idx = [];
  list.forEach((r, k) => { const o = pos.length / 3, P = r.T / Math.max(1, Math.round(r.T / r.gap)); pos.push(...r.pos); for (let i = 0; i < r.tau.length; i++) { uv.push(r.uv[i * 2]); tau.push(r.tau[i]); info.push(P, k * 13.7 % 97, r.red ? 1 : 0, Math.round(r.T / P)); } r.idx.forEach(i => idx.push(i + o)); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aU', new THREE.Float32BufferAttribute(uv, 1)); g.setAttribute('aTau', new THREE.Float32BufferAttribute(tau, 1)); g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4)); g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, uniforms: { uT: { value: 0 }, uK: { value: 1 }, uFogD: { value: .0135 } },
    vertexShader: 'attribute float aU,aTau;attribute vec4 aInfo;varying float vU,vTau,vD;flat varying vec4 vI;void main(){vU=aU;vTau=aTau;vI=aInfo;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader: `uniform float uT,uK,uFogD;varying float vU,vTau,vD;flat varying vec4 vI;
      float h(float n){return fract(sin(n*12.9898+vI.y)*43758.5453);}
      void main(){ float x=(vTau-uT)/vI.x, id=mod(floor(x),vI.w), f=fract(x); // x бежит вместе с машиной, поэтому на поворотах шлейф короче и медленнее
        float on=step(h(id+1.),.72), head=.45+.5*h(id+7.), b=(head-f)*vI.x;
        float tail=b>0.?exp(-b*mix(1.7,2.4,vI.z)):0.; float nose=smoothstep(.14,0.,abs(b));
        float core=exp(-vU*vU*26.), pool=exp(-vU*vU*4.5)*(1.-vU*vU);
        vec3 c=mix(vec3(1.,.83,.56),vec3(1.,.1,.2),vI.z), hc=mix(vec3(1.,.97,.9),vec3(1.,.3,.3),vI.z);
        float a=on*uK*exp(-vD*vD*uFogD*uFogD);
        gl_FragColor=vec4((c*(tail*core*2.6+tail*pool*.75)+hc*nose*(core*3.2+pool*1.1))*a,1.); }` });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}
// дома между камерой и отелем плавно опускаются ниже линии взгляда, чтобы отель был виден с любой стороны
const SINK = { uCamP: { value: new THREE.Vector3(0, 20, 43) } };
const SINK_GLSL = `uniform vec3 uCamP;
float sinkTop(vec2 c,float h){vec2 o=vec2(1.6,0.)-uCamP.xz;float L=length(o);vec2 n=o/L,r=c-uCamP.xz;float t=dot(r,n)/L,q=abs(r.x*n.y-r.y*n.x);
  float k=smoothstep(19.,12.,q)*smoothstep(1.,.9,t);float lim=max(.55,uCamP.y*(1.-clamp(t,0.,1.))*.62-.6);return mix(h,min(h,lim),k);}\n`;
function sinkJs(x, z, h) { const c = SINK.uCamP.value, ox = 1.6 - c.x, oz = -c.z, L = Math.hypot(ox, oz), nx = ox / L, nz = oz / L, rx = x - c.x, rz = z - c.z, t = (rx * nx + rz * nz) / L, q = Math.abs(rx * nz - rz * nx), ss = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  const k = ss(19, 12, q) * ss(1, .9, t), lim = Math.max(.55, c.y * (1 - Math.max(0, Math.min(1, t))) * .62 - .6); return h + (Math.min(h, lim) - h) * k; }
// то же для деталей на крышах и красных огней: едут вниз вместе с крышей
function sinkTops(mat, inst) { mat.onBeforeCompile = sh => { sh.uniforms.uCamP = SINK.uCamP; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SINK_GLSL).replace('#include <begin_vertex>', inst
  ? '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat tp=instanceMatrix[3].y-(' + GY.toFixed(2) + ');transformed.y+=(sinkTop(instanceMatrix[3].xz,tp)-tp)/length(instanceMatrix[1].xyz);\n#endif'
  : '#include <begin_vertex>\nfloat tp=position.y-(' + GY.toFixed(2) + ');transformed.y+=sinkTop(position.xz,tp)-tp;'); }; return mat; }
// вода бассейнов и фонтана: солнечная сетка на дне, светлые борта, отражение ночного неба. Без прозрачности и текстур
const WATER_T = { value: 0 };
function waterMat(color, hx, hz, round = 0, glow = 1) {
  const c = new THREE.Color(color).convertLinearToSRGB();
  return new THREE.ShaderMaterial({ uniforms: { uT: WATER_T, uC: { value: new THREE.Vector3(c.r, c.g, c.b) }, uH: { value: new THREE.Vector3(hx, hz, round) }, uG: { value: glow } },
    vertexShader: 'varying vec2 p;varying vec3 v;void main(){p=position.xz;vec4 w=modelMatrix*vec4(position,1.);v=w.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `uniform float uT,uG;uniform vec3 uC,uH;varying vec2 p;varying vec3 v;
      void main(){vec2 q=p*9.,r=q;float k=0.;for(int i=0;i<3;i++){float f=float(i);r=q+vec2(cos(uT*.8-r.x+f*2.1)+sin(uT*.6+r.y),sin(uT*.7-r.y)+cos(uT*.9+r.x+f));k+=1./(.35+abs(sin(r.x)+cos(r.y)));}
        float det=clamp(1.35-fwidth(q.x)*.55-fwidth(q.y)*.55,0.,1.),ca=mix(.32,pow(clamp(k/6.2,0.,1.),2.),det);   // издалека сетка сливается в ровный тон, без ряби
        float e=uH.z>.5?uH.x-length(p):min(uH.x-abs(p.x),uH.y-abs(p.y));float rim=exp(-max(e,0.)*9.);
        float fr=pow(1.-clamp(-normalize(v).y,0.,1.),3.);
        vec3 c=uC*(.3+.42*ca)+vec3(.55,.95,1.)*ca*ca*.34+uC*rim*.5;
        c=mix(c,vec3(.26,.17,.4)+uC*.22,fr*.5);gl_FragColor=vec4(c*uG,1.);}` });
}
// светодиодная лента: короткие яркие сегменты с зазорами
function ledTex() { const c = document.createElement('canvas'); c.width = 4; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#2a0b3d'; g.fillRect(0, 0, 4, 32); g.fillStyle = '#ffffff'; g.fillRect(0, 4, 4, 22); const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t; }

// --- запечённое в Blender (Cycles): панорамы города для отражений, фасад офисов, интерьер номера, тень от комплекса.
// ~85 КБ webp, грузятся после первого кадра; пока не пришли или не загрузились — башня рисуется как раньше.
const BAKE = {}, BAKE_URL = 'img/tower/', BAKE_V = '?v=10'; // ?v — сброс кэша браузера при обновлении ассетов
// кровельный набор из Blender (баки, вентиляция, мачты, карнизы, короны, градирни, техэтаж, гондола мойки фасада)
let KIT = null;
function loadKit() {
  return pKit ??= import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader().loadAsync(BAKE_URL + 'kit.glb' + BAKE_V)).then(g => {
    const out = {}; g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if (o.isMesh) { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingSphere(); out[o.name] = geo; } });
    out.mat = sinkTops(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .15 }), true); KIT = out; return out;
  }).catch(() => null);
}
// отель целиком: подиум с площадью, крыши, вертолётная площадка, буквы вывески — свет запечён (brand/tower/kit.py)
let HOTEL = null;
function loadHotel() {
  return pHotel ??= import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader().loadAsync(BAKE_URL + 'hotel.glb' + BAKE_V)).then(g => {
    const out = {}; g.scene.traverse(o => { if (!o.isMesh) return; const map = o.material.map; if (map) map.anisotropy = 8;
      out[o.name] = { geo: o.geometry, mat: new THREE.MeshBasicMaterial({ map: map || null, color: map ? 0xffffff : 0xfff3df, toneMapped: false, side: THREE.DoubleSide }) }; });
    HOTEL = out; return out;
  }).catch(e => { console.warn('hotel', e); return null; });
}
// фасад башни: один набор текстур на все объёмы, создаётся один раз
let FACADE = null;
function facadeTex() {
  if (!BAKE['fac-glass'] || !BAKE['fac-lit']) return null;
  if (FACADE) return FACADE;
  const tex = im => { const t = new THREE.Texture(im); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 16; t.needsUpdate = true; return t; };
  return (FACADE = { glass: tex(BAKE['fac-glass']), lit: tex(BAKE['fac-lit']) });
}
// мягкое пятно света для ореолов
function softTex(k = 2) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), d = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const u = Math.abs(x / 31.5 - 1), v = Math.abs(y / 31.5 - 1), a = 255 * Math.pow(Math.max(0, 1 - u * u), k) * Math.pow(Math.max(0, 1 - v * v), k); d.data.set([a, a, a, 255], (y * 64 + x) * 4); }
  g.putImageData(d, 0, 0); return new THREE.CanvasTexture(c);
}
function loadBake() {
  return pBake ??= Promise.all(['env-night', 'fac-glass', 'fac-lit', 'room', 'shadow', 'city-fac'].concat(document.documentElement.dataset.mode === 'day' ? ['env-day'] : []).map(n => new Promise(ok => {
    const i = new Image(); i.decoding = 'async'; i.onload = () => { const done = () => { BAKE[n] = i; ok(); }; i.decode ? i.decode().then(done, done) : done(); }; i.onerror = () => ok(); i.src = BAKE_URL + n + '.webp' + BAKE_V;
  })));
}

// --- окна этажа: для этажей отеля — по номерам, для остальных — офисные ---
let seedN = 1; const rnd = () => (seedN = seedN * 16807 % 2147483647) / 2147483647;
function floorCanvas(rooms, mode, hi = null, hov = null, dim = null, reuse = null) { // dim — номера, не прошедшие фильтр: окна гаснут
  const c = reuse?.image || document.createElement('canvas'); if (!reuse) { c.width = 4096; c.height = 128; } const g = c.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
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
    const pure = col; if (rooms && BAKE.room) col = '#' + new THREE.Color(col).lerp(new THREE.Color('#ffe6c2'), .32).getHexString();
    g.globalAlpha = a; const gr = g.createLinearGradient(0, 8, 0, 56); gr.addColorStop(0, col); gr.addColorStop(1, shade(col, -0.22));
    g.fillStyle = gr; g.fillRect(i * cw + 5, 8, cw - 11, 48);
    if (rooms && BAKE.room) { // комната из Blender: шторы, торшеры, кровать — умножается на цвет статуса
      const n = Math.max(1, rooms.length), ri = Math.floor(i / COLS * n), a0 = Math.ceil(ri * COLS / n), a1 = Math.floor((ri + 1) * COLS / n) - 1;
      const v = a0 === a1 ? 1 : i === a0 ? 0 : i === a1 ? 2 : 1;
      g.globalCompositeOperation = 'multiply'; g.drawImage(BAKE.room, v * 128 + 6, 6, 116, 231, i * cw + 5, 8, cw - 11, 48); g.globalCompositeOperation = 'source-over';
    }
    if (rooms) { g.fillStyle = pure; g.fillRect(i * cw + 5, 52, cw - 11, 4); }
    g.globalAlpha = 1;
    g.fillStyle = '#2c3540'; g.fillRect(i * cw, 0, 2, 64); // стальной импост
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(i * cw + 3, 8, (cw - 8) * 0.35, 48);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * cw + 3, 30, cw - 8, 1.5); // импост
  }
  g.fillStyle = '#141b22'; g.fillRect(0, 0, 2048, 6); g.fillRect(0, 58, 2048, 6);
  if (reuse) { reuse.needsUpdate = true; return reuse; }
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
    Object.assign(sh.uniforms, m.userData.uniforms, SINK);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;varying vec3 vN;flat varying float vId;\n' + SINK_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat bh=length(instanceMatrix[1].xyz);transformed.y*=sinkTop(instanceMatrix[3].xz,bh)/bh;vec4 wp4=instanceMatrix*vec4(transformed,1.);vWp=wp4.xyz;vN=normalize(mat3(instanceMatrix)*normal);vId=float(gl_InstanceID);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit,uDay,uSnow,uHasFac;uniform sampler2D uFac;varying vec3 vWp;varying vec3 vN;flat varying float vId;\nfloat h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if(abs(vN.y)<.5){
        float u=abs(vN.x)>abs(vN.z)?vWp.z:vWp.x; vec2 g=vec2(u/.34,vWp.y/.42); vec2 id=floor(g), f=fract(g);
        float aa=clamp(1.6-max(fwidth(g.x),fwidth(g.y))*2.6,0.,1.); // вдали окна сливаются в ровный тон без ряби
        // края окон сглаживаем по производным пикселя: на движении ряды окон не мерцают (темпоральный алиасинг)
        vec2 ew=vec2(fwidth(f.x),fwidth(f.y))+.004;
        float win=smoothstep(.18-ew.x,.18+ew.x,f.x)*smoothstep(.82+ew.x,.82-ew.x,f.x)*smoothstep(.2-ew.y,.2+ew.y,f.y)*smoothstep(.78+ew.y,.78-ew.y,f.y)*aa;
        // фасады из Blender: у каждого дома свой стиль (кирпич, ленточные окна, стеклянная стена, ар-деко),
        // кусок 4 окна × 3 этажа; альфа — стекло, по нему и горят окна
        if(uHasFac>.5&&aa>.02){ // дальние дома — без выборки из текстуры, там окна всё равно сливаются в тон
          float st=floor(h21(vec2(vId*.37,3.1))*4.); vec2 cell=vec2(mod(st,2.),1.-floor(st/2.)), q=g/vec2(4.,3.);
          vec4 fa=textureGrad(uFac,(cell+fract(q)*.992+.004)*.5,dFdx(q)*.5,dFdy(q)*.5);
          diffuseColor.rgb=mix(fa.rgb,fa.rgb*diffuseColor.rgb*2.4,.45);
          win=smoothstep(.15,.85,fa.a)*aa; // без порога: на среднем плане стекло мягко сливается, без ряби
        }
        float gy=vWp.y+.6, gaa=clamp(1.5-max(fwidth(u)/.42,fwidth(vWp.y)/.2),0.,1.);
        float base=step(gy,.4); win*=1.-base; // первый этаж — витрины, над ними карниз
        diffuseColor.rgb*=mix(.4,1.,smoothstep(0.,1.1,gy));
        float r=h21(id+vId*7.13);
        // LOD эмиссии окон: когда ячейка окна становится мельче пикселя, случайное «вкл/выкл» заменяем средней
        // яркостью — зажжённые окна перестают бликать на движении камеры (аналог мип-фильтрации процедурного узора)
        float lw=clamp((max(fwidth(g.x),fwidth(g.y))-.4)/.7,0.,1.);
        float onCrisp=step(1.-uLit,r)*win;   // вблизи — чёткие отдельные окна
        float onAvg=uLit*win;                // вдали — ровная доля зажжённых окон
        float on=mix(onCrisp,onAvg,lw);
        float bf=mix(.9+.6*r,1.2,lw);         // и яркость сходится к средней
        totalEmissiveRadiance+=vec3(.95,.6,.3)*uLit*.16*(1.-aa)*(1.-uDay*.75);
        vec3 wc=mix(vec3(.95,.62,.3),vec3(.8,.84,.95),step(.86,h21(id.yx+vId)))*(.55+.6*h21(id+vId*3.3));
        // окно изнутри: потолочный свет, шторы или жалюзи, тёмный переплёт; тёмное стекло ловит небо — а не плоский прямоугольник
        float h1=h21(id*1.7+vId*2.9), h2=h21(id.yx*3.1+vId*5.3), det=1.-lw;
        float room=.34+.5*smoothstep(.1,.85,f.y)+.5*exp(-dot((f-vec2(.5,.72))*vec2(2.2,4.),(f-vec2(.5,.72))*vec2(2.2,4.)));
        float cur=step(.55,h1)*smoothstep(.1+.22*h2,.16+.22*h2,abs(f.x-.5)); room*=1.-.5*cur*(.8+.2*sin(f.x*60.));
        float bl=step(h1,.22)*step(.35+.5*h2,f.y); room*=1.-.45*bl*step(.5,fract(f.y*11.));
        room*=1.-.7*smoothstep(.03,.0,abs(f.x-.5)); room=mix(.62,room,det);
        vec3 gl=vec3(.018,.02,.034)+vec3(.075,.04,.1)*smoothstep(0.,13.,vWp.y)*(.55+.45*h2)+vec3(.05,.03,.02)*(1.-smoothstep(0.,3.,vWp.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.02),win); totalEmissiveRadiance+=gl*win*(1.-on)*(1.-uDay*.8);
        float wall=h21(vec2(vId,3.3)); diffuseColor.rgb*=.86+.22*wall+.07*sin(u*2.1+vId)*sin(vWp.y*1.3+vId*2.);
        totalEmissiveRadiance+=wc*on*bf*room*.62*(1.-uDay*.75);
        vec2 sg=vec2(u/.42,(gy-.05)/.3); float sf=step(.1,fract(sg.x))*step(fract(sg.x),.9)*step(0.,sg.y)*step(sg.y,1.), so=step(.45,h21(vec2(floor(sg.x),vId*3.1)));
        vec3 sc=mix(vec3(1.,.66,.34),mix(vec3(.5,.8,1.),vec3(1.,.4,.65),step(.5,h21(vec2(vId,7.)))),step(.86,h21(vec2(floor(sg.x/3.),vId))));
        totalEmissiveRadiance+=sc*base*mix(.22,sf*so*(.35+.65*sg.y)*(.7+.3*step(.06,abs(fract(sg.x)-.5))),gaa)*.5*(1.-uDay*.8);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.055,.05,.055),base*(1.-sf)); diffuseColor.rgb*=1.+step(.4,gy)*step(gy,.46)*.9;
        float band=step(.94,fract(vWp.y/.42/6.));
        diffuseColor.rgb*=1.-band*.25;
      } else if(vN.y>.5){ diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.92,.9),uSnow); }`);
  };
  return m;
}
// --- асфальт с разметкой: кварталы по сетке ---
function groundMaterial(block, road, uF) {
  return new THREE.ShaderMaterial({
    fog: true, uniforms: { ...THREE.UniformsLib.fog, uF, uDay: { value: 0 }, uSnow: { value: 0 } },
    vertexShader: `varying vec3 vWp;\n#include <fog_pars_vertex>\nvoid main(){vec4 wp=modelMatrix*vec4(position,1.);vWp=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float uDay,uSnow;uniform vec3 uF;varying vec3 vWp;\n#include <fog_pars_fragment>\nvoid main(){
      vec2 p=vWp.xz+${(block / 2).toFixed(2)}; vec2 m=mod(p,${block.toFixed(2)}); vec2 dr=min(m,${block.toFixed(2)}-m);
      float rd=step(min(dr.x,dr.y),${(road / 2).toFixed(2)});
      float walk=step(min(dr.x,dr.y),${(road / 2 + .35).toFixed(2)})-rd;
      vec2 qa=vec2(vWp.x-(${((SUPER.x0 + SUPER.x1) / 2).toFixed(2)}),vWp.z-(${((SUPER.z0 + SUPER.z1) / 2).toFixed(2)})), qd=vec2(${((SUPER.x1 - SUPER.x0) / 2 - road / 2).toFixed(2)},${((SUPER.z1 - SUPER.z0) / 2 - road / 2).toFixed(2)})-abs(qa);
      float inS=step(0.,min(qd.x,qd.y)); rd*=1.-inS; walk=mix(walk,step(min(qd.x,qd.y),.5),inS);
      vec3 col=mix(vec3(.075,.055,.058),vec3(.045,.036,.04),rd);
      col=mix(col,vec3(.13,.11,.1),walk);
      float lane=rd*step(.9,max(dr.x,dr.y))*step(min(dr.x,dr.y),.03)*step(.5,fract((dr.x<dr.y?p.y:p.x)*.9));
      col+=vec3(.95,.72,.25)*lane*.5;
      col=mix(col,vec3(.07,.062,.07),inS*(1.-walk));
      col+=vec3(.34,.19,.075)*(rd*.55+walk)*(.55+.45*smoothstep(.2,.8,abs(fract((dr.x<dr.y?p.y:p.x)/2.3)-.5)*2.))*(1.-uDay); // улицы под фонарями
      col*=mix(1.,2.2,uDay);
      col=mix(col,mix(vec3(.32,.3,.31),vec3(.86,.85,.84),uDay)*(1.-rd*.35),uSnow*(1.-lane));
      gl_FragColor=vec4(col,1.);
      #include <fog_fragment>
      vec2 gv=vWp.xz-cameraPosition.xz;float gd=length(gv);gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(uF,vec3(.25,.1,.23),.75*(1.-uDay)),smoothstep(95.,300.,gd));
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

// пауза между тяжёлыми шагами: браузер успевает нарисовать кадр, страница не замирает
const breathe = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); requestAnimationFrame ? setTimeout(() => c.port2.postMessage(0), 0) : c.port2.postMessage(0); });
// плавное пружинное сглаживание без рывков на старте и в конце (критическое затухание)
function damp(st, target, time, dt) { const w = 2 / Math.max(1e-4, time), x = w * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x), d = st.v - target, k = (st.s + w * d) * dt; st.s = (st.s - w * k) * e; st.v = target + (d + k) * e; return st.v; }
// всё, что нужно башне с сервера, качается заранее, пока гость на другой странице
export function warmTower() { loadBake(); loadKit(); loadHotel(); }
let pBake = null, pKit = null, pHotel = null;
export async function mountTower(host, { onPick, onPickVenue, onSpin, onHoverFloor }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); renderer.debug.checkShaderErrors = false; // проверка ошибок шейдеров ждёт видеокарту и замораживает страницу
 
  // чёткость: на телефонах сразу ниже, дальше подстраивается под реальную скорость кадров (только вниз, без скачков)
  const coarse = matchMedia('(pointer: coarse)').matches; let dpr = Math.min(devicePixelRatio, coarse ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement); renderer.domElement.style.cssText += ';opacity:0;transition:opacity .9s ease';
  const assets = Promise.all([loadBake(), loadKit(), loadHotel()]); await breathe();
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0x2a1f24); scene.fog = new THREE.FogExp2(fogCol, 0.021); scene.background = fogCol.clone();
  const pm = new THREE.PMREMGenerator(renderer), envRoom = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture; scene.environment = envRoom;
  let envBake = null; // { night, day } — отражения настоящего города вместо студийного света
  await breathe();
  const cam = new THREE.PerspectiveCamera(32, 1, 2, 900);
  const hemi = new THREE.HemisphereLight(0xf2e2c8, 0x1a120a, 0.55), key = new THREE.DirectionalLight(0xffcf98, 1.5), rim = new THREE.PointLight(0xb45cff, 34, 34, 1.6), rim2 = new THREE.PointLight(0xf7b50a, 30, 40, 1.6);
  key.position.set(-14, 22, 12); rim.position.set(-8, 22, -8); rim2.position.set(9, 2, -8); scene.add(hemi, key, rim, rim2);

  // ночное небо: глубокий сине-фиолетовый градиент, мерцающие звёзды, луна с ореолом, тонкие перистые облака
  // и засветка большого города у горизонта в фиолетово-розовых тонах
  const MOON = new THREE.Vector3(-.62, .2, -.76).normalize();
  const skyU = { uDay: { value: 0 }, uFog: { value: new THREE.Color() }, uTime: { value: 0 }, uMoon: { value: MOON } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
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
        c+=vec3(.30,.12,.07)*exp(-max(h,0.)*22.)*(1.-uDay); // янтарное зарево города
        c=mix(mix(uFog,vec3(.25,.1,.23),.75*(1.-uDay)*smoothstep(-.6,.05,normalize(d.xz).y)),c,smoothstep(-.018,.03,h)); // у горизонта небо = цвет дымки, город растворяется без границы
        gl_FragColor=vec4(c+(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.,1.);}` }));
  sky.frustumCulled = false; sky.renderOrder = -2; scene.add(sky); // небо едет за камерой: горизонт всегда на уровне глаз и растворяется в дымке await breathe();

  const root = new THREE.Group(); scene.add(root);
  const world = new THREE.Group(); scene.add(world);
  const brass = new THREE.MeshStandardMaterial({ color: 0xcfa451, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x241819, metalness: 0.25, roughness: 0.6 });
  const slabM = new THREE.MeshStandardMaterial({ color: 0x2a1c1f, metalness: 0.5, roughness: 0.4 });
  const neon = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const emis = (map, k) => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: k, metalness: 0.5, roughness: 0.18, envMapIntensity: 0.9 });

  // ---------- город ----------
  const BLOCK = 7, ROAD = 1.6, GROUND = GY;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMaterial(BLOCK, ROAD, skyU.uFog)); ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; world.add(ground);
  const cityM = cityMaterial(), cityAtlas = glassAtlas(), landmarkMats = [], sinkers = []; let crownLit = null, traffic = null;
  const lots = []; seedN = 11;
  for (let gx = -9; gx <= 9; gx++) for (let gz = -9; gz <= 9; gz++) {
    const cx = gx * BLOCK, cz = gz * BLOCK, d = Math.hypot(cx, cz); if (reserved(cx, cz)) continue; // квартал отеля, площадь и ориентиры
    // в квартале 1–4 здания
    const parts = d < 48 ? (rnd() < .5 ? 2 : 4) : (rnd() < .5 ? 1 : 2), inner = BLOCK - ROAD - 0.9;
    for (let k = 0; k < parts; k++) {
      const sw = parts === 4 ? inner / 2 - .2 : parts === 2 ? inner : inner, sd = parts === 4 ? inner / 2 - .2 : parts === 2 ? inner / 2 - .2 : inner;
      const ox = parts === 4 ? (k % 2 ? 1 : -1) * (inner / 4 + .05) : 0, oz = parts >= 2 ? (k < parts / 2 ? -1 : 1) * (inner / 4 + .05) : 0;
      const downtown = cx < 4 && cz < 2, warehouses = cx > 12;
      const tall = d < 34 && cz > 4 ? .45 + rnd() * .9 : warehouses ? .5 + rnd() * 1.2 : downtown ? (d < 30 ? 1.5 + rnd() * 3 : d < 70 ? 4 + rnd() * 8 : 2.5 + rnd() * 6) : d < 42 ? 0.8 + rnd() * 2.6 : d < 62 ? 3 + rnd() * 6 : 1.5 + rnd() * 4; // за отелем даунтаун, справа склады, спереди средняя застройка
      if (nearFreeway(cx + ox, cz + oz, 1.5 + Math.max(sw, sd) / 2)) continue;
      lots.push({ x: cx + ox, z: cz + oz, w: sw * (.9 + rnd() * .1), d: sd * (.9 + rnd() * .1), h: tall });
    }
  }
  [[-1, -1, 1.3], [1, -1, .9], [-1, 1, .8], [1, 1, 1.5]].forEach(([a, b, h]) => lots.push({ x: 14 + a * 1.18, z: -7 + b * 1.18, w: 1.95, d: 1.95, h })); // квартал у подножия круглой башни
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const tiers = []; lots.forEach(l => { tiers.push(l); if (l.h > 8 && rnd() < .6) { const k = .62 + rnd() * .15; tiers.push({ x: l.x, z: l.z, w: l.w * k, d: l.d * k, h: l.h * (1.12 + rnd() * .18), top: true }); } });
  const city = new THREE.InstancedMesh(box, cityM, tiers.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
  const PALETTE = [0x8f8379, 0x7d746e, 0x6b635f, 0x958a80, 0x84786c, 0x4a5462, 0x3f4855, 0x887d71], C3 = new THREE.Color();
  tiers.forEach((t, i) => { M.compose(V.set(t.x, GROUND, t.z), Q, Sc.set(t.w, t.h, t.d)); city.setMatrixAt(i, M); const glassy = t.h > 8; city.setColorAt(i, C3.set(PALETTE[glassy ? 5 + (i % 2) : [0, 1, 2, 3, 4, 7][(i * 7) % 6]])); }); world.add(city);
  await breathe();
  {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: { uF: skyU.uFog },
      vertexShader: 'attribute vec2 aS;varying vec2 p,hs;varying float vD;void main(){hs=aS*.5;p=position.xz*(aS+1.5);vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform vec3 uF;varying vec2 p,hs;varying float vD;void main(){vec2 q=abs(p)-hs;float d=length(max(q,0.));float k=smoothstep(.62,0.,d);vec3 c=mix(vec3(.15,.13,.125),vec3(.34,.2,.1),exp(-d*5.));c*=mix(.35,1.,smoothstep(0.,.16,d));float f=exp(-vD*vD*.00018);gl_FragColor=vec4(mix(uF,c,f),k*.92);}' });
    const list = lots.concat([{ x: -14.4, z: 7, w: 4, d: 2.6 }]), ap = new THREE.InstancedMesh(g, m, list.length), aS = new Float32Array(list.length * 2);
    list.forEach((l, i) => { M.compose(V.set(l.x, GROUND + .02, l.z), Q.identity(), Sc.set(l.w + 1.5, 1, l.d + 1.5)); ap.setMatrixAt(i, M); aS.set([l.w, l.d], i * 2); }); g.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 2)); ap.frustumCulled = false; world.add(ap);
  }
  // ориентиры района как в игре: круглая башня с короной, высокий отель-пластина, театр с закруглённым углом, эстакада
  let chaseLanes = [];
  {
    const lmGlass = new THREE.MeshStandardMaterial({ map: cityAtlas.glass, emissiveMap: cityAtlas.lit, emissive: 0xffffff, emissiveIntensity: .8, metalness: .6, roughness: .2 }); landmarkMats.push(lmGlass);
    lmGlass.map = cityAtlas.glass.clone(); lmGlass.map.repeat.set(6, 22); lmGlass.map.needsUpdate = true; lmGlass.emissiveMap = cityAtlas.lit.clone(); lmGlass.emissiveMap.repeat.set(6, 22); lmGlass.emissiveMap.needsUpdate = true;
    lmGlass.map.wrapT = lmGlass.emissiveMap.wrapT = THREE.RepeatWrapping;
    // круглая ступенчатая башня с короной: светлый камень с горизонтальными лентами окон
    const stoneLM = new THREE.MeshStandardMaterial({ color: 0x2a222f, roughness: .9, metalness: 0, envMapIntensity: .2 });
    const bandTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#6d6670'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#262c36'; g.fillRect(0, 18, 256, 26); for (let x = 0; x < 256; x += 16) { g.fillStyle = '#4a5560'; g.fillRect(x, 18, 2, 26); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const bandLit = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64); for (let x = 0; x < 256; x += 16) if (Math.random() < .35) { g.fillStyle = '#e6c487'; g.fillRect(x + 3, 20, 11, 22); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const rtG = new THREE.Group(); rtG.scale.set(.74, 1, .74); rtG.position.set(14 * .26, 0, -14 * .26); world.add(rtG); sinkers.push({ g: rtG, x: 14, z: -14, h: 27 });
    const RT = [14, -14];
    [[3.2, 3.4, 15, 0], [2.7, 2.95, 6, 15], [2.15, 2.4, 3.5, 21]].forEach(([r1, r2, h, y]) => {
      const m = new THREE.MeshStandardMaterial({ map: bandTex.clone(), emissiveMap: bandLit.clone(), emissive: 0xffffff, emissiveIntensity: .8, roughness: .6 }); [m.map, m.emissiveMap].forEach(t => { t.repeat.set(Math.round(r1 * 5), h * 2.2); t.needsUpdate = true; }); m.userData.size = [r1 * 4.9, h]; landmarkMats.push(m);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 48, 1, true), m); c.position.set(RT[0], GROUND + y + h / 2, RT[1]); rtG.add(c);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r1 + .08, r1 + .08, .28, 48), stoneLM); ring.position.set(RT[0], GROUND + y + h, RT[1]); rtG.add(ring); });
    // корона: тёмные рёбра, свет идёт снизу вверх и гаснет к краю; сверху купол со шпилем
    const crTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 64); const gr = g.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, '#ffb056'); gr.addColorStop(.45, '#8a4b1c'); gr.addColorStop(1, '#140a05'); g.fillStyle = gr; for (let x = 0; x < 512; x += 16) g.fillRect(x + 5, 4, 8, 60); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
    crownLit = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 1.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2226, emissive: 0xffffff, emissiveMap: crTex, emissiveIntensity: 0, roughness: .5, side: THREE.DoubleSide })); crownLit.position.set(RT[0], GROUND + 25.25, RT[1]); rtG.add(crownLit);
    const cup = [new THREE.CylinderGeometry(1.84, 1.84, .14, 40), new THREE.SphereGeometry(1.45, 28, 10, 0, 6.283, 0, 1.571), new THREE.CylinderGeometry(.04, .12, 2.6, 8)]; cup[1].scale(1, .62, 1); cup[2].translate(0, 2.1, 0);
    const cupM = new THREE.Mesh(mergeGeos(cup), new THREE.MeshStandardMaterial({ color: 0x1d1a22, roughness: .5, metalness: .5, envMapIntensity: .35 })); cupM.position.set(RT[0], GROUND + 26, RT[1]); rtG.add(cupM);
    const podium = (g, x, z, w, d, k) => { // k — поправка на сжатие группы
      const st = new THREE.MeshStandardMaterial({ color: 0x2f2935, roughness: .95 }), dk = new THREE.MeshStandardMaterial({ color: 0x2b262b, roughness: .9 }), lobby = new THREE.MeshBasicMaterial({ color: 0x6e4630, toneMapped: false }), line = new THREE.MeshBasicMaterial({ color: 0x80603f, toneMapped: false });
      const B = (sx, sy, sz, y, m) => { const q = new THREE.BoxGeometry(sx * k, sy, sz * k); q.translate(x, GROUND + y + sy / 2, z); return [q, m]; }, by = new Map(), put = ([q, m]) => by.set(m, [...(by.get(m) || []), q]);
      put(B(w + .5, .1, d + .5, 0, st)); put(B(w + .25, .1, d + .25, .1, dk)); put(B(w - .25, .62, d - .25, .2, lobby)); put(B(w, .16, d, .82, st)); put(B(w + .02, .03, d + .02, .8, line)); put(B(w * .9, .5, d * .9, .98, dk)); put(B(w * .92, .06, d * .92, 1.48, st));
      for (let a = 0; a <= 7; a++) for (const sd of [-1, 1]) { const t = (a / 7 - .5) * (w - .08), u = (a / 7 - .5) * (d - .08); const c1 = new THREE.BoxGeometry(.13 * k, .62, .13 * k); c1.translate(x + t * k, GROUND + .51, z + sd * (d / 2 - .06) * k); put([c1, st]); const c2 = new THREE.BoxGeometry(.13 * k, .62, .13 * k); c2.translate(x + sd * (w / 2 - .06) * k, GROUND + .51, z + u * k); put([c2, st]); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b = new THREE.IcosahedronGeometry(.24 * k, 1); b.translate(x + sx * (w / 2 + .05) * k, GROUND + .36, z + sz * (d / 2 + .05) * k); put([b, green]); }
      by.forEach((list, m) => g.add(new THREE.Mesh(mergeGeos(list), m)));
    }, green = new THREE.MeshStandardMaterial({ color: 0x2f4428, roughness: 1 });
    podium(rtG, RT[0], RT[1], 4.5, 4.5, 1 / .74);
    // отель «Баннер»: светлая пластина с короной слева за отелем
    const bnG = new THREE.Group(); world.add(bnG); sinkers.push({ g: bnG, x: -14, z: -14, h: 19 });
    const bannerTex = bandTex.clone(); bannerTex.repeat.set(4, 40); bannerTex.needsUpdate = true;
    const bannerM = new THREE.MeshStandardMaterial({ map: bannerTex, emissiveMap: bandLit.clone(), emissive: 0xffffff, emissiveIntensity: .8, roughness: .7 }); bannerM.emissiveMap.repeat.set(4, 40); bannerM.emissiveMap.needsUpdate = true; bannerM.userData.size = [3.78, 18]; landmarkMats.push(bannerM);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(2.6, 18, 4.4), bannerM); banner.position.set(-14, GROUND + 9, -14); bnG.add(banner);
    const bcap = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1, 4.7), stoneLM); bcap.position.set(-14, GROUND + 18.5, -14); bnG.add(bcap);
    const thG = new THREE.Group(); thG.scale.setScalar(.7); thG.position.set(-14.6 + 8 * .7, GROUND * .3, 7 - 7.3 * .7); world.add(thG);
    podium(bnG, -14, -14, 4.0, 4.6, 1);
    const theaterM = new THREE.MeshStandardMaterial({ color: 0x1d1822, roughness: 1, metalness: 0, envMapIntensity: .15 });
    const mqM = new THREE.MeshBasicMaterial({ color: 0x96673a, toneMapped: false }), marquee = new THREE.Mesh(new THREE.BoxGeometry(5.1, .22, 3.5), [mqM, mqM, theaterM, theaterM, mqM, mqM]); marquee.position.set(-8, GROUND + 2.25, 7.3); thG.add(marquee);
    const thGlow = new THREE.Mesh(beamGeo(2.2, 3.4, 2.4), beamMat(0xffb45a, .5)); thGlow.position.set(-8, GROUND, 7.3); thGlow.scale.set(1.25, 1, .85); thG.add(thGlow);
    const th = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 3.4), theaterM); th.position.set(-8, GROUND + 1.1, 7.3); thG.add(th);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(.5, 3.2, .5), new THREE.MeshStandardMaterial({ color: 0x2c2428, roughness: .5 })); pylon.position.set(-10.8, GROUND + 1.6, 9.4); thG.add(pylon);
    const thr = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.2, 32, 1, false, 0, Math.PI / 2), theaterM); thr.position.set(-5.5, GROUND + 1.1, 7.3); thG.add(thr);
    const bands = new THREE.Mesh(new THREE.BoxGeometry(5.05, .08, 3.45), new THREE.MeshStandardMaterial({ color: 0x241d20 })); [.6, 1.2, 1.8].forEach(y => { const b = bands.clone(); b.position.set(-8, GROUND + y, 7.3); thG.add(b); });
    // эстакада: плавная кривая через город, полотно с разметкой, борта со световой нитью и опоры
    const Y = GROUND + 1.75, rb = ribbon(FREEWAY, 2.5, Y, 16, 6, false), geo = (r, normal) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(r.uv.map((v, i) => i % 2 ? v / 3 : (v + 1) / 2), 2)); g.setIndex(r.idx); g.computeVertexNormals(); return g; };
    const fwTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#2a282c'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#b9a468'; g.fillRect(125, 0, 2, 128); g.fillRect(129, 0, 2, 128); g.fillStyle = '#b8b2a4'; g.fillRect(10, 0, 2, 128); g.fillRect(244, 0, 2, 128); [68, 187].forEach(x => g.fillRect(x, 0, 2, 52)); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    const deck = new THREE.Mesh(geo(rb), new THREE.MeshStandardMaterial({ map: fwTex, roughness: .8, emissive: 0x4a2a12, emissiveIntensity: .35, side: THREE.DoubleSide })); world.add(deck);
    const wall = (off) => { const pos = [], idx = []; FREEWAY.forEach((p, i) => { const a = FREEWAY[Math.max(0, i - 1)], b = FREEWAY[Math.min(FREEWAY.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l; pos.push(p.x + nx * off, Y - .28, p.z + nz * off, p.x + nx * off, Y + .13, p.z + nz * off); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k, k - 1, k + 1); } }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const wallM = new THREE.MeshStandardMaterial({ color: 0x4a464c, roughness: .9, side: THREE.DoubleSide }); [-1.26, 1.26].forEach(o => world.add(new THREE.Mesh(wall(o), wallM)));
    [-1.26, 1.26].forEach(o => { const l = ribbon(FREEWAY, .05, Y + .14, 16, 6, false, o); world.add(new THREE.Mesh(geo(l), new THREE.MeshBasicMaterial({ color: 0x9a6a34, side: THREE.DoubleSide }))); });
    const piers = FREEWAY.filter((p, i) => i % 9 === 4 && Math.hypot(p.x, p.z) < 75), pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.2, .26, 1.6, 10), wallM, piers.length); piers.forEach((p, i) => { M.compose(V.set(p.x, GROUND + .75, p.z), Q.identity(), Sc.set(1, 1, 1)); pm.setMatrixAt(i, M); }); world.add(pm);
    await breathe();
    // машины: световые шлейфы строго по полосам
    const L = i => 3.5 + 7 * i, lanes = [];
    [[-2, 1, -1, 1], [-3, 2, -2, 2], [-4, 3, -4, 3], [-6, 5, -5, 5], [-8, 7, -7, 7], [-5, -2, -4, -1], [1, 4, -5, -1], [-6, -3, 1, 4], [2, 5, 1, 5], [-2, 1, 2, 4], [-1, 3, -7, -4], [-8, -4, -3, 0], [3, 6, -3, 1], [-4, 0, 3, 6]].forEach(([a, b, c, d], k) => {
      lanes.push(Object.assign(ribbon(loopPath(L(a), L(b), L(c), L(d), .3, 1), .7, GROUND + .05, k < 2 ? 6.5 : 8, 2.6, true), { gap: 3.4, red: false }), Object.assign(ribbon(loopPath(L(a), L(b), L(c), L(d), -.3, -1), .7, GROUND + .05, k < 2 ? 6.5 : 8, 2.6, true), { gap: 3.4, red: true })); });
    const back = [...FREEWAY].reverse(); [.36, .9].forEach((o, k) => { lanes.push(Object.assign(ribbon(FREEWAY, .6, Y + .04, 20 - k * 3, 9, false, o), { gap: 1.7, red: false }), Object.assign(ribbon(back, .6, Y + .04, 20 - k * 3, 9, false, o), { gap: 1.7, red: true })); });
    traffic = trafficMesh(lanes); world.add(traffic); chaseLanes = lanes.filter(r => { let d = 0; for (let k = 0; k < r.pos.length; k += 6) d = Math.max(d, Math.hypot(r.pos[k], r.pos[k + 2])); return !r.red && r.T > 12 && d < 34; });
  }
  await breathe();
  // крыши: техэтажи и красные огни на высоких
  const roofs = new THREE.InstancedMesh(box, stone, lots.length); lots.forEach((l, i) => { M.compose(V.set(l.x + (rnd() - .5) * l.w * .3, GROUND + l.h, l.z + (rnd() - .5) * l.d * .3), Q, Sc.set(l.w * .3, .35, l.d * .3)); roofs.setMatrixAt(i, M); }); world.add(roofs);
  const tipPts = []; tiers.forEach(t => { if (t.h > 10) tipPts.push(t.x, GROUND + t.h + .25, t.z); });
  const beaconsG = new THREE.BufferGeometry(); beaconsG.setAttribute('position', new THREE.Float32BufferAttribute(tipPts, 3));
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const beacons = new THREE.Points(beaconsG, new THREE.PointsMaterial({ map: dotTex, color: 0xef5617, size: .7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); sinkTops(beacons.material, false); world.add(beacons);
  // фонари вдоль дорог
  const lamp = []; for (let a = -9; a <= 9; a++) for (let b = -60; b <= 60; b += 2.3) { const r = a * BLOCK + BLOCK / 2; [[r + ROAD / 2 + .15, b], [b, r + ROAD / 2 + .15]].forEach(([x, z]) => { if (Math.hypot(x, z) < 70 && !(x > SUPER.x0 + .6 && x < SUPER.x1 - .6 && z > SUPER.z0 + .6 && z < SUPER.z1 - .6) && !nearFreeway(x, z, 1.5)) lamp.push(x, GROUND + .55, z); }); }
  const lampG = new THREE.BufferGeometry(); lampG.setAttribute('position', new THREE.Float32BufferAttribute(lamp, 3));
  const lamps = new THREE.Points(lampG, new THREE.PointsMaterial({ map: dotTex, color: 0xffc46a, size: .55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); world.add(lamps);
  // ---------- горизонт Лос-Сантоса: ковёр огней, холмы, океан с пирсом, самолёты и вертолёт ----------
  await breathe();
  const far = { uT: { value: 0 }, uK: { value: 1 } }, farList = [], rf = (() => { let q = 4711; return () => (q = q * 16807 % 2147483647) / 2147483647; })();
  const SEA = 118, inSea = (x, z) => z > SEA + Math.sin(x * .031) * 9 + Math.sin(x * .011 + 2) * 12;
  // улицы до горизонта: бесконечная янтарная сетка, как над Лос-Сантосом ночью
  for (let l = -46; l <= 46; l++) for (let b = -330; b <= 330; b += 4.6) for (const ax of [0, 1]) {
    const c = l * 7 + 3.5, x = ax ? c : b + rf() * 3, z = ax ? b + rf() * 3 : c, d = Math.hypot(x, z); if (d < 58 || d > 150 || inSea(x, z) || rf() > (d < 110 ? .75 : .5)) continue; // только вдоль улиц и по земле; дальше всё в дымке
    const w = rf(); farList.push(x, GROUND + .45, z, 1, w < .8 ? .6 : .78, w < .8 ? .28 : .56, .4 + rf() * .6, rf() * 60);
  }
  await breathe();
  // дымка у горизонта: одно кольцо вокруг камеры перед холмами и дальним океаном. Края земли, воды и холмов тонут в ней,
  // город и отель ближе — их она не трогает. Без текстур, один вызов отрисовки
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(214, 214, 84, 64, 1, true), new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms: { uF: skyU.uFog, uDay: skyU.uDay, uT: skyU.uTime },
    vertexShader: 'varying vec3 p;varying float wy;void main(){p=position;wy=(modelMatrix*vec4(position,1.)).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 uF;uniform float uDay,uT;varying vec3 p;varying float wy;void main(){
      float a=atan(p.z,p.x),w=sin(a*3.+uT*.011)*.5+sin(a*7.-uT*.017+1.3)*.3+sin(a*13.+uT*.02)*.2,e=p.y/214.;
      float up=exp(-pow(max(e+.012,0.)/(.034+.012*w),2.)),dn=exp(-pow(min(e+.03,0.)/.062,2.));
      vec3 c=mix(mix(uF*1.15,vec3(.27,.11,.25),.75),uF,uDay);c+=vec3(.05,.015,.035)*(1.-uDay)*smoothstep(-.05,.03,e);
      gl_FragColor=vec4(c+(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.,up*dn*(.9+.07*w)*smoothstep(42.,33.,abs(p.y))*smoothstep(-.6,11.,wy));}` }));
  haze.frustumCulled = false; haze.renderOrder = -1; world.add(haze);
  await breathe();
  // холмы: три гряды, дальние светлее — воздушная перспектива; на юге их нет, там океан
  const ridge = (R, H, col, seed) => {
    const n = 220, pos = [], idx = []; const hgt = a => { const north = Math.max(0, -Math.sin(a) * 1.15 + .32); return Math.min(1, north) * H * (.55 + .2 * Math.sin(a * 5 + seed) + .16 * Math.sin(a * 11 + seed * 2.3) + .09 * Math.sin(a * 23 + seed) + .05 * Math.sin(a * 47)); };
    for (let k = 0; k <= n; k++) { const a = k / n * 6.28319, x = Math.cos(a) * R, z = Math.sin(a) * R; pos.push(x, GROUND - 4, z, x, GROUND + Math.max(0, hgt(a)), z); if (k) { const q = k * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uC: { value: new THREE.Vector3(...col) }, uF: skyU.uFog, uDay: skyU.uDay, uH: { value: H } }, vertexShader: 'varying float y;void main(){y=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 uC,uF;uniform float uH,uDay;varying float y;void main(){gl_FragColor=vec4(mix(mix(uF,vec3(.25,.1,.23),.75*(1.-uDay)),uC,smoothstep(-1.,uH*.55,y)),1.);}' })); m.renderOrder = -1; world.add(m);
    return hgt;
  };
  ridge(330, 62, [.115, .062, .16], 1.7); ridge(270, 46, [.08, .042, .125], 4.1); ridge(215, 31, [.05, .027, .088], 2.6);
  // океан на юге: отражает зарево неба, дальше растворяется в той же дымке; дорожки — от колеса обозрения и судов
  const SEA_L = [[34, SEA + 34, 1, .42, .72], [-64, SEA + 96, 1, .78, .5], [92, SEA + 120, 1, .8, .55], [-150, SEA + 60, 1, .5, .34], [6, SEA + 150, .75, .85, 1]];
  const seaU = { uT: far.uT, uF: skyU.uFog, uDay: skyU.uDay, uL: { value: SEA_L.map(l => new THREE.Vector2(l[0], l[1])) }, uC: { value: SEA_L.map(l => new THREE.Vector3(l[2], l[3], l[4])) } };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1500, 560, 60, 1), new THREE.ShaderMaterial({ uniforms: seaU, vertexShader: 'varying vec3 w;varying float sh;void main(){vec4 q=modelMatrix*vec4(position,1.);float c=' + SEA.toFixed(1) + '+sin(q.x*.031)*9.+sin(q.x*.011+2.)*12.;if(uv.y>.5)q.z=c;sh=q.z-c;w=q.xyz;gl_Position=projectionMatrix*viewMatrix*q;}',
    fragmentShader: `uniform float uT,uDay;uniform vec3 uF;uniform vec2 uL[5];uniform vec3 uC[5];varying vec3 w;varying float sh;
      void main(){vec3 v=w-cameraPosition;float d=length(v),vis=1.-smoothstep(150.,430.,d);vec2 dir=normalize(v.xz);vec3 hz=mix(uF,vec3(.25,.1,.23),.75*(1.-uDay)*smoothstep(-.6,.05,dir.y));
        if(vis<.004){gl_FragColor=vec4(hz,1.);return;}                                    // дальняя половина океана — одна дымка, без счёта волн
        vec2 p=w.xz*vec2(.22,.55);float near=1./(1.+d*d*.00005);
        float a=sin(p.x*1.3+p.y*.7+uT*.5),b=sin(p.y*1.9-p.x*.8-uT*.62+a),e=sin(p.x*3.1+p.y*4.3+uT*.9+b*1.4),wave=(a*.3+b*.4+e*.3)*near;
        float fr=pow(1.-clamp(-v.y/d,0.,1.),5.);                                          // чем ближе к горизонту, тем больше неба в воде
        vec3 c=mix(vec3(.03,.034,.085),vec3(.3,.13,.3),fr*(.6+.4*wave));
        c+=vec3(.2,.12,.26)*smoothstep(.2,.7,wave)*.6;
        c+=vec3(.36,.19,.1)*exp(-max(sh,0.)*.11)*(.4+.6*smoothstep(-.1,.8,wave));         // тёплый свет набережной у берега
        c+=vec3(.5,.42,.52)*exp(-pow((sh-1.2-.7*a)*1.1,2.))*.28;                          // пена у кромки
        for(int i=0;i<5;i++){vec2 l=uL[i]-cameraPosition.xz;float L=length(l);l/=L;float off=(dir.x*l.y-dir.y*l.x)*d,q=L-d;
          float k=exp(-off*off/(6.+max(q,0.)*.16))*smoothstep(-2.,3.,q)*exp(-max(q,0.)*.02);
          c+=uC[i]*k*(.2+.75*smoothstep(.1,.7,b*.5+e*.5));}
        c=mix(c,vec3(.3,.46,.52)+.06*wave,uDay*.85);
        gl_FragColor=vec4(mix(hz,c,vis)+(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.,1.);}` }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, GROUND + .06, SEA + 280); world.add(sea);
  // суда: корпус и рубка, огни стоят на них, дорожки в воде — от них же
  const hulls = []; SEA_L.slice(1).forEach(([x, z, r, g, b], k) => { const bx = (w, h, d, dx, y) => { const q = new THREE.BoxGeometry(w, h, d); q.translate(x + dx, GROUND + y, z); hulls.push(q); };
    bx(7, .9, 1.7, 0, .5); bx(2, 1.1, 1.3, 1.6, 1.5); bx(.1, 1.8, .1, -1.2, 1.8); farList.push(x + 1.6, GROUND + 1.7, z - .75, r, g, b, 1.5, k * 9, x - 1.2, GROUND + 2.7, z, 1, .9, .7, 1, k * 9 + 1); });
  world.add(new THREE.Mesh(mergeGeos(hulls), new THREE.MeshBasicMaterial({ color: 0x1b1129, fog: false, toneMapped: false })));
  for (let x = -260; x <= 260; x += 3.2) { const z = SEA + Math.sin(x * .031) * 9 + Math.sin(x * .011 + 2) * 12 - 1.2; farList.push(x, GROUND + .7, z, 1, .7, .36, 1.1, x); }
  const PX = 34, PZ = SEA + Math.sin(PX * .031) * 9 + Math.sin(PX * .011 + 2) * 12; for (let k = 0; k < 34; k++) for (const o of [-1.4, 1.4]) farList.push(PX + o, GROUND + .9, PZ + k * 1.3, 1, .8, .55, 1, k);
  await breathe();
  // сами сооружения под огнями: набережная вдоль кромки, настил пирса на сваях, павильон и вращающееся колесо
  let wheel = null; {
    const Z = x => SEA + Math.sin(x * .031) * 9 + Math.sin(x * .011 + 2) * 12, pos = [], idx = []; for (let k = 0; k <= 130; k++) { const x = -260 + k * 4; pos.push(x, GROUND + .3, Z(x) - 3.4, x, GROUND + .3, Z(x) + .2, x, GROUND - .6, Z(x) + .5); if (k) { const q = k * 3; idx.push(q - 3, q - 2, q, q, q - 2, q + 1, q - 2, q - 1, q + 1, q + 1, q - 1, q + 2); } }
    const qg = new THREE.BufferGeometry(); qg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); qg.setIndex(idx); const flatM = c => new THREE.MeshBasicMaterial({ color: c, fog: false, toneMapped: false, side: THREE.DoubleSide }); world.add(new THREE.Mesh(qg, flatM(0x241834)));
    const bx = (w, h, d, x, y, z) => { const q = new THREE.BoxGeometry(w, h, d); q.translate(x, y, z); return q; }, deck = [bx(3.2, .25, 46, PX, GROUND + .75, PZ + 21), bx(11, .25, 13, PX, GROUND + .75, PZ + 36)]; for (let k = 0; k < 12; k++) for (const o of [-1.3, 1.3]) deck.push(bx(.28, 1.4, .28, PX + o, GROUND + .05, PZ + 2 + k * 3.7));
    deck.push(bx(.4, .4, 1.6, PX, GROUND + 9.2, PZ + 34)); for (const o of [-1, 1]) for (const dz of [-.8, .8]) { const L = new THREE.CylinderGeometry(.16, .22, 9.2, 6); L.rotateZ(o * .38); L.translate(PX + o * 1.75, GROUND + 5, PZ + 34 + dz); deck.push(L); }
    world.add(new THREE.Mesh(mergeGeos(deck), flatM(0x241833))); world.add(new THREE.Mesh(mergeGeos([bx(4.6, 1.5, 3, PX - 2.6, GROUND + 1.6, PZ + 40.5), bx(2.4, 1.2, 2.2, PX + 3.6, GROUND + 1.5, PZ + 40.5)]), flatM(0x51333c))); const rf1 = new THREE.ConeGeometry(3.4, 1.5, 4); rf1.rotateY(Math.PI / 4); rf1.scale(1, 1, .7); rf1.translate(PX - 2.6, GROUND + 3.1, PZ + 40.5); world.add(new THREE.Mesh(rf1, flatM(0x2a1832)));
    const ring = r => [-.5, .5].map(z => { const q = new THREE.TorusGeometry(r, .13, 5, 48); q.translate(0, 0, z); return q; }), parts = [...ring(7.6), ...ring(5.4)]; for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28319; for (const z of [-.5, .5]) { const q = new THREE.BoxGeometry(.1, 7.6, .1); q.translate(0, 3.8, z); q.rotateZ(a); parts.push(q); } const cab = new THREE.BoxGeometry(.8, .8, .9); cab.translate(Math.cos(a) * 8, Math.sin(a) * 8, 0); parts.push(cab); }
    wheel = new THREE.Mesh(mergeGeos(parts), flatM(0x2c1d40)); wheel.position.set(PX, GROUND + 9.2, PZ + 34); world.add(wheel);
  }
  const nGround = farList.length / 8; // дальше — огни колеса, они крутятся в шейдере
  for (let k = 0; k < 48; k++) farList.push(PX, GROUND + 9.2, PZ + 33.2, k % 3 ? 1 : .3, k % 3 === 1 ? .2 : .75, k % 3 ? .55 : 1, 1.7, 1000 + k);
  await breathe();
  { const cnt = farList.length / 8, P = new Float32Array(cnt * 3), C = new Float32Array(cnt * 4), F = new Float32Array(cnt); for (let k = 0; k < cnt; k++) { P.set(farList.slice(k * 8, k * 8 + 3), k * 3); C.set(farList.slice(k * 8 + 3, k * 8 + 7), k * 4); F[k] = farList[k * 8 + 7]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aC', new THREE.BufferAttribute(C, 4)); g.setAttribute('aF', new THREE.BufferAttribute(F, 1));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...far, uPx: { value: dpr } },
      vertexShader: `attribute vec4 aC;attribute float aF;uniform float uT,uPx;varying vec3 c;void main(){vec3 p=position;if(aF>=999.){float a=(aF-1000.)/48.*6.28319+uT*.12;float r=mod(aF,2.)<1.?7.6:5.4;p.xy+=vec2(cos(a),sin(a))*r;}
        vec4 mv=modelViewMatrix*vec4(p,1.);float d=-mv.z;float tw=.92+.08*sin(uT*.9+aF*7.);c=aC.rgb*aC.a*tw*2.1*exp(-d*d*.000016)*(aF>=999.?1.:1.-smoothstep(80.,165.,d));gl_PointSize=clamp(260./d,1.7,4.)*uPx;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: 'uniform float uK;varying vec3 c;void main(){vec2 q=gl_PointCoord-.5;gl_FragColor=vec4(c*uK*smoothstep(.5,.12,length(q)),1.);}' })); m.frustumCulled = false; world.add(m); }
  await breathe();
  // самолёты на посадке и полицейский вертолёт с лучом
  const airG = new THREE.BufferGeometry(); airG.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3)); airG.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
  const air = new THREE.Points(airG, new THREE.PointsMaterial({ map: dotTex, vertexColors: true, size: 4.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })); air.frustumCulled = false; world.add(air);
  const copter = new THREE.Group(), cb = new THREE.Mesh(beamGeo(.08, 1.7, 17), beamMat(0xdfe8ff, .22, 1.2)); cb.rotation.x = Math.PI; copter.add(cb); world.add(copter);
  // редкая погоня: раз в минуту по одной из полос уходит машина, за ней два патруля; вертолёт подсвечивает беглеца.
  // Две маленькие группы точек, скорость — та же, что у потока: в поворотах все притормаживают
  const mkPts = (n, size) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTex, vertexColors: true, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })); m.frustumCulled = false; m.visible = false; world.add(m); return m; };
  const chDots = mkPts(6, .62), chGlow = mkPts(3, 3.4), chP = new THREE.Vector3();
  function onLane(r, t, out) { t = ((t % r.T) + r.T) % r.T; let a = 0, b = r.tau.length / 2 - 1; while (b - a > 1) { const m = (a + b) >> 1; if (r.tau[m * 2] <= t) a = m; else b = m; } const f = Math.min(1, (t - r.tau[a * 2]) / Math.max(1e-4, r.tau[b * 2] - r.tau[a * 2])), c = (i, k) => (r.pos[i * 6 + k] + r.pos[i * 6 + 3 + k]) / 2; return out.set(c(a, 0) + (c(b, 0) - c(a, 0)) * f, c(a, 1) + .12, c(a, 2) + (c(b, 2) - c(a, 2)) * f); }
  function chase(sec) { // возвращает, насколько вертолёт сейчас занят погоней (0…1)
    if (document.documentElement.classList.contains('calm') || !chaseLanes.length) { chDots.visible = chGlow.visible = false; return 0; }
    const n = Math.floor(sec / 64), u = sec - n * 64, dur = 30, ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, on = ease(u / 2) * ease((dur - u) / 2);
    chDots.visible = chGlow.visible = on > .01; if (!chDots.visible) return ease((dur + 4 - u) / 4) * (u < dur + 4 ? 1 : 0);
    const r = chaseLanes[(n * 7 + 3) % chaseLanes.length], base = u * 1.5 + n * 17.3, P = chDots.geometry.attributes.position, C = chDots.geometry.attributes.color, GP = chGlow.geometry.attributes.position, GC = chGlow.geometry.attributes.color;
    for (let k = 0; k < 3; k++) {
      onLane(r, base - k * .85 - (k ? .35 : 0), chP); if (!k) chTarget.copy(chP);
      const w = Math.sin(sec * 13.5 + k * 1.9), red = Math.max(0, w) ** .5, blue = Math.max(0, -w) ** .5;   // чуть больше двух мягких вспышек в секунду
      P.setXYZ(k * 2, chP.x - .1, chP.y, chP.z - .1); P.setXYZ(k * 2 + 1, chP.x + .1, chP.y, chP.z + .1); GP.setXYZ(k, chP.x, chP.y, chP.z);
      if (!k) { C.setXYZ(0, on, .92 * on, .75 * on); C.setXYZ(1, on, .18 * on, .12 * on); GC.setXYZ(0, .16 * on, .13 * on, .09 * on); }
      else { C.setXYZ(k * 2, red * on, .05 * on, .08 * on); C.setXYZ(k * 2 + 1, .08 * on, .2 * blue * on, blue * on); GC.setXYZ(k, red * .34 * on, 0, blue * .42 * on); }
    }
    P.needsUpdate = C.needsUpdate = GP.needsUpdate = GC.needsUpdate = true; return ease((u - 1) / 4);
  }
  const chTarget = new THREE.Vector3(), chAim = new THREE.Vector3(); let chLast = 0;
  function flyAir(sec) {
    if (wheel) wheel.rotation.z = (sec % 100000) * .12;
    const p = airG.attributes.position, c = airG.attributes.color;
    for (let k = 0; k < 3; k++) { const u = ((sec * .017 + k * .37) % 1), x = 260 - u * 520, z = -120 + k * 26, y = 74 - u * 46 + k * 7, bl = Math.sin(sec * 5 + k * 2) > .8 ? 1 : 0, f = Math.min(1, Math.min(u, 1 - u) * 9); p.setXYZ(k, x, y, z); c.setXYZ(k, f, (.85 - bl * .5) * f, (.7 - bl * .5) * f); }
    const a = sec * .11, q = chase(sec), px0 = Math.cos(a) * 40 - 12, pz0 = Math.sin(a) * 26 - 16; chAim.lerp(chTarget, chLast ? 1 - Math.exp(-Math.min(.2, Math.max(0, sec - chLast)) * 1.6) : 1); chLast = sec; const rx = px0 + (chAim.x - px0) * q - 2.4, rz = pz0 + (chAim.z - pz0) * q, rd = Math.hypot(rx, rz) || 1, ro = Math.max(rd, 8.5) / rd, hx = 2.4 + rx * ro, hz = rz * ro, hy = (19 + Math.sin(sec * .4) * 1.2) * (1 - q) + 13 * q; p.setXYZ(3, hx, hy, hz); const bl = Math.sin(sec * 7) > .3 ? 1 : .15; c.setXYZ(3, bl, .12 * bl, .12 * bl); p.needsUpdate = c.needsUpdate = true;
    copter.position.set(hx, hy, hz); copter.rotation.set(Math.sin(sec * .5) * .28 * (1 - q), 0, Math.cos(sec * .37) * .3 * (1 - q));
  }
  // дымка и облака
  const ct = cloudTex(), clouds = new THREE.Group(); world.add(clouds); const cloudMats = [];
  for (let i = 0; i < 76; i++) {
    const ring = i < 46, a = rnd() * Math.PI * 2, r = ring ? 46 + rnd() * 40 : 30 + rnd() * 50, y = ring ? GROUND + 3 + rnd() * 9 : 24 + rnd() * 14;
    const m = new THREE.SpriteMaterial({ map: ct, color: 0xffffff, transparent: true, depthWrite: false, opacity: ring ? .42 : .22, fog: false }); cloudMats.push(m);
    const s = new THREE.Sprite(m); s.position.set(Math.cos(a) * r, y, Math.sin(a) * r); const k = ring ? 16 + rnd() * 14 : 22 + rnd() * 18; s.scale.set(k, k * .45, 1); clouds.add(s);
  }

  await breathe();
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
  let searchBeams = [], officeK = .6, shopM = null; // днём окна гаснут, стекло отражает небо, вывески приглушены
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
  let lift = null, lift0 = null, ledM = null, officeMats = [], venues = [], venueMeshes = [], hoverV = null;
  function build(rooms) {
    root.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { o.geometry?.dispose?.(); const ms = [].concat(o.material || []); ms.forEach(mm => { mm.map?.dispose?.(); mm.emissiveMap?.dispose?.(); }); } }); root.clear(); lift0 = lift ? lift.position.y : null; lift = null; floors = []; hotel = []; officeMats = [];
    const hF = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b), maxF = hF.at(-1) ?? 26;
    const n = Math.max(44, maxF + 12), podH = 3;
    topY = n * FH;
    const roofM0 = new THREE.MeshStandardMaterial({ color: 0x0d1015, metalness: .1, roughness: .95, envMapIntensity: .25 });
    const atlas = facadeTex() || glassAtlas(), steel = new THREE.MeshStandardMaterial({ color: 0x1d232b, metalness: .4, roughness: .65, envMapIntensity: .3 });
    const glassM = () => { const m = new THREE.MeshStandardMaterial({ map: atlas.glass, emissiveMap: atlas.lit, emissive: 0xffffff, emissiveIntensity: .9, metalness: .6, roughness: .14, envMapIntensity: .75 }); officeMats.push(m); return m; };
    // офисные этажи объёма: одна сетка, у каждого этажа свой ряд атласа
    const officeBlock = (pts, from, to, skip) => {
      const geos = [];
      for (let i = from; i < to; i++) { if (skip?.(i)) continue; geos.push(ringGeoAtlas(pts, FH, i * FH, (i * 5 + (pts[0][0] * 3 | 0)) & 7)); }
      if (geos.length) root.add(new THREE.Mesh(mergeGeos(geos), glassM()));
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
      const y = (f - 1) * FH, tex = venueCanvas(v), mat = emis(tex, v.kind === 'pool' ? .8 : .9);
      if (v.kind === 'pool') { // открытая терраса: стеклянное ядро, вода, ограждение и колонны
        const core = new THREE.Mesh(ringGeo(outline(.8), FH * .86), mat); core.position.y = y; root.add(core);
        const deck = new THREE.Mesh(slabRing(outline(1), y - .02, .06), steel); root.add(deck);
        const wg = new THREE.BoxGeometry(W * .86, .03, .7), water = new THREE.Mesh(wg, waterMat(new THREE.Color(v.accent).lerp(new THREE.Color(0x1fb6d0), .88), W * .43, .35));
        water.position.set(0, y + .065, D * .5 - .45); root.add(water);
        const rail = new THREE.Mesh(ringGeo(outline(.998), FH * .28), new THREE.MeshBasicMaterial({ color: 0x9fd9e0, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false })); rail.position.y = y; root.add(rail);
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
    const bridge = new THREE.Mesh(slabGeo(outline(1.01), .3), roofM0); bridge.position.y = crownTop; if (!HOTEL) root.add(bridge);
    const roofM = roofM0;
    [[outline(1.012), topY], [volPts(VOL.B, 1.012), topB], [volPts(VOL.C, 1.012), topC]].forEach(([P, y]) => { const r = new THREE.Mesh(slabGeo(P, .26), roofM); r.position.y = y; root.add(r); });
    // светодиодные ленты по рёбрам: пунктир, как в игре. Все ленты — одна сетка
    const ledEdges = [...outline(1.012).map(p => [p, topY + .25]), ...[0, 1, 2].map(i => [volPts(VOL.B, 1.012)[i + 1], topB + .25]), ...volPts(VOL.C, 1.012).map(p => [p, topC + .25])];
    root.add(new THREE.Mesh(mergeGeos(ledEdges.map(([[x, z], top]) => { const g = new THREE.BoxGeometry(.075, top - podH * FH, .075); g.translate(x, podH * FH + (top - podH * FH) / 2, z); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (top - podH * FH) / .3); return g; })), (ledM = new THREE.MeshBasicMaterial({ map: ledTex(), color: 0xb766ff, toneMapped: false }))));
    const podPts = [[-W / 2 - .25, D / 2 + .2], [VOL.C.x + VOL.C.w / 2 + .2, D / 2 + .2], [VOL.C.x + VOL.C.w / 2 + .2, VOL.B.z - VOL.B.d / 2 - .2], [-W / 2 - .25, -D / 2 - .25]];
    beacon = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), neon(0xef5617)); beacon.position.set(1.2, crownTop + 3.5, -.9); root.add(beacon);
    if (HOTEL) { // запечённые части отеля: земля, крыши, вертолётная площадка
      const put = (k, y) => { if (!HOTEL[k]) return; const m = new THREE.Mesh(HOTEL[k].geo, HOTEL[k].mat); m.position.y = y; m.updateMatrix(); m.matrixAutoUpdate = false; root.add(m); };
      put('base', 0); put('roofA', crownTop); put('roofB', topB + .26); put('roofC', topC + .26);
      const pool = (geo, m, x, y, z) => { const q = new THREE.Mesh(geo, m); q.position.set(x, y, z); q.updateMatrix(); q.matrixAutoUpdate = false; root.add(q); }, flat = g => g.rotateX(-Math.PI / 2);
      pool(flat(new THREE.PlaneGeometry(1.45, 1)), waterMat('#2fb6cc', .725, .5), 5.3, topC + .26 + .141, .6); pool(flat(new THREE.CircleGeometry(1.03, 40)), waterMat('#2493b4', 1.03, 0, 1, .85), .2, .1295, 4.7);
    } else root.add(new THREE.Mesh(slabGeo(podPts, podH * FH - .02), new THREE.MeshStandardMaterial({ color: 0x3a3135, roughness: .85 })));
    // этажи подиума: невидимая зона клика с лёгкой подсветкой при наведении
    shopM = new THREE.MeshBasicMaterial({ color: 0x2a1806, transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false });
    const atrium = venues.find(v => v.floor <= podH);
    if (atrium) { const shop = new THREE.Mesh(ringGeo(podPts.map(([x, z]) => [x * 1.004, z * 1.02]), FH * 2.6), shopM); shop.userData = { venue: atrium, floor: atrium.floor, light: shopM }; root.add(shop); venueMeshes.push(shop); }
    // единственная вывеска: объёмные буквы с подсветкой сзади на тёмном поясе под крышей, слева верблюд — как в игре
    {
      const sy = topY - 1.0, back = new THREE.Mesh(new THREE.PlaneGeometry(W - .06, 1.06), new THREE.MeshStandardMaterial({ color: 0x0b0e15, metalness: .5, roughness: .35, envMapIntensity: .5 }));
      back.position.set(0, sy, D / 2 + .012); root.add(back);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(W + .1, 1.0), new THREE.MeshBasicMaterial({ map: softTex(1.6), color: 0x8a6238, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.position.set(0, sy, D / 2 + .02); root.add(halo);
      const bar = new THREE.BoxGeometry(W - .06, .018, .03); [-.53, .53].forEach(dy => { const b = new THREE.Mesh(bar, neon(0xd9a45a)); b.position.set(0, sy + dy, D / 2 + .02); root.add(b); });
      if (HOTEL?.sign) {
        const geo = HOTEL.sign.geo; geo.computeBoundingBox(); const bb = geo.boundingBox, w = bb.max.x - bb.min.x, k = 2.95 / w;
        const letters = new THREE.Mesh(geo, HOTEL.sign.mat); letters.scale.setScalar(k); letters.position.set(-.98 - bb.min.x * k, sy - (bb.max.y + bb.min.y) / 2 * k, D / 2 + .07); root.add(letters);
        const side = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xb07a3c, toneMapped: false })); side.scale.setScalar(k); side.position.copy(letters.position); side.position.z -= .05; root.add(side);
      }
      { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 512; c.height = 414; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, 512, 414); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 414); const t = new THREE.CanvasTexture(c); t.anisotropy = 8; const m = new THREE.Mesh(new THREE.PlaneGeometry(.86, .69), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, color: 0xfff3df })); m.position.set(-1.5, sy, D / 2 + .075); m.material.fog = false; root.add(m); kick(); }; im.src = 'img/camel-mask.png'; }
    }
    // просвет короны: золотая световая щель на всю высоту
    [1, -1].forEach(sd => { const b = new THREE.Mesh(new THREE.PlaneGeometry(.26, crownN * FH - .1), neon(0xffbe62)); b.position.set(0, topY + crownN * FH / 2 + .05, sd * (D / 2 - .04)); if (sd < 0) b.rotation.y = Math.PI; root.add(b);
      const h = new THREE.Mesh(new THREE.PlaneGeometry(1.7, crownN * FH + .6), new THREE.MeshBasicMaterial({ map: softTex(2), color: 0xff9d3a, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); h.position.set(0, topY + crownN * FH / 2, sd * (D / 2 + .03)); if (sd < 0) h.rotation.y = Math.PI; root.add(h); });
    // ниша между башнями: панорамный лифт, кабина едет к выбранному этажу
    {
      const lx = (W / 2 + (VOL.C.x - VOL.C.w / 2)) / 2, lz = VOL.B.z + VOL.B.d / 2, y0 = podH * FH + .04, y1 = topB - .25, hh = y1 - y0;
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.5, hh), new THREE.MeshStandardMaterial({ color: 0x0d1119, metalness: .6, roughness: .3, envMapIntensity: .5 })); back.position.set(lx, y0 + hh / 2, lz + .012); root.add(back);
      const rails = [-.62, -.3, .3, .62].map(dx => { const g = new THREE.BoxGeometry(Math.abs(dx) > .5 ? .035 : .02, hh, .03); g.translate(lx + dx, y0 + hh / 2, lz + (Math.abs(dx) > .5 ? .05 : .16)); return g; });
      root.add(new THREE.Mesh(mergeGeos(rails), neon(0xc58a3e)));
      const ticks = []; for (let y = y0 + FH; y < y1; y += FH) { const g = new THREE.BoxGeometry(1.24, .012, .02); g.translate(lx, y, lz + .03); ticks.push(g); } root.add(new THREE.Mesh(mergeGeos(ticks), new THREE.MeshBasicMaterial({ color: 0x3a2c1e })));
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, hh), new THREE.MeshBasicMaterial({ map: softTex(1), color: 0x6a3f16, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); glow.position.set(lx, y0 + hh / 2, lz + .02); root.add(glow);
      lift = new THREE.Group(); lift.position.set(lx, lift0 ?? y0 + .3, lz + .2); lift.userData = { y0: y0 + .3, y1: y1 - .4 }; lift0 = null;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(.56, .5, .3), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })), cap = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, metalness: .9, roughness: .35 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(.64, .06, .36), cap); top.position.y = .28; const bot = top.clone(); bot.position.y = -.28;
      const man = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .2, 3, 8), new THREE.MeshBasicMaterial({ color: 0x3a2416, toneMapped: false })); man.position.set(.1, -.09, .16); const man2 = man.clone(); man2.position.x = -.08;
      const aura = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ map: softTex(2.4), color: 0xffb45a, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); aura.position.z = .18;
      lift.add(cab, top, bot, man, man2, aura); root.add(lift);
    }
    // подсветка выбранного этажа: объёмная «световая оболочка» по реальному контуру этажа (hotelPath).
    // Френель — ярче у кромок, прозрачная в лоб — читается как свет вокруг этажа, а не плоская наклейка; покрывает те же видимые стороны, что и сам этаж.
    hl = new THREE.Group();
    const hlShellMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffc23a) }, uOp: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vVd; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vVd=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOp; varying vec3 vN; varying vec3 vVd; void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(vVd))),1.6); gl_FragColor=vec4(uColor*(0.28+f*1.7), uOp*(0.16+f*0.95)); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    });
    const hlShell = new THREE.Mesh(ringGeo(hotelPath(), FH * .86, 0, true), hlShellMat); hlShell.scale.set(1.052, 1, 1.052); hl.add(hlShell);
    // тонкий яркий кант по верхней и нижней кромке этажа — обтекает форму, задаёт границу
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const hlTrimBot = new THREE.Mesh(ringGeo(hotelPath(), .06, -.02, true), trimMat); hlTrimBot.scale.set(1.058, 1, 1.058); hl.add(hlTrimBot);
    const hlTrimTop = new THREE.Mesh(ringGeo(hotelPath(), .06, FH * .86 - .04, true), trimMat); hlTrimTop.scale.set(1.058, 1, 1.058); hl.add(hlTrimTop);
    hl.userData.shell = hlShellMat; hl.userData.trim = trimMat;
    root.add(hl);
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
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffe7a0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); star.scale.set(1.4, 1.4, 1); star.position.set(1.2, crownTop + 3.6, -.9); garland.add(star);
    // подсветка фасада с крыши подиума: лучи вверх по стеклу, фиолетовые и золотые через один
    [-1.75, -.6, .6, 1.75].forEach(x => { const b = new THREE.Mesh(beamGeo(.05, .5, 5.5), beamMat(0xffcf98, .28, 2)); b.position.set(x, podH * FH, D / 2 + .22); b.rotation.x = -.06; root.add(b); });
    [-.9, .9].forEach(dx => { const b = new THREE.Mesh(beamGeo(.05, .45, 4.5), beamMat(0xffcf98, .28, 2)); b.position.set(VOL.C.x + dx, podH * FH, VOL.C.z + VOL.C.d / 2 + .2); b.rotation.x = -.06; root.add(b); });
    // два прожектора с крыши медленно обходят небо
    searchBeams = [[1.3, -.7, 0], [-1.6, .8, Math.PI]].map(([x, z, ph]) => { const piv = new THREE.Group(); piv.position.set(x, topY + 5 * FH + .5, z); piv.userData.ph = ph; const b = new THREE.Mesh(beamGeo(.07, 2.6, 70), beamMat(0xe8dcff, .17, 1.4)); b.rotation.z = .42; piv.add(b); root.add(piv); return piv; });
    root.traverse(o => [].concat(o.material || []).forEach(m => { if ('fog' in m) m.fog = false; })); // дымка прячет город, но не сам отель
    applyWx(); relight();
    root.position.y = GROUND; world.position.y = 0;
    if (BAKE.shadow && !HOTEL) root.add(shadowM ??= contactShadow());
    built = JSON.stringify(rooms.map(r => [r.id, r.floor])) + venueKey();
  }
  const venueKey = () => JSON.stringify(venues.map(v => [v.id, v.floor, v.kind]));
  let hiRoom = null, hovRoom = null, rotTarget = null;
  function retexture(rooms, only) { hotel.forEach(m => { if (only != null && m.userData.floor !== only) return; floorCanvas(rooms.filter(r => r.floor === m.userData.floor), 0, hiRoom, hovRoom, dim, m.material.map); }); }
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
  let wantRooms = null, assetsIn = false;
  function update(rooms, floor) {
    wantRooms = [rooms, floor]; if (!assetsIn) { curRooms = rooms; sel = floor; return; } // собираем здание один раз, когда всё приехало
    const k = JSON.stringify(rooms.map(r => [r.id, r.floor])) + venueKey();
    if (k !== built) build(rooms); else if (rooms.map(r => r.status).join() !== curRooms.map(r => r.status).join()) retexture(rooms);
    curRooms = rooms; sel = floor;
    const fm = hotel.find(m => m.userData.floor === sel); camTargetY = fm ? fm.position.y + root.position.y : topY * .5;
    if (fm && hl) { hl.position.y = fm.position.y - FH * .01; hl.scale.setScalar(fm.userData.s); }
    kick();
  }

  // ---------- управление ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), el = renderer.domElement, tip = host.querySelector('.tip');
  let zk = 1, spun = 0, drag = null, rotY = 0.55, vel = 0, idle = 3, hover = null, pitch = 0, pitchT = 0;
  const pick = e => { const r = el.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam); const o = ray.intersectObjects([...hotel, ...venueMeshes], false)[0]?.object; return o ? (o.userData.venue ? { venue: o.userData.venue } : o.userData.floor) : null; };
  el.addEventListener('pointerdown', e => { rotTarget = null; grab(); drag = { x: e.clientX, y: e.clientY, rot: rotY, p: pitchT, moved: false, last: e.clientX, at: e.timeStamp }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; const dv = (e.clientX - drag.last) * .005, ms = Math.max(1, e.timeStamp - drag.at); vel += (dv / ms * 1000 - vel) * (1 - Math.exp(-ms / 60)); drag.at = e.timeStamp; spun += Math.abs(dv); if (spun > Math.PI * 6 && onSpin) { onSpin(); onSpin = null; } drag.last = e.clientX; rotY = drag.rot + dx * 0.005; if (e.pointerType !== 'touch') pitchT = Math.max(-1, Math.min(1, drag.p + dy * 0.004)); idle = 0; kick(); return; }
    const got = pick(e), v = got?.venue || null, f = v ? null : got;
    if (v !== hoverV) { hoverV = v; kick(); }
    if (f !== hover) { hover = f; onHoverFloor?.(f); kick(); }
    el.style.cursor = f !== null || v ? 'pointer' : 'grab';
    if (tip && v) { const r = host.getBoundingClientRect(); tip.textContent = `${v.floor > 4 ? v.floor + ' этаж · ' : ''}${v.name}${v.label ? ' · ' + v.label : ''}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1; }
    else if (tip) { if (f !== null) { const fr = curRooms.filter(r => r.floor === f), r = host.getBoundingClientRect(); tip.textContent = `${f} этаж · свободно ${fr.filter(x => x.status === 'free').length} из ${fr.length}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1; } else tip.style.opacity = 0; }
  });
  el.addEventListener('pointerup', e => { if (drag && !drag.moved) { const f = pick(e); if (f?.venue) onPickVenue?.(f.venue.id); else if (f !== null) onPick?.(f); } if (drag && (!drag.moved || RM || e.timeStamp - drag.at > 70)) vel = 0; vel = Math.max(-2.4, Math.min(2.4, vel)); drag = null; kick(); });
  el.addEventListener('pointercancel', () => { drag = null; vel = 0; });
  el.addEventListener('pointerleave', () => { if (hover !== null) onHoverFloor?.(null); hover = null; if (tip) tip.style.opacity = 0; });

  const C = { yaw: { v: .55, s: 0 }, y: { v: 0, s: 0 }, pitch: { v: 0, s: 0 }, zoom: { v: 1, s: 0 }, el: { v: .2, s: 0 }, look: { v: 11, s: 0 }, off: { v: 0, s: 0 } };
  // взяли башню рукой: камера остаётся ровно там, где была, — накопленный дрейф и наклон за курсором не сбрасываются рывком
  function grab() { rotY = C.yaw.v + C.off.v; C.yaw.v = rotY; C.yaw.s = C.off.v = C.off.s = 0; vel = 0; glide = false; }
  let glide = false, mqx = 0, mqy = 0; let swing = 0, introT = 1e9, mx = 0, my = 0;
  el.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' && !drag) { const r = el.getBoundingClientRect(); mx = -((e.clientX - r.left) / r.width * 2 - 1); my = (e.clientY - r.top) / r.height * 2 - 1; } }); el.addEventListener('pointerleave', () => { mx = my = 0; });
  let active = false, visible = true, raf = 0, last = performance.now(), camY = 0, first = true, travelling = false;
  let RM = document.documentElement.classList.contains('calm'); document.addEventListener('mhc-calm', e => { RM = e.detail; kick(); });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(host);
  function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); kick(); }
  new ResizeObserver(size).observe(host);
  let ready = false;
  function kick() { if (!raf && active && visible && ready) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  let odd = 0, prevT = 0, ftSum = 0, ftN = 0, lite = false;
  function liteCity() { lite = true; cityM.userData.uniforms.uHasFac.value = 0; roofKit.forEach(m => { m.visible = false; }); roofs.visible = true; }
  function loop(t) {
    raf = 0;
    const ft = t - prevT; prevT = t;
    // каждые ~2 с смотрим среднее время кадра: сначала снижаем чёткость, а если и на минимальной медленно —
    // облегчённый город (простые фасады, без кровельных деталей). Только вниз, без скачков туда-обратно
    if (ft > 0 && ft < 1500) { ftSum += ft; ftN++; if (ftSum > 2000 && ftN >= 8) { const avg = ftSum / ftN;
      if (drag || Math.abs(vel) > .05) { /* чёткость не меняем посреди движения */ } else if (avg > 26 && dpr > 1) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); size(); } else if (avg > 40 && !lite) liteCity();
      ftSum = ftN = 0; } }
    // в покое рисуем 30 кадров в секунду: машины и огни плывут так же плавно, а нагрузка на видеокарту вдвое ниже
    const calm = !drag && rotTarget == null && Math.abs(vel) < .02 && (coarse || ft < 9) && Math.abs(C.yaw.s) + Math.abs(C.off.s) < .12 && Math.abs(C.y.s) < .02 && Math.abs(C.zoom.s) < .01 && introT > 3.5 && !rain.visible && !snow.visible;
    if (calm && (odd ^= 1)) { if (active && visible) raf = requestAnimationFrame(loop); return; }
    const dt = Math.max(0, Math.min(0.05, (t - last) / 1000)); last = t;
    // камера: пружины вместо линейного подъезда, дуга при смене этажа, наезд с изменением угла зрения, лёгкий крен и отклик на курсор
    const now = t / 1000, ease = RM ? .05 : 1;
    if (first) { camY = camTargetY; C.y.v = camY; C.yaw.v = rotY; first = false; }
    if (!drag) { const f = Math.exp(-dt * 3.2); rotY += vel * (1 - f) / 3.2; vel *= f; if (Math.abs(vel) < .002) vel = 0; idle += dt; } else idle = 0;
    if (rotTarget != null) { rotY = C.yaw.v + Math.atan2(Math.sin(rotTarget - C.yaw.v), Math.cos(rotTarget - C.yaw.v)); rotTarget = null; glide = true; }
    const gap = camTargetY - C.y.v, moving = RM ? 0 : Math.min(1, Math.abs(gap) / 3);
    if (Math.abs(gap) > .3) { if (!travelling) { travelling = true; swing = Math.sign(gap) * (Math.sin(rotY) > 0 ? -1 : 1) * Math.min(.3, .08 + Math.abs(gap) * .03); } } else if (travelling && Math.abs(gap) < .06) travelling = false;
    camY = damp(C.y, camTargetY, .62 * ease, dt); pitch = damp(C.pitch, pitchT, .3 * ease, dt);
    const drift = RM || drag || hiRoom ? 0 : Math.min(1, Math.max(0, idle - 2.5) / 4);       // в покое камера «дышит», а не крутится каруселью
    mqx += (mx - mqx) * (1 - Math.exp(-dt * 4)); mqy += (my - mqy) * (1 - Math.exp(-dt * 4));
    // поворот рукой и медленные добавки (дрейф, дуга при смене этажа, отклик на курсор) — две разные пружины: ни одна не дёргает другую
    const yaw = damp(C.yaw, rotY, (glide ? .75 : .16) * ease, dt) + (drag ? C.off.v : damp(C.off, RM ? 0 : (travelling ? swing * moving : 0) + drift * Math.sin(Math.max(0, idle - 2.5) * .13) * .34 + mqx * .05, .9, dt));
    const z = damp(C.zoom, (hiRoom ? .46 : 1) + (hiRoom ? .05 : .1) * moving + drift * Math.sin(now * .17) * .03, .7 * ease, dt); zk = z;
    const el2 = damp(C.el, .2 + pitch * .2 - Math.sign(gap) * moving * .07 + drift * Math.sin(now * .11 + 1) * .035 + mqy * .03, .55 * ease, dt);
    const wide = Math.max(0, Math.min(1, (z - .46) / .54)) * .85;
    let dist = (cam.aspect < 0.8 ? 58 : cam.aspect < 1.2 ? 49 : 43) * z, ly = damp(C.look, (camY + 1.2) * (1 - wide) + topY * .55 * wide, .4 * ease, dt), lxx = 1.6 * wide, yw = yaw, e2 = el2, fov = 32 - (1 - wide) * 4;
    introT += dt; const it = Math.min(1, introT / 3.4);                                        // первое появление: кран от площади вверх к общему плану
    if (it < 1) { const k = 1 - Math.pow(1 - it, 3.2), q = 1 - k; dist *= 1 - .52 * q; ly -= (ly - 3) * q * .9; yw -= .85 * q; e2 -= .1 * q; fov += 12 * q; }
    if (Math.abs(cam.fov - fov) > .01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.set(lxx + Math.sin(yw) * dist * Math.cos(e2), Math.max(GROUND + 1.2, ly + 1.5 + Math.sin(e2) * dist), Math.cos(yw) * dist * Math.cos(e2)); cam.lookAt(lxx, ly, 0); sky.position.copy(cam.position); haze.position.copy(cam.position);
    SINK.uCamP.value.set(cam.position.x, cam.position.y - GROUND, cam.position.z); sinkers.forEach(k => { k.g.scale.y = Math.max(.02, sinkJs(k.x, k.z, k.h) / k.h); });
    venueMeshes.forEach(m => { const L = m.userData.light, t2 = hoverV === m.userData.venue ? 1.2 : .85; if (L.emissiveIntensity != null) L.emissiveIntensity += (t2 - L.emissiveIntensity) * Math.min(1, dt * 8); else L.opacity += ((hoverV === m.userData.venue ? .95 : .55) - L.opacity) * Math.min(1, dt * 8); });
    // фокус на выбранном этаже: он горит ярче, а остальные приглушаются (как подсветка выбора на топовых 3D-сайтах)
    floors.forEach(m => { const on = m.userData.floor === sel, hv = m.userData.floor === hover; const target = on ? 1.25 : hv && m.userData.hotel ? 1.18 : m.userData.hotel ? .95 : officeK; m.material.emissiveIntensity += (target - m.material.emissiveIntensity) * Math.min(1, dt * 8); const sc = on ? 1.04 : 1; m.scale.x += (sc - m.scale.x) * Math.min(1, dt * 8); m.scale.z = m.scale.x; m.userData.slab?.scale.set(m.scale.x, 1, m.scale.x); });
    if (hl) { const vis = sel !== null ? 1 : 0, pz = .94 + .06 * Math.sin(t / 900); const s = hl.userData.shell.uniforms.uOp; s.value += (vis * pz - s.value) * Math.min(1, dt * 6); hl.userData.trim.opacity += (vis * pz * .85 - hl.userData.trim.opacity) * Math.min(1, dt * 6); }
    if (lift) { const u = lift.userData, fm = hotel.find(m => m.userData.floor === sel), ty = Math.max(u.y0, Math.min(u.y1, fm ? fm.position.y + FH * .45 : u.y0)); lift.position.y += (ty - lift.position.y) * Math.min(1, dt * 1.8); }
    if (beacon) beacon.material.color.setHSL(0.05, .9, 0.42 + Math.max(0, Math.sin(t / 420)) * 0.18);
    beacons.material.opacity = .55 + .45 * Math.sin(t / 500);
    const s = t / 1000; if (traffic) traffic.material.uniforms.uT.value = s % 100000;
    far.uT.value = s % 100000; if (!RM) WATER_T.value = s % 1000; flyAir(s); clouds.rotation.y = s * 0.004; skyU.uTime.value = s; searchBeams.forEach(p => { p.rotation.y = s * .22 + p.userData.ph; });
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
  assets.then(async ([, K]) => { // текстуры и модели параллельно — башня пересобирается один раз
    if (K) cityRoofs(K); await breathe();
    const eq = img => { const t = new THREE.Texture(img); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; const r = pm.fromEquirectangular(t).texture; t.dispose(); return r; };
    if (BAKE['env-night']) { const night = eq(BAKE['env-night']); envBake = { night, day: BAKE['env-day'] ? eq(BAKE['env-day']) : envRoom }; } await breathe();
    if (BAKE['city-fac']) { const t = new THREE.Texture(BAKE['city-fac']); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.needsUpdate = true; cityM.userData.uniforms.uFac.value = t; cityM.userData.uniforms.uHasFac.value = lite ? 0 : 1; }
    // стеклянные ориентиры города получают тот же фасад
    const gi = cityAtlas.glass.image, li = cityAtlas.lit.image; paintBake(gi.getContext('2d'), li.getContext('2d'));
    world.traverse(o => [].concat(o.material || []).forEach(m => [m.map, m.emissiveMap].forEach(t => { if (t && (t.image === gi || t.image === li)) t.needsUpdate = true; })));
    { const ft = facadeTex(); if (ft) landmarkMats.forEach(m => { const z = m.userData.size; if (!z) return; const put = t => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(Math.max(1, Math.round(z[0] / 3.78)), z[1] / 3.68); c.needsUpdate = true; return c; }; m.map = put(ft.glass); m.emissiveMap = put(ft.lit); m.color.set(0xffffff); m.metalness = .15; m.roughness = .75; m.envMapIntensity = .25; m.needsUpdate = true; }); }
    assetsIn = true; await breathe();
    if (wantRooms) update(...wantRooms); else relight();
    await prepare();
  }).catch(e => { console.warn('tower', e); assetsIn = true; if (wantRooms) update(...wantRooms); prepare(); });
  // первый кадр показываем, когда шейдеры собраны, а текстуры уже на видеокарте — иначе он замирал на секунду
  async function prepare() {
    size(); const tex = new Set(); scene.traverse(o => [].concat(o.material || []).forEach(m => { ['map', 'emissiveMap', 'alphaMap'].forEach(k => m[k]?.image && tex.add(m[k])); }));
    try { await renderer.compileAsync?.(scene, cam); } catch { }
    for (const t of tex) { renderer.initTexture(t); await breathe(); }
    ready = true; last = performance.now(); introT = RM ? 1e9 : 0; kick(); renderer.domElement.style.opacity = 1;
  }
  function relight() {
    const day = document.documentElement.dataset.mode === 'day' ? 1 : 0;
    skyU.uDay.value = day; ground.material.uniforms.uDay.value = day; cityM.userData.uniforms.uDay.value = day; cityM.userData.uniforms.uLit.value = day ? .12 : .27;
    if (day) fogCol.set(0xd9c49a); else fogCol.setRGB(.105, .06, .145, THREE.SRGBColorSpace); skyU.uFog.value.copy(fogCol).convertLinearToSRGB(); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); scene.fog.density = (day ? .012 : .0135) * ({ fog: 1.9, rain: 1.2, snow: 1.3 }[wx?.kind] || 1);
    if (wx?.kind === 'rain' || wx?.kind === 'fog') { fogCol.lerp(day ? new THREE.Color(0x9a948c) : new THREE.Color().setRGB(.1, .075, .115, THREE.SRGBColorSpace), .55); skyU.uFog.value.copy(fogCol).convertLinearToSRGB(); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); }
    if (wx?.kind === 'snow') { fogCol.lerp(day ? new THREE.Color(0xe6e1d8) : new THREE.Color().setRGB(.24, .21, .27, THREE.SRGBColorSpace), .5); skyU.uFog.value.copy(fogCol).convertLinearToSRGB(); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); }
    rain.material.color.set(day ? 0x8f8a84 : 0xd8d2c8);
    const cityEnv = envBake ? (day ? envBake.day : envBake.night) : null;
    world.traverse(o => { if (o.isMesh || o.isInstancedMesh) [].concat(o.material).forEach(m => { if (m?.isMeshStandardMaterial) { m.userData.env0 ??= m.envMapIntensity; m.envMapIntensity = m.userData.env0 * (day ? 1 : .25); } }); });
    hemi.intensity = day ? 1.6 : .42; hemi.color.set(day ? 0xf2e2c8 : 0x6a58b0); hemi.groundColor.set(day ? 0x1a120a : 0x120a10); key.intensity = day ? 2.8 : .75; cityM.roughness = day ? .55 : .9; cityM.metalness = day ? .35 : .1; stone.roughness = day ? .6 : .9; key.color.set(day ? 0xfff0d8 : 0xaab6ff); if (!day) key.position.copy(MOON).multiplyScalar(30);
    cityM.color.set(day ? 0x6a5f5c : 0x1f1517); far.uK.value = day ? .25 : 1; copter.visible = !day;
    cloudMats.forEach(m => m.color.set(day ? 0xfff3dc : 0x4a3460)); lamps.visible = true; lamps.material.opacity = day ? .25 : 1; traffic.material.uniforms.uK.value = day ? .35 : 1;
    rim.intensity = day ? 6 : 1.5; rim2.intensity = day ? 30 : 3; officeK = day ? .16 : .6; ledM?.color.set(day ? 0x39c6e6 : 0xb766ff); if (crownLit) crownLit.material.emissiveIntensity = day ? 0 : .32; landmarkMats.forEach(m => { m.emissiveIntensity = day ? .04 : m.userData.size ? .3 : .5; m.emissive.set(day ? 0xffffff : 0xe2cbe0); m.color.set(day ? 0xffffff : m.userData.size ? 0x5d4f6a : 0x332c40); }); if (shadowM) shadowM.material.opacity = day ? .62 : .38; KIT?.mat.color.set(day ? 0xffffff : 0x5a5560); officeMats.forEach(m => { m.emissiveIntensity = day ? .04 : .9; m.color.set(day ? 0xffffff : 0x4a5562); m.metalness = day ? .45 : .85; m.envMapIntensity = day ? 1.6 : cityEnv ? 1.2 : .5; if (m.envMap !== cityEnv) { m.envMap = cityEnv; m.needsUpdate = true; } }); hotel.forEach(f => { if (f.material.envMap !== cityEnv) { f.material.envMap = cityEnv; f.material.needsUpdate = true; } });  if (shopM) shopM.opacity = day ? .12 : .55;  kick();
  }
  relight(); size();
  function setVenues(list) { const before = venueKey(); venues = list || []; if (venueKey() !== before && curRooms.length && assetsIn) { build(curRooms); update(curRooms, sel); } else venueMeshes.forEach(m => { const nv = venues.find(x => x.id === m.userData.venue.id); if (nv) m.userData.venue = nv; }); kick(); }
  return { setVenues, setWeather(w) { if (!w || (w.kind === wx.kind && w.newyear === wx.newyear)) return; wx = { kind: w.kind, newyear: w.newyear }; applyWx(); }, update, focusRoom, hoverRoom, setFilter(ids) { const next = ids ? new Set(curRooms.filter(r => !ids.has(r.id)).map(r => r.id)) : null; if (String([...(next || [])]) === String([...(dim || [])])) return; dim = next; retexture(curRooms); kick(); }, hoverFloor(f) { if (f !== hover) { hover = f; kick(); } }, active(on) { active = on; if (on) { size(); kick(); } }, relight };
}
