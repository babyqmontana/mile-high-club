// Витрина «Номеров» в теме Вайс-Сити: модель отеля ар-деко из Blender (img/vice/hotel.glb) на площадке у океана.
// Не функциональная — просто красивое здание: медленно поворачивается, тянется мышью/пальцем, ночью горит неон.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GLOW = /neon|glass_lit|glass_pink|glass_rose|lamp|store/;
const calm = () => document.documentElement.classList.contains('calm');
const isDay = () => document.documentElement.dataset.mode === 'day';

export function mountShowcase(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.25 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .5, 900);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), .04).texture;

  // небо: мягкий закатный градиент и спокойное размытое солнце у горизонта (без полос и «вычурности»)
  const skyU = { uDay: { value: 1 }, uSun: { value: new THREE.Vector3(-.5, .09, -.86).normalize() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float uDay;uniform vec3 uSun;varying vec3 vP;
      void main(){vec3 d=normalize(vP);float h=d.y;
        vec3 hz=mix(vec3(.55,.16,.42),vec3(1.,.66,.5),uDay), md=mix(vec3(.2,.07,.3),vec3(.93,.52,.62),uDay), zn=mix(vec3(.04,.03,.12),vec3(.45,.4,.72),uDay);
        vec3 c=mix(hz,md,smoothstep(-.02,.16,h)); c=mix(c,zn,smoothstep(.14,.7,h));
        float s=max(dot(d,uSun),0.);
        c+=mix(vec3(.5,.14,.4),vec3(1.,.72,.5),uDay)*(pow(s,8.)*.25+pow(s,90.)*.35);
        c=mix(c,mix(vec3(1.,.55,.6),vec3(1.,.93,.78),uDay),smoothstep(.9988,.9994,s)*mix(.35,.85,uDay)); // диск солнца — мягкий, полупрозрачный
        gl_FragColor=vec4(c,1.);}` }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xffffff, 90, 420);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.13; scene.add(ground);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x302030, 1), key = new THREE.DirectionalLight(0xffffff, 2);
  const rimP = new THREE.PointLight(0xff4fa8, 0, 120, 1.6), rimC = new THREE.PointLight(0x3ef2e0, 0, 120, 1.6);
  key.position.set(-40, 34, 46); rimP.position.set(-34, 10, 30); rimC.position.set(36, 9, 28); // фасад смотрит на +Z (так экспортирует Blender) scene.add(hemi, key, rimP, rimC);

  const pivot = new THREE.Group(); scene.add(pivot); let glow = [], walk = null;
  new GLTFLoader().loadAsync('img/vice/hotel.glb').then(g => {
    // светятся только неон, окна и фонари; у остального Blender отдаёт белую эмиссию нулевой силы — гасим, иначе штукатурка «горит»
    g.scene.traverse(o => { if (!o.isMesh) return; const m = o.material; if (!m) return; if (GLOW.test(m.name)) { m.userData.k0 = Math.min(m.emissiveIntensity || 1, m.name.startsWith('neon') ? 2.4 : m.name === 'lamp' ? 1.6 : .9); glow.push(m); } else { m.emissive?.set(0); m.emissiveIntensity = 0; if (m.name === 'walk') walk = m; } });
    pivot.add(g.scene); relight(); kick();
  }).catch(e => console.warn('vice model', e));

  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .45, .9); composer.addPass(bloom); composer.addPass(new OutputPass());

  function relight() {
    const day = isDay() ? 1 : 0; skyU.uDay.value = day; renderer.toneMappingExposure = day ? 1.0 : .95;
    const fog = new THREE.Color(day ? 0xf6b9a6 : 0x2a1038); scene.fog.color.copy(fog);
    ground.material.color.set(day ? 0xe9c3b2 : 0x1a0f26);
    hemi.color.set(day ? 0xfff0e6 : 0x7a5cc8); hemi.groundColor.set(day ? 0x8a5a60 : 0x140a1c); hemi.intensity = day ? 1.4 : .5;
    key.color.set(day ? 0xffc9a0 : 0xa08cff); key.intensity = day ? 2.6 : .45;
    rimP.intensity = day ? 0 : 55; rimC.intensity = day ? 0 : 40; walk?.color.set(day ? 0xd9c7b8 : 0x5a4a5e);
    glow.forEach(m => { m.emissiveIntensity = m.userData.k0 * (day ? (m.name.startsWith('neon') ? .35 : .05) : 1); });
    bloom.strength = day ? .15 : .5; kick();
  }

  // камера: облёт по кругу, тянется пальцем/мышью; в спокойном режиме — без автоповорота
  let yaw = -.42, pitch = .1, vel = 0, drag = null, raf = 0, last = 0, active = true, visible = true, dist = 96;
  const place = () => { cam.position.set(Math.sin(yaw) * dist * Math.cos(pitch), 4 + Math.sin(pitch) * dist, Math.cos(yaw) * dist * Math.cos(pitch)); cam.lookAt(0, 12, 0); };
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); kick(); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; yaw -= dx * .006; vel = -dx * .006; pitch = Math.min(.5, Math.max(.02, pitch + dy * .003)); kick(); });
  const up = () => { drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); composer.setSize(w, h); cam.aspect = w / h; dist = w / h < 1 ? 140 : 96; cam.updateProjectionMatrix(); kick(); }
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }); io.observe(canvas);
  function loop(t) {
    raf = 0; const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
    if (!drag) { vel *= Math.exp(-dt * 2.5); yaw += vel * dt * 10 + (calm() ? 0 : dt * .06); }
    place(); composer.render();
    if (active && visible && (!calm() || drag || Math.abs(vel) > 1e-4)) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && active && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  size(); place(); relight();
  const stub = () => {};
  return { isShowcase: true, active(on) { active = !!on; kick(); }, relight, update: stub, focusRoom: stub, hoverRoom: stub, setFilter: stub, setVenues: stub, setWeather: stub, setVice: stub,
    destroy() { active = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); composer.dispose?.(); renderer.dispose(); } };
}
