// «Номера» в теме Вайс-Сити: ночная улица отелей ар-деко в объёме (img/vice/hotel.glb).
// Свет, тени и отсветы неона запечены в Blender (brand/vice/vice_bake.py), поэтому здесь нет ни одного источника света
// и постобработки: несколько сеток с готовыми текстурами. Камера покачивается, мышью или пальцем можно оглядеться.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const calm = () => document.documentElement.classList.contains('calm');
const NEON = { neon_pink: 0xff7cc0, neon_cyan: 0x9bfff2, neon_violet: 0xd6a6ff };
const HALO = { glow_pink: 0xff2d95, glow_cyan: 0x3ef2e0, glow_violet: 0xb65cff };

function haloTex() { // мягкое пятно: свечение вокруг трубок и букв
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), d = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const u = Math.abs(x / 31.5 - 1), v = Math.abs(y / 31.5 - 1), k = Math.pow(Math.max(0, 1 - u * u), 1.5) * Math.pow(Math.max(0, 1 - v * v), 3); d.data.set([255 * k, 255 * k, 255 * k, 255], (y * 64 + x) * 4); }
  g.putImageData(d, 0, 0); return new THREE.CanvasTexture(c);
}

export function mountShowcase(canvas) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); renderer.debug.checkShaderErrors = false; // проверка ошибок шейдеров ждёт видеокарту и замораживает страницу
 
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 1.75)); renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, 1, 700);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 p;float h2(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
      void main(){float h=max(normalize(p).y,0.);vec3 c=mix(vec3(.62,.14,.42),vec3(.36,.1,.4),smoothstep(0.,.08,h));
      c=mix(c,vec3(.17,.06,.31),smoothstep(.07,.2,h));c=mix(c,vec3(.06,.035,.17),smoothstep(.18,.38,h));c=mix(c,vec3(.02,.016,.07),smoothstep(.36,.8,h));
      c+=(h2(gl_FragCoord.xy)-.5)/200.;gl_FragColor=vec4(c,1.);}` })); // шум убирает полосы на градиенте
  sky.renderOrder = -1; scene.add(sky);

  const halo = haloTex(); let glows = [], loaded = false, dead = false;
  new GLTFLoader().loadAsync('img/vice/hotel.glb?v=bake3').then(g => {
    if (dead) return;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    g.scene.traverse(o => { if (!o.isMesh) return; const n = o.material.name, map = o.material.map; o.matrixAutoUpdate = false; o.updateMatrix();
      if (map) map.anisotropy = aniso;
      if (HALO[n]) { o.material = new THREE.MeshBasicMaterial({ map: halo, color: HALO[n], transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }); glows.push(o.material); }
      else o.material = new THREE.MeshBasicMaterial({ map, side: /palms/.test(n) ? THREE.DoubleSide : THREE.FrontSide, color: NEON[n] ?? (n === 'lamp' ? 0xfff0d0 : n === 'far_win' ? 0xe8b070 : 0xffffff) }); });
    scene.add(g.scene); loaded = true; kick();
  }).catch(e => console.warn('vice scene', e));

  // камера на набережной, как в кадре Blender; оглядеться можно в пределах улицы
  const BASE = new THREE.Vector3(-7.5, 2.2, 49), TARGET = new THREE.Vector3(0, 12.2, 1), off = new THREE.Vector3();
  let yaw = 0, pitch = 0, vel = 0, drag = null, raf = 0, last = 0, t = 0, active = true, visible = true, far = 1;
  const place = () => {
    off.copy(BASE).sub(TARGET).multiplyScalar(far);
    const r = Math.hypot(off.x, off.z), a = Math.atan2(off.x, off.z) + yaw + (calm() ? 0 : Math.sin(t * .14) * .09);
    cam.position.set(TARGET.x + Math.sin(a) * r, BASE.y + pitch * 14, TARGET.z + Math.cos(a) * r); cam.lookAt(TARGET);
  };
  const clampYaw = v => Math.max(-.55, Math.min(.55, v));
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); kick(); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    yaw = clampYaw(yaw - dx * .0035); vel = -dx * .0035; pitch = Math.max(0, Math.min(.5, pitch + dy * .0035)); kick(); });
  const up = () => { drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; far = w / h < 1.2 ? 1.18 : 1; cam.updateProjectionMatrix(); kick(); }
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }); io.observe(canvas);
  function loop(now) {
    raf = 0; if (!active || !visible || dead) return;
    const busy = drag || Math.abs(vel) > 1e-3;
    if (busy || now - last > 31) { // покой — 30 кадров в секунду, под пальцем — плавно
      const dt = Math.min(.06, (now - last) / 1000 || 0); last = now; t += dt;
      if (!drag) { yaw = clampYaw(yaw + vel * dt * 8); vel *= Math.exp(-dt * 3); }
      const f = calm() ? .26 : .25 + Math.sin(t * 1.4) * .02; glows.forEach(m => { m.opacity = f; });
      place(); renderer.render(scene, cam);
    }
    if (loaded && (!calm() || busy)) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && active && visible && !dead) raf = requestAnimationFrame(loop); }
  size(); place(); kick();
  const stub = () => {};
  return { isShowcase: true, active(on) { active = !!on; kick(); }, relight: kick, update: stub, focusRoom: stub, hoverRoom: stub, setFilter: stub, setVenues: stub, setWeather: stub,
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); scene.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); }); renderer.dispose(); renderer.forceContextLoss(); } };
}
