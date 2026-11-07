import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
// Башня Mile High Club в центре Лос-Сантоса, как в игре: стеклянная прямоугольная башня с крылом,
// фиолетовые светодиоды по рёбрам и вывеска с верблюдом. Этажи отеля горят по статусам номеров.
// Вокруг — даунтаун: кварталы, дороги с машинами, фонари, холмы, дымка и облака,
// которые прячут дальний план, чтобы внимание оставалось на отеле.
const STATUS = { free: '#f7b50a', booked: '#f0177a', occupied: '#ef5617', cleaning: '#3a2c2e', repair: '#3a2c2e' };
const FH = 0.46, W = 4.6, D = 3.2, COLS = 56;

// --- геометрия «кольца» этажа: стены по контуру, U идёт по периметру (окна не растягиваются) ---
function outline(s) {
  const w = W * s / 2, d = D * s / 2;
  return [[-w, d], [w, d], [w, -d], [-w, -d]];
}
function ringGeo(pts, h, y0 = 0) {
  const n = pts.length, len = []; let tot = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); len.push(l); tot += l; }
  const pos = [], uv = [], nor = [], idx = []; let acc = 0;
  for (let i = 0; i < n; i++) {
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
    g.fillStyle = gr; g.fillRect(i * cw + 5, 8, cw - 11, 48); g.globalAlpha = 1;
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
  m.userData.uniforms = { uLit: { value: 0.35 }, uDay: { value: 0 }, uSnow: { value: 0 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;varying vec3 vN;varying float vId;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp4=instanceMatrix*vec4(position,1.);vWp=wp4.xyz;vN=normalize(mat3(instanceMatrix)*normal);vId=float(gl_InstanceID);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit,uDay,uSnow;varying vec3 vWp;varying vec3 vN;varying float vId;\nfloat h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if(abs(vN.y)<.5){
        float u=abs(vN.x)>abs(vN.z)?vWp.z:vWp.x; vec2 g=vec2(u/.34,vWp.y/.42); vec2 id=floor(g), f=fract(g);
        float aa=clamp(1.6-max(fwidth(g.x),fwidth(g.y))*2.2,0.,1.); // вдали окна сливаются в ровный тон без ряби
        float win=step(.18,f.x)*step(f.x,.82)*step(.2,f.y)*step(f.y,.78)*aa;
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

export function mountTower(host, { onPick, onSpin, onHoverFloor }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0x2a1f24); scene.fog = new THREE.FogExp2(fogCol, 0.021); scene.background = fogCol.clone();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(32, 1, 0.2, 400);
  const hemi = new THREE.HemisphereLight(0xf2e2c8, 0x1a120a, 0.55), key = new THREE.DirectionalLight(0xffcf98, 1.5), rim = new THREE.PointLight(0xd9822b, 22, 30, 1.6), rim2 = new THREE.PointLight(0xf7b50a, 30, 40, 1.6);
  key.position.set(-14, 22, 12); rim.position.set(-8, 22, -8); rim2.position.set(9, 2, -8); scene.add(hemi, key, rim, rim2);

  // небо: закатный градиент из цветов логотипа, всегда закрывает фон
  const skyU = { uDay: { value: 0 }, uFog: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uDay;uniform vec3 uFog;varying vec3 vP;void main(){float h=vP.y;
      vec3 top=mix(vec3(.035,.07,.075),vec3(.36,.5,.5),uDay), mid=mix(vec3(.16,.12,.14),vec3(.86,.78,.62),uDay), hor=mix(mix(uFog,vec3(.62,.25,.2),.55),vec3(.98,.82,.55),uDay);
      vec3 c=mix(hor,mid,smoothstep(.04,.16,h)); c=mix(c,top,smoothstep(.14,.55,h)); c=mix(uFog,c,smoothstep(-.02,.08,h)); // у горизонта небо = цвет дымки, город растворяется без границы
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
  const cityM = cityMaterial();
  const lots = []; seedN = 11;
  for (let gx = -9; gx <= 9; gx++) for (let gz = -9; gz <= 9; gz++) {
    const cx = gx * BLOCK, cz = gz * BLOCK, d = Math.hypot(cx, cz); if (d < 4) continue; // квартал отеля — площадь
    // в квартале 1–4 здания
    const parts = d < 48 ? (rnd() < .5 ? 2 : 4) : (rnd() < .5 ? 1 : 2), inner = BLOCK - ROAD - 0.9;
    for (let k = 0; k < parts; k++) {
      const sw = parts === 4 ? inner / 2 - .2 : parts === 2 ? inner : inner, sd = parts === 4 ? inner / 2 - .2 : parts === 2 ? inner / 2 - .2 : inner;
      const ox = parts === 4 ? (k % 2 ? 1 : -1) * (inner / 4 + .05) : 0, oz = parts >= 2 ? (k < parts / 2 ? -1 : 1) * (inner / 4 + .05) : 0;
      const tall = d < 42 ? 0.8 + rnd() * 2.6 : d < 62 ? 4 + rnd() * 9 : d < 80 ? 2.5 + rnd() * 7 : 1.5 + rnd() * 4; // рядом с отелем — низкая застройка, чтобы камера облетала свободно
      lots.push({ x: cx + ox, z: cz + oz, w: sw * (.75 + rnd() * .25), d: sd * (.75 + rnd() * .25), h: tall });
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const tiers = []; lots.forEach(l => { tiers.push(l); if (l.h > 8 && rnd() < .6) { const k = .62 + rnd() * .15; tiers.push({ x: l.x, z: l.z, w: l.w * k, d: l.d * k, h: l.h * (1.12 + rnd() * .18), top: true }); } });
  const city = new THREE.InstancedMesh(box, cityM, tiers.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
  tiers.forEach((t, i) => { M.compose(V.set(t.x, GROUND, t.z), Q, Sc.set(t.w, t.h, t.d)); city.setMatrixAt(i, M); }); world.add(city);
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
  let wingFloors = [], officeK = .6; // днём офисные окна почти не светятся, стекло отражает небо
  let snowCaps = null, garland = null, garlandBase = null, floors = [], hotel = [], sel = null, curRooms = [], built = '', topY = 0, camTargetY = 0, beacon = null, hl = null;
  // Здание как в игре: прямая стеклянная башня с вертолётной площадкой, рядом башня-крыло пониже,
  // неоновые светодиоды по вертикальным рёбрам, вывеска с верблюдом наверху, подиум с козырьком,
  // баннер на крыле и решётчатые пилоны на площади. Этажи отеля в основной башне горят по статусам номеров.
  const WING = { x: 4.05, z: -0.75, w: 3.7, d: 3.1, k: .84 }; // крыло справа и чуть утоплено, высота от основной башни
  const rect = (cx, cz, w, d) => [[cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2], [cx + w / 2, cz - d / 2], [cx - w / 2, cz - d / 2]];
  const wingPts = s => rect(WING.x, WING.z, WING.w * s, WING.d * s);
  const setbackAt = () => 1;
  function build(rooms) {
    root.traverse(o => { if (o.isMesh) { o.geometry?.dispose?.(); if (o.material?.map) o.material.map.dispose(); } }); root.clear(); floors = []; hotel = []; wingFloors = [];
    const hF = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b), maxF = hF.at(-1) ?? 26;
    const base = 1, total = Math.max(44, maxF + 12), n = total - base + 1;
    const office = [0.18, 0.32, 0.45].map((m, i) => { seedN = 100 + i * 17; return floorCanvas(null, m); });
    const podH = 4, steel = new THREE.MeshStandardMaterial({ color: 0x2b333c, metalness: .8, roughness: .35 });
    for (let i = 0; i < n; i++) {
      const f = base + i, y = i * FH, isHotel = hF.includes(f);
      const mat = isHotel ? emis(floorCanvas(rooms.filter(r => r.floor === f), 0, null, null, dim), 1) : emis(office[i % 3], 0.5);
      const m = new THREE.Mesh(ringGeo(outline(1), FH * .86), mat); m.position.y = y; m.userData = { floor: f, hotel: isHotel, s: 1 };
      root.add(m); floors.push(m); if (isHotel) hotel.push(m);
      const sl = new THREE.Mesh(slabGeo(outline(1.006), FH * .14), steel); sl.position.y = y + FH * .86; root.add(sl); m.userData.slab = sl;
      if (i < podH) m.visible = false;
    }
    topY = n * FH;
    // крыло: те же этажи, но без номеров отеля и без выбора
    const wn = Math.round(n * WING.k), wingTop = wn * FH;
    for (let i = podH; i < wn; i++) {
      const m = new THREE.Mesh(ringGeo(wingPts(1), FH * .86), emis(office[(i + 1) % 3], officeK * .8)); m.position.y = i * FH; root.add(m); wingFloors.push(m);
      const sl = new THREE.Mesh(slabGeo(wingPts(1.006), FH * .14), steel); sl.position.y = i * FH + FH * .86; root.add(sl);
    }
    // крыши: парапет, вертолётная площадка на основной, техэтаж и антенна с маяком на крыле
    const roofM = new THREE.MeshStandardMaterial({ color: 0x1b2128, metalness: .4, roughness: .7 });
    const roof = new THREE.Mesh(slabGeo(outline(1.01), .22), roofM); roof.position.y = topY; root.add(roof);
    const wroof = new THREE.Mesh(slabGeo(wingPts(1.01), .22), roofM); wroof.position.y = wingTop; root.add(wroof);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, .1, 48), new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: .6 })); pad.position.set(-.6, topY + .3, .2); root.add(pad);
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, .05, 6, 64), steel); padRing.rotation.x = Math.PI / 2; padRing.position.set(-.6, topY + .36, .2); root.add(padRing);
    [[-1.2, -.3], [0, -.3], [-.6, .75]].forEach(([dx, dz]) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .3, 8), steel); leg.position.set(-.6 + dx * .7, topY + .15, .2 + dz); root.add(leg); });
    const mech = new THREE.Mesh(new THREE.BoxGeometry(1.4, .5, 1), roofM); mech.position.set(1.4, topY + .47, -.7); root.add(mech);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.025, .06, 1.6, 8), steel); mast.position.set(WING.x + 1.2, wingTop + 1, WING.z - .8); root.add(mast);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(.08, 16, 12), neon(0xef5617)); beacon.position.set(WING.x + 1.2, wingTop + 1.85, WING.z - .8); root.add(beacon);
    // неоновые светодиоды по вертикальным рёбрам: точки, как в игре
    const led = [], ledLine = [];
    const edges = [...outline(1.012).map(p => [p, topY + .2]), ...[wingPts(1.012)[1], wingPts(1.012)[2], wingPts(1.012)[3]].map(p => [p, wingTop + .2])];
    edges.forEach(([[x, z], top]) => { for (let y = podH * FH; y < top; y += .14) led.push(x, y, z); ledLine.push(x, podH * FH, z, x, top, z); });
    const ledG = new THREE.BufferGeometry(); ledG.setAttribute('position', new THREE.Float32BufferAttribute(led, 3));
    const leds = new THREE.Points(ledG, new THREE.PointsMaterial({ map: dotTex, color: 0xc070ff, size: .6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); root.add(leds);
    const ledM = neon(0x9d45ff); // сама светодиодная лента: тонкий яркий брус по ребру
    for (let i = 0; i < ledLine.length; i += 6) { const h = ledLine[i + 4] - ledLine[i + 1], bar = new THREE.Mesh(new THREE.BoxGeometry(.07, h, .07), ledM); bar.position.set(ledLine[i], ledLine[i + 1] + h / 2, ledLine[i + 2]); root.add(bar); }
    // вывеска «The Mile High Club» с верблюдом под крышей фасада
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 160; const sg = sc.getContext('2d');
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    const drawSign = img => { sg.clearRect(0, 0, 1024, 160); sg.shadowColor = 'rgba(255,240,215,.9)'; sg.shadowBlur = 14; sg.fillStyle = '#fffaf0'; sg.font = '500 82px "Times New Roman", Georgia, serif'; sg.textBaseline = 'middle'; sg.fillText('The Mile High Club', 200, 86); if (img) sg.drawImage(img, 18, 8, 168, 136); st.needsUpdate = true; };
    drawSign(null); { const im = new Image(); im.onload = () => { drawSign(im); kick(); }; im.src = 'img/camel-mask.png'; }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, .69), new THREE.MeshBasicMaterial({ map: st, transparent: true, toneMapped: false, depthWrite: false })); sign.position.set(-.1, topY - 1.1, D / 2 + .03); root.add(sign);
    // подиум: светлый камень, стеклянное лобби, изогнутый белый козырёк и табличка у входа
    const podM = new THREE.MeshStandardMaterial({ color: 0x8c8780, metalness: .1, roughness: .8 });
    const pod = new THREE.Mesh(slabGeo([[-W / 2 - .3, D / 2 + .25], [WING.x + WING.w / 2 + .2, D / 2 + .25], [WING.x + WING.w / 2 + .2, WING.z - WING.d / 2 - .2], [-W / 2 - .3, -D / 2 - .3]], podH * FH - .05), podM); root.add(pod);
    const lob = new THREE.Mesh(ringGeo(rect(1.2, .1, W + 3.4, D + 1.1), FH * 1.6), neon(0xffd9a0)); lob.material.transparent = true; lob.material.opacity = .45; lob.position.y = .12; root.add(lob);
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, .09, 48, 1, false, -.5, 1), new THREE.MeshStandardMaterial({ color: 0xe8e6e2, roughness: .5 })); canopy.position.set(WING.x - 1, FH * 2, D / 2 - 2.55); root.add(canopy);
    const plc = document.createElement('canvas'); plc.width = 512; plc.height = 96; const pg = plc.getContext('2d'); pg.fillStyle = '#2a2622'; pg.fillRect(0, 0, 512, 96); pg.fillStyle = '#e9dcc0'; pg.font = '500 58px "Times New Roman", Georgia, serif'; pg.textAlign = 'center'; pg.textBaseline = 'middle'; pg.fillText('Mile High Club', 256, 50);
    const plt = new THREE.CanvasTexture(plc); plt.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .45), new THREE.MeshBasicMaterial({ map: plt })); plate.position.set(WING.x + .6, FH * 1.1, D / 2 + .26); root.add(plate);
    // большой вертикальный баннер отеля на фасаде крыла
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 640; const bg = bc.getContext('2d');
    const bgr = bg.createLinearGradient(0, 0, 0, 640); bgr.addColorStop(0, '#59161e'); bgr.addColorStop(.6, '#8a1f3c'); bgr.addColorStop(1, '#f0177a'); bg.fillStyle = bgr; bg.fillRect(0, 0, 256, 640);
    bg.fillStyle = '#f9edc7'; bg.textAlign = 'center'; bg.font = '800 44px Unbounded, Inter, sans-serif'; bg.fillText('MILE', 128, 420); bg.fillText('HIGH', 128, 470); bg.fillText('CLUB', 128, 520); bg.font = '600 18px Inter, sans-serif'; bg.fillText('ОТЕЛЬ НАД ЛОС-САНТОСОМ', 128, 575);
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 5.25), new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: .55, roughness: .7 })); banner.position.set(WING.x, podH * FH + 3.3, WING.z + WING.d / 2 + .04); root.add(banner);
    { const im = new Image(); im.onload = () => { bg.globalCompositeOperation = 'source-over'; bg.drawImage(im, 38, 120, 180, 145); bt.needsUpdate = true; kick(); }; im.src = 'img/camel-mask.png'; }
    // решётчатые пилоны на площади с фиолетовыми экранами
    const truss = new THREE.LineBasicMaterial({ color: 0xd8dadc, transparent: true, opacity: .85 });
    const scr = document.createElement('canvas'); scr.width = 256; scr.height = 128; const sx = scr.getContext('2d'); sx.fillStyle = '#9b1fd8'; sx.fillRect(0, 0, 256, 128); sx.fillStyle = '#f7d44a'; sx.font = '800 50px Unbounded, Inter, sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('MHC', 128, 66);
    const scrT = new THREE.CanvasTexture(scr); scrT.colorSpace = THREE.SRGBColorSpace;
    [[WING.x + 2.6, D / 2 + 2.4], [WING.x + .4, D / 2 + 3.1], [-.6, D / 2 + 3.4]].forEach(([px, pz], j) => {
      const h = 3.6, b0 = .45, mid = .16, pts = [];
      for (let q = 0; q < 4; q++) { const a0 = q / 4 * Math.PI * 2 + Math.PI / 4, a1 = a0 + Math.PI / 2;
        const lo = [Math.cos(a0) * b0, 0, Math.sin(a0) * b0], md = [Math.cos(a0 + .6) * mid, h / 2, Math.sin(a0 + .6) * mid], hi = [Math.cos(a0) * b0, h, Math.sin(a0) * b0];
        pts.push(...lo, ...md, ...md, ...hi, ...lo, Math.cos(a1) * b0, 0, Math.sin(a1) * b0, ...hi, Math.cos(a1) * b0, h, Math.sin(a1) * b0); }
      for (let y = .5; y < h; y += .5) { const r = b0 - (b0 - mid) * (1 - Math.abs(y - h / 2) / (h / 2)); for (let q = 0; q < 4; q++) { const a0 = q / 4 * Math.PI * 2 + Math.PI / 4, a1 = a0 + Math.PI / 2; pts.push(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r); } }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const tw = new THREE.LineSegments(tg, truss); tw.position.set(px, 0, pz); root.add(tw);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, .5), new THREE.MeshBasicMaterial({ map: scrT, toneMapped: false, side: THREE.DoubleSide })); panel.position.set(px, 1.7 + j * .3, pz + .48); root.add(panel);
    });
    // площадь перед отелем
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(W + WING.w + 6, 5.5), new THREE.MeshStandardMaterial({ color: 0x5e5a56, roughness: .9 })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(1.2, .01, D / 2 + 2.7); root.add(plaza);
    // подсветка выбранного этажа: тонкое неоновое кольцо
    hl = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline(1.07).map(([x, z]) => new THREE.Vector3(x, 0, z))), new THREE.LineBasicMaterial({ color: 0xf7b50a, toneMapped: false, transparent: true, opacity: 0 })); root.add(hl);
    // снежные шапки на крышах, подиуме и козырьке (видны только в снег)
    snowCaps = new THREE.Group(); snowCaps.visible = false; root.add(snowCaps);
    const snowM = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: .9, metalness: 0 });
    [[outline(1.005), topY + .22], [wingPts(1.005), wingTop + .22]].forEach(([P, y]) => { const c = new THREE.Mesh(slabGeo(P, .07), snowM); c.position.y = y; snowCaps.add(c); });
    { const c = pod.clone(); c.material = snowM; c.scale.y = .08 / (podH * FH); c.position.y = podH * FH - .05; snowCaps.add(c); }
    // новогодние гирлянды: по краям крыш и вдоль светодиодов
    garland = new THREE.Group(); garland.visible = false; root.add(garland);
    const gp = [], gc = [], PAL = [[1, .71, .04], [.94, .09, .48], [.98, .93, .78], [.94, .34, .09]];
    const addPt = (x, y, z) => { gp.push(x, y, z); gc.push(...PAL[(gp.length / 3) % 4]); };
    [[outline(1.04), topY + .24], [wingPts(1.04), wingTop + .24]].forEach(([P, y]) => { for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]), k = Math.max(3, Math.round(L / .22)); for (let q = 0; q < k; q++) { const u = q / k; addPt(A[0] + (B[0] - A[0]) * u, y - Math.sin(u * Math.PI) * .22, A[1] + (B[1] - A[1]) * u); } } });
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    garlandBase = Float32Array.from(gc);
    garland.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: dotTex, vertexColors: true, size: .42, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffe7a0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); star.scale.set(1.6, 1.6, 1); star.position.set(WING.x + 1.2, wingTop + 1.9, WING.z - .8); garland.add(star);
    applyWx();
    root.position.y = GROUND; world.position.y = 0;
    built = JSON.stringify(rooms.map(r => [r.id, r.floor]));
  }
  let hiRoom = null, hovRoom = null, rotTarget = null;
  function retexture(rooms, only) { hotel.forEach(m => { if (only != null && m.userData.floor !== only) return; const t = floorCanvas(rooms.filter(r => r.floor === m.userData.floor), 0, hiRoom, hovRoom, dim); m.material.map.dispose(); m.material.map = t; m.material.emissiveMap = t; m.material.needsUpdate = true; }); }
  // направление «лицом к номеру»: позиция номера по периметру этажа -> угол камеры
  function roomAngle(id) {
    const r = curRooms.find(x => x.id === id); if (!r) return null; const fr = curRooms.filter(x => x.floor === r.floor), i = fr.indexOf(r), n = fr.length;
    const fm = hotel.find(m => m.userData.floor === r.floor); const P = outline(fm?.userData.s || 1), L = []; let tot = 0;
    for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(l); tot += l; }
    let u = (i + 0.5) / n * tot;
    for (let k = 0; k < P.length; k++) { if (u <= L[k]) { const a = P[k], b = P[(k + 1) % P.length], t = u / L[k]; return Math.atan2(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); } u -= L[k]; }
    return null;
  }
  function focusRoom(id) { const prev = curRooms.find(x => x.id === hiRoom)?.floor; hiRoom = id; const f = curRooms.find(x => x.id === id)?.floor; if (prev != null && prev !== f) retexture(curRooms, prev); if (f != null) retexture(curRooms, f); if (id) { const a = roomAngle(id); if (a != null) { rotTarget = a; idle = 0; vel = 0; } } kick(); }
  function hoverRoom(id) { if (id === hovRoom) return; const prev = curRooms.find(x => x.id === hovRoom)?.floor; hovRoom = id; const f = curRooms.find(x => x.id === id)?.floor; if (prev != null && prev !== f) retexture(curRooms, prev); if (f != null) retexture(curRooms, f); kick(); }
  function update(rooms, floor) {
    const k = JSON.stringify(rooms.map(r => [r.id, r.floor]));
    if (k !== built) build(rooms); else if (rooms.map(r => r.status).join() !== curRooms.map(r => r.status).join()) retexture(rooms);
    curRooms = rooms; sel = floor;
    const fm = hotel.find(m => m.userData.floor === sel); camTargetY = fm ? fm.position.y + root.position.y : topY * .5;
    if (fm && hl) { hl.position.y = fm.position.y + FH * .42; hl.scale.setScalar(fm.userData.s); }
    kick();
  }

  // ---------- управление ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), el = renderer.domElement, tip = host.querySelector('.tip');
  let zk = 1, spun = 0, drag = null, rotY = 0.55, vel = 0, idle = 3, hover = null, pitch = 0, pitchT = 0;
  const pick = e => { const r = el.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, cam); return ray.intersectObjects(hotel, false)[0]?.object.userData.floor ?? null; };
  el.addEventListener('pointerdown', e => { rotTarget = null; drag = { x: e.clientX, y: e.clientY, rot: rotY, p: pitchT, moved: false, last: e.clientX }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; vel = (e.clientX - drag.last) * 0.005; spun += Math.abs(vel); if (spun > Math.PI * 6 && onSpin) { onSpin(); onSpin = null; } drag.last = e.clientX; rotY = drag.rot + dx * 0.005; if (e.pointerType !== 'touch') pitchT = Math.max(-1, Math.min(1, drag.p + dy * 0.004)); idle = 0; kick(); return; }
    const f = pick(e); if (f !== hover) { hover = f; el.style.cursor = f !== null ? 'pointer' : 'grab'; onHoverFloor?.(f); kick(); }
    if (tip) { if (f !== null) { const fr = curRooms.filter(r => r.floor === f), r = host.getBoundingClientRect(); tip.textContent = `${f} этаж · свободно ${fr.filter(x => x.status === 'free').length} из ${fr.length}`; tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.opacity = 1; } else tip.style.opacity = 0; }
  });
  el.addEventListener('pointerup', e => { if (drag && !drag.moved) { const f = pick(e); if (f !== null) onPick?.(f); } drag = null; });
  el.addEventListener('pointerleave', () => { if (hover !== null) onHoverFloor?.(null); hover = null; if (tip) tip.style.opacity = 0; });

  let active = false, visible = true, raf = 0, last = performance.now(), camY = 0, first = true, travelling = false, arriveAt = 0;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(host);
  function size() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); kick(); }
  new ResizeObserver(size).observe(host);
  function kick() { if (!raf && active && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  let odd = 0;
  function loop(t) {
    raf = 0;
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
    floors.forEach(m => { const on = m.userData.floor === sel, hv = m.userData.floor === hover; const target = on ? 1.6 + pulse : hv && m.userData.hotel ? 1.25 : m.userData.hotel ? (sel !== null ? 0.75 : 1) : officeK; m.material.emissiveIntensity += (target - m.material.emissiveIntensity) * Math.min(1, dt * 8); const sc = on ? 1.035 : 1; m.scale.x += (sc - m.scale.x) * Math.min(1, dt * 8); m.scale.z = m.scale.x; m.userData.slab?.scale.set(m.scale.x, 1, m.scale.x); });
    if (hl) hl.material.opacity += ((sel !== null ? .9 : 0) - hl.material.opacity) * Math.min(1, dt * 6);
    if (beacon) beacon.material.color.setHSL(0.05, .9, 0.42 + Math.max(0, Math.sin(t / 420)) * 0.18);
    beacons.material.opacity = .55 + .45 * Math.sin(t / 500);
    const s = t / 1000; cars.forEach((c, i) => { c.p += c.v * c.dir * dt; if (c.p > 63) c.p = -63; if (c.p < -63) c.p = 63; const x = c.axis ? c.line : c.p, z = c.axis ? c.p : c.line; carPos[i * 3] = x; carPos[i * 3 + 1] = GROUND + .12; carPos[i * 3 + 2] = z; }); carG.attributes.position.needsUpdate = true;
    clouds.rotation.y = s * 0.004;
    if (rain.visible) { for (let i = 0; i < RAIN; i++) { const o = i * 6, d = rainV[i] * dt; rainPos[o + 1] -= d; rainPos[o + 4] -= d; rainPos[o] -= d * .07; rainPos[o + 3] -= d * .07; if (rainPos[o + 1] < GROUND) reset(i, true); } rainG.attributes.position.needsUpdate = true; }
    if (snow.visible) { for (let i = 0; i < SNOW; i++) { const o = i * 3; snowPh[i] += dt; snowPos[o + 1] -= dt * (1.1 + (i % 7) * .12); snowPos[o] += Math.sin(snowPh[i]) * dt * .35; snowPos[o + 2] += Math.cos(snowPh[i] * .8) * dt * .25; if (snowPos[o + 1] < GROUND) resetS(i, true); } snowG.attributes.position.needsUpdate = true; }
    if (garland?.visible && garlandBase) { const ca = garland.children[0].geometry.attributes.color; for (let i = 0; i < ca.count; i++) { const k = .45 + .55 * Math.max(0, Math.sin(s * 2.2 + i * 1.7)); ca.array[i * 3] = garlandBase[i * 3] * k; ca.array[i * 3 + 1] = garlandBase[i * 3 + 1] * k; ca.array[i * 3 + 2] = garlandBase[i * 3 + 2] * k; } ca.needsUpdate = true; garland.children[1].material.opacity = .75 + .25 * Math.sin(s * 3); }
    renderer.render(scene, cam);
    if (active && visible) raf = requestAnimationFrame(loop);
  }
  function relight() {
    const day = document.documentElement.dataset.mode === 'day' ? 1 : 0;
    skyU.uDay.value = day; ground.material.uniforms.uDay.value = day; cityM.userData.uniforms.uDay.value = day; cityM.userData.uniforms.uLit.value = day ? .12 : .38;
    fogCol.set(day ? 0xd9c49a : 0x4a2c2d); skyU.uFog.value.copy(fogCol); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); scene.fog.density = (day ? .012 : .019) * ({ fog: 2.3, rain: 1.45, snow: 1.6 }[wx?.kind] || 1);
    if (wx?.kind === 'rain' || wx?.kind === 'fog') { fogCol.lerp(new THREE.Color(day ? 0x9a948c : 0x2e2427), .55); skyU.uFog.value.copy(fogCol); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); }
    if (wx?.kind === 'snow') { fogCol.lerp(new THREE.Color(day ? 0xe6e1d8 : 0x463a3d), .5); skyU.uFog.value.copy(fogCol); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); }
    rain.material.color.set(day ? 0x8f8a84 : 0xd8d2c8);
    hemi.intensity = day ? 1.6 : .55; key.intensity = day ? 2.8 : 1.5; key.color.set(day ? 0xfff0d8 : 0xffcf98);
    cityM.color.set(day ? 0x6a5f5c : 0x1f1517); hills.material.color.set(day ? 0x6a5a52 : 0x170e10);
    cloudMats.forEach(m => m.color.set(day ? 0xfff3dc : 0x8a5a58)); lamps.visible = carPts.visible = true; lamps.material.opacity = day ? .25 : 1; carPts.material.opacity = day ? .4 : 1;
    rim.intensity = day ? 6 : 25; officeK = day ? .16 : .6; wingFloors.forEach(m => { m.material.emissiveIntensity = officeK * .8; }); kick();
  }
  relight(); size();
  return { setWeather(w) { if (!w || (w.kind === wx.kind && w.newyear === wx.newyear)) return; wx = { kind: w.kind, newyear: w.newyear }; applyWx(); }, update, focusRoom, hoverRoom, setFilter(ids) { const next = ids ? new Set(curRooms.filter(r => !ids.has(r.id)).map(r => r.id)) : null; if (String([...(next || [])]) === String([...(dim || [])])) return; dim = next; retexture(curRooms); kick(); }, hoverFloor(f) { if (f !== hover) { hover = f; kick(); } }, active(on) { active = on; if (on) { size(); kick(); } }, relight };
}
