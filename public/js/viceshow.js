// «Номера» в теме Вайс-Сити: та же улица, что на картинке первого экрана, только объёмная —
// отели ар-деко на набережной (img/vice/hotel.glb из Blender), дорога, пальмы, фонари, кабриолет, город позади.
// Не функциональная: камера стоит на набережной, медленно покачивается, мышью/пальцем можно оглядеться.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GLOW = /neon|glass_lit|glass_pink|glass_rose|lamp|store|far_win/;
const calm = () => document.documentElement.classList.contains('calm');
const isDay = () => document.documentElement.dataset.mode === 'day';
// небо — те же градиенты, что в сцене Blender (снизу вверх)
const SKY = { night: ['#ff4f9e', '#d23a8c', '#6a2088', '#25104e', '#0a0724'], day: ['#ffb067', '#ff7f73', '#f0559a', '#9a46c4', '#3b2a8a'] };

export function mountShowcase(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.25 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, .5, 900);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), .04).texture;

  const col = h => new THREE.Color(h);
  const skyU = { c0: { value: col(SKY.night[0]) }, c1: { value: col(SKY.night[1]) }, c2: { value: col(SKY.night[2]) }, c3: { value: col(SKY.night[3]) }, c4: { value: col(SKY.night[4]) }, uDay: { value: 0 }, uSun: { value: new THREE.Vector3(-.32, .2, -.93).normalize() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 c0,c1,c2,c3,c4,uSun;uniform float uDay;varying vec3 vP;
      void main(){vec3 d=normalize(vP);float h=max(d.y,0.);
        vec3 c=mix(c0,c1,smoothstep(0.,.07,h)); c=mix(c,c2,smoothstep(.07,.18,h)); c=mix(c,c3,smoothstep(.18,.36,h)); c=mix(c,c4,smoothstep(.36,.75,h));
        float s=max(dot(d,uSun),0.);
        // днём — небольшое мягкое солнце, как на картинке; ночью — только свечение у горизонта
        c=mix(c,mix(vec3(1.,.42,.6),vec3(1.,.86,.62),smoothstep(-.6,.6,(d.y-uSun.y)*40.)),smoothstep(.9989,.9993,s)*uDay*.9);
        c+=vec3(1.,.5,.55)*pow(s,12.)*.18*uDay;
        gl_FragColor=vec4(c,1.);}` }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0x000000, 70, 260);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x302030, 1), key = new THREE.DirectionalLight(0xffffff, 2), front = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(-30, 40, -60); front.position.set(6, 10, 60); scene.add(hemi, key, front);
  const rimP = new THREE.PointLight(0xff4fa8, 0, 90, 1.6), rimC = new THREE.PointLight(0x3ef2e0, 0, 90, 1.6);
  rimP.position.set(30, 8, 22); rimC.position.set(-28, 8, 22); scene.add(rimP, rimC);

  // тёплые пятна от фонарей на фасадах
  const lamps = [-34, -18, -2, 14, 30].map(x => { const l = new THREE.PointLight(0xffc890, 0, 22, 1.7); l.position.set(x, 5, 5.5); scene.add(l); return l; });
  let glow = [], mats = [], loaded = false;
  new GLTFLoader().loadAsync('img/vice/hotel.glb?v=street3').then(g => {
    // светятся неон, окна и фонари; у остального Blender отдаёт белую эмиссию нулевой силы — гасим
    g.scene.traverse(o => { if (!o.isMesh) return; const m = o.material; if (!m) return; mats.push(m);
      if (GLOW.test(m.name)) { m.userData.k0 = Math.min(m.emissiveIntensity || 1, m.name.startsWith('neon') ? 1.5 : m.name === 'lamp' ? 1.2 : m.name === 'store' ? .55 : .7); glow.push(m); }
      else { m.emissive?.set(0); m.emissiveIntensity = 0; } });
    scene.add(g.scene); loaded = true; relight(); kick();
  }).catch(e => console.warn('vice scene', e));

  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .35, .35, 1); composer.addPass(bloom); composer.addPass(new OutputPass());

  function relight() {
    const day = isDay() ? 1 : 0, P = day ? SKY.day : SKY.night;
    ['c0', 'c1', 'c2', 'c3', 'c4'].forEach((k, i) => skyU[k].value.set(P[i])); skyU.uDay.value = day;
    scene.fog.color.set(day ? 0xf08a86 : 0x4a1858); renderer.toneMappingExposure = day ? 1.05 : 1;
    hemi.color.set(day ? 0xffe6dc : 0x8a6ad8); hemi.groundColor.set(day ? 0x6a3a50 : 0x1a0c24); hemi.intensity = day ? .9 : .42;
    key.color.set(day ? 0xffb98a : 0x8f7cff); key.intensity = day ? 2.4 : .35;
    front.color.set(day ? 0xff9ac2 : 0xd8d0ff); front.intensity = day ? .6 : .22;
    rimP.intensity = day ? 0 : 26; rimC.intensity = day ? 0 : 22; lamps.forEach(l => { l.intensity = day ? 0 : 26; });
    mats.forEach(m => { m.envMapIntensity = day ? .3 : .1; }); // студийный свет окружения — только для бликов
    glow.forEach(m => { m.emissiveIntensity = m.userData.k0 * (day ? (m.name.startsWith('neon') ? .35 : .05) : 1); });
    bloom.strength = day ? .1 : .32; kick();
  }

  // камера на набережной, как в кадре Blender; оглядеться можно в пределах улицы
  const BASE = new THREE.Vector3(-7.5, 2.2, 51), TARGET = new THREE.Vector3(0, 12.5, 1);
  let yaw = 0, pitch = 0, vel = 0, drag = null, raf = 0, last = 0, t = 0, active = true, visible = true, far = 1;
  const place = () => {
    const a = yaw + (calm() ? 0 : Math.sin(t * .12) * .1), off = BASE.clone().sub(TARGET).multiplyScalar(far);
    const r = Math.hypot(off.x, off.z), base = Math.atan2(off.x, off.z);
    cam.position.set(TARGET.x + Math.sin(base + a) * r, BASE.y + pitch * 18, TARGET.z + Math.cos(base + a) * r); cam.lookAt(TARGET);
  };
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); kick(); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    yaw = Math.max(-.7, Math.min(.7, yaw - dx * .004)); vel = -dx * .004; pitch = Math.max(0, Math.min(.6, pitch + dy * .004)); kick(); });
  const up = () => { drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); composer.setSize(w, h); cam.aspect = w / h; far = w / h < 1.2 ? 1.2 : 1; cam.updateProjectionMatrix(); kick(); }
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }); io.observe(canvas);
  function loop(now) {
    raf = 0; const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; t += dt;
    if (!drag) { vel *= Math.exp(-dt * 3); yaw = Math.max(-.7, Math.min(.7, yaw + vel * dt * 8)); }
    place(); composer.render();
    if (active && visible && loaded && (!calm() || drag || Math.abs(vel) > 1e-4)) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && active && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  size(); place(); relight();
  const stub = () => {};
  return { isShowcase: true, active(on) { active = !!on; kick(); }, relight, update: stub, focusRoom: stub, hoverRoom: stub, setFilter: stub, setVenues: stub, setWeather: stub, setVice: stub,
    destroy() { active = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); composer.dispose?.(); renderer.dispose(); } };
}
