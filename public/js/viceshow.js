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
  // небо: закатное зарево у крыш, облака, луна и звёзды — один шейдер
  const uT = { value: 0 };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { uT },
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 p;uniform float uT;float h2(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
      float n2(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
      float fb(vec2 q){return n2(q)*.55+n2(q*2.1+7.)*.3+n2(q*4.3+3.)*.15;}
      void main(){vec3 d=normalize(p);float h=max(d.y,0.);vec3 c=mix(vec3(.74,.2,.42),vec3(.42,.11,.42),smoothstep(0.,.1,h));
      c=mix(c,vec3(.19,.07,.34),smoothstep(.08,.24,h));c=mix(c,vec3(.075,.04,.2),smoothstep(.2,.44,h));c=mix(c,vec3(.025,.018,.085),smoothstep(.4,.85,h));
      vec2 q=d.xz/(h+.22);float cl=smoothstep(.5,.82,fb(q*vec2(1.1,2.4)+vec2(uT*.004,0.)))*smoothstep(.03,.14,h)*smoothstep(.75,.25,h);
      c=mix(c,mix(vec3(.5,.14,.4),vec3(.17,.08,.3),smoothstep(.1,.4,h)),cl*.55);
      vec2 g=vec2(atan(d.x,d.z)*95.,h*150.),id=floor(g),f=fract(g)-.5;float r=h2(id);f-=(vec2(h2(id+3.),h2(id+9.))-.5)*.7;
      c+=vec3(.95,.88,1.)*step(.965,r)*smoothstep(.16,.0,length(f))*(.45+.35*sin(uT*(.6+r*2.)+r*90.))*smoothstep(.22,.5,h)*(1.-cl);
      vec3 m=normalize(vec3(.5,.5,-.75));float md=distance(d,m);c+=vec3(1.,.9,.86)*smoothstep(.021,.0185,md)*(.82+.18*n2(d.xy*110.))*(1.-cl*.7)+vec3(.5,.3,.5)*exp(-md*9.)*.28;
      c+=(h2(gl_FragCoord.xy)-.5)/200.;gl_FragColor=vec4(c,1.);}` }));
  sky.renderOrder = -2; scene.add(sky);
  // кольцо далёкого города: силуэты и окна рисует шейдер, за краем улицы не видно пустоты
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 46, 96, 1, true), new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: { uT },
    vertexShader: 'varying vec2 u;void main(){u=vec2(uv.x*942.,uv.y*46.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 u;uniform float uT;float h(float n){return fract(sin(n*12.9898)*43758.5453);}
      float top(float x,float s,float lo,float hi){float i=floor(x);return mix(lo,hi,pow(h(i+s),2.2))*step(.08,h(i*1.7+s));}
      void main(){float a=0.;vec3 c=vec3(0.);for(int k=0;k<2;k++){float s=float(k),w=k==0?9.:13.,x=u.x/w+s*.4,t=top(x,s*31.+3.,k==0?7.:5.,k==0?34.:22.),f=fract(x);float in1=step(u.y,t)*step(.05,f)*step(f,.95);
        if(in1>.5){vec3 b=mix(vec3(.5,.15,.42),k==0?vec3(.2,.085,.33):vec3(.12,.06,.22),smoothstep(0.,14.,u.y));vec2 g=vec2(f*w/1.15,u.y/1.5),id=floor(g),q=fract(g);float r=h(id.x*7.1+id.y*13.7+floor(x)*3.3+s);float px=max(fwidth(g.x),fwidth(g.y));
          float win=smoothstep(.2,.32,q.x)*smoothstep(.8,.68,q.x)*smoothstep(.25,.35,q.y)*smoothstep(.8,.7,q.y);b+=mix(vec3(.85,.5,.3),vec3(.8,.3,.55),step(.8,r))*step(.72,r)*mix(win,.2,smoothstep(.3,1.,px))*.5;
          if(h(floor(x)+s*5.)>.75&&u.y>t-.35)b+=mix(vec3(1.,.2,.6),vec3(.2,.9,.85),step(.5,h(floor(x)+8.)))*.6;c=b;a=1.;}}
        if(a<.5)discard;gl_FragColor=vec4(c,1.);}` }));
  ring.position.y = 22; ring.renderOrder = -1; scene.add(ring);
  // земля до горизонта: растворяется в закатной дымке
  const land = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.ShaderMaterial({ depthWrite: false, vertexShader: 'varying vec3 w;void main(){w=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 w;void main(){float d=length(w.xy);gl_FragColor=vec4(mix(vec3(.11,.06,.14),vec3(.5,.15,.42),smoothstep(50.,145.,d)),1.);}' }));
  land.rotation.x = -Math.PI / 2; land.position.y = -1.2; land.renderOrder = -1; scene.add(land);
  // прожекторы за отелями
  const beams = [[-16, -0.3], [4, .25], [25, -.1]].map(([x, ph], k) => { const g = new THREE.CylinderGeometry(3.4, .25, 90, 20, 1, true); g.translate(0, 45, 0); const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uC: { value: new THREE.Color([0xff5fae, 0xbf8cff, 0x58e8dc][k]) } }, vertexShader: 'varying vec2 u;varying vec3 n,v;void main(){u=uv;vec4 w=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-w.xyz);gl_Position=projectionMatrix*w;}', fragmentShader: 'uniform vec3 uC;varying vec2 u;varying vec3 n,v;void main(){float f=abs(dot(normalize(n),v));gl_FragColor=vec4(uC*f*f*.16*pow(1.-u.y,1.4),1.);}' })); m.position.set(x, 2, -34); m.userData.ph = ph; m.renderOrder = -1; scene.add(m); return m; });
  // самолёты: огни на посадочной глиссаде и винтовой самолёт с неоновой растяжкой — редко и неторопливо
  const dot = haloTex(), jetG = new THREE.BufferGeometry(); jetG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3)); jetG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
  const jets = new THREE.Points(jetG, new THREE.PointsMaterial({ map: dot, vertexColors: true, size: 4.4, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); jets.frustumCulled = false; jets.material.size = 10 * Math.min(devicePixelRatio, 1.5); scene.add(jets);
  const plane = new THREE.Group(); { const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }, part = (g, c) => plane.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c })));
    const body = new THREE.CylinderGeometry(.34, .16, 4.2, 10); body.rotateZ(-Math.PI / 2); part(body, 0xe98fb8); part(box(.9, .07, 5.6, .5, .62, 0), 0xf7c6d8); part(box(.8, .07, 5.2, .5, -.2, 0), 0xc9709c); part(box(.55, .9, .07, -1.95, .4, 0), 0x47bdb0); part(box(.5, .06, 1.8, -1.95, .1, 0), 0xf7c6d8);
    const prop = new THREE.Mesh(new THREE.CircleGeometry(.85, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false })); prop.rotation.y = Math.PI / 2; prop.position.x = 2.2; plane.add(prop);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 96; const g = c.getContext('2d'); g.fillStyle = 'rgba(20,8,30,.82)'; g.fillRect(0, 0, 1024, 96); g.strokeStyle = '#3ef2e0'; g.lineWidth = 4; g.strokeRect(4, 4, 1016, 88); g.font = '800 58px Unbounded, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff2d95'; g.shadowBlur = 22; g.fillStyle = '#ffd3ea'; g.fillText('ЛЕТО В ВАЙС-СИТИ', 512, 51);
    const bt = new THREE.CanvasTexture(c); bt.anisotropy = 4; const bg = new THREE.PlaneGeometry(17, 1.6, 40, 1); bg.translate(-12.6, 0, 0);
    const bm = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { uT, m: { value: bt } }, vertexShader: 'uniform float uT;varying vec2 u;void main(){u=uv;vec3 q=position;float k=clamp((-q.x-4.)/17.,0.,1.);q.y+=sin(q.x*.55+uT*3.)*.28*k;q.z+=sin(q.x*.4+uT*2.2)*.5*k;gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.);}', fragmentShader: 'uniform sampler2D m;varying vec2 u;void main(){gl_FragColor=texture2D(m,u);}' });
    plane.add(new THREE.Mesh(bg, bm)); plane.add(new THREE.Mesh(box(2.1, .03, .03, -3.1, 0, 0), new THREE.MeshBasicMaterial({ color: 0x8a7a98 }))); plane.visible = false; scene.add(plane); }
  function fly(sec) {
    uT.value = sec % 5000; beams.forEach((b, k) => { b.rotation.z = Math.sin(sec * .16 + k * 2.1) * .34 + b.userData.ph; b.rotation.x = Math.cos(sec * .12 + k) * .12 - .1; });
    const P = jetG.attributes.position, C = jetG.attributes.color;
    for (let k = 0; k < 3; k++) { const u = (sec * .011 + k * .34) % 1, d = k % 2 ? -1 : 1, x = d * (240 - u * 480), y = 92 - u * 24 + k * 13, z = -150 - k * 18, f = Math.min(1, Math.min(u, 1 - u) * 8), bl = Math.sin(sec * 5.5 + k * 2) > .86 ? 1 : .08;
      P.setXYZ(k * 3, x, y, z); C.setXYZ(k * 3, f, .92 * f, .8 * f); P.setXYZ(k * 3 + 1, x + d * 3, y, z); C.setXYZ(k * 3 + 1, bl * f, bl * .1 * f, bl * .12 * f); P.setXYZ(k * 3 + 2, x + d * 6, y, z); C.setXYZ(k * 3 + 2, .1 * f, .65 * f, .35 * f); }
    P.needsUpdate = C.needsUpdate = true;
    const q = (sec + 34) % 70; plane.visible = q < 34 && !calm(); if (plane.visible) { const u = q / 34; plane.position.set(-95 + u * 205, 32 + Math.sin(sec * .35) * 1.4, -20); plane.rotation.set(Math.sin(sec * .5) * .08, 0, Math.cos(sec * .35) * .03); }
  }

  const halo = haloTex(); let glows = [], loaded = false, dead = false, intro = 9; canvas.style.opacity = 0; canvas.style.transition = 'opacity .9s ease';
  new GLTFLoader().loadAsync('img/vice/hotel.glb?v=bake5').then(g => {
    if (dead) return;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    g.scene.traverse(o => { if (!o.isMesh) return; const n = o.material.name, map = o.material.map; o.matrixAutoUpdate = false; o.updateMatrix();
      if (map) map.anisotropy = aniso;
      if (HALO[n]) { o.material = new THREE.MeshBasicMaterial({ map: halo, color: HALO[n], transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false }); glows.push(o.material); }
      else o.material = new THREE.MeshBasicMaterial({ map, side: /palms/.test(n) ? THREE.DoubleSide : THREE.FrontSide, color: NEON[n] ?? (n === 'lamp' ? 0xfff0d0 : n === 'far_win' ? 0xb0708a : n === 'baked_far' ? 0xc8a0c8 : 0xffffff) });
      // пальмы чуть качает бриз: вершины сдвигает видеокарта
      if (/palms/.test(n)) o.material.onBeforeCompile = sh => { sh.uniforms.uT = uT; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat sw=max(0.,position.y-2.5);transformed.x+=sin(uT*.9+position.x*.35+position.z*.2)*sw*.011+sin(uT*2.3+position.x*1.7+position.y)*.02*step(5.,position.y);transformed.z+=cos(uT*.7+position.x*.3)*sw*.007;'); }; });
    scene.add(g.scene);
    // шейдеры и текстуры готовим до первого кадра, затем сцена проявляется — без замирания страницы
    return (renderer.compileAsync ? renderer.compileAsync(scene, cam) : Promise.resolve()).catch(() => {}).then(async () => { if (dead) return; const maps = new Set(); scene.traverse(o => o.material?.map && maps.add(o.material.map)); for (const m of maps) { renderer.initTexture(m); await new Promise(r => setTimeout(r, 12)); if (dead) return; } loaded = true; intro = 0; canvas.style.opacity = 1; kick(); });
  }).catch(e => { console.warn('vice scene', e); canvas.style.opacity = 1; });

  // камера на набережной, как в кадре Blender; оглядеться можно в пределах улицы
  const BASE = new THREE.Vector3(-7.5, 2.2, 49), TARGET = new THREE.Vector3(0, 12.2, 1), off = new THREE.Vector3();
  let drag = null, raf = 0, last = 0, t = 0, active = true, visible = true, far = 1, idle = 9, vel = 0, yawT = 0, pitchT = 0, mx = 0, my = 0;
  // камера на пружинах: рука ведёт, отпустили — мягко докатилась; в покое медленно дышит, чуть тянется за курсором
  const Y = { v: 0, s: 0 }, Pt = { v: 0, s: 0 }, O = { v: 0, s: 0 }, Oy = { v: 0, s: 0 };
  const damp = (o, to, time, dt) => { const w = 2 / time, x = w * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x), d = o.v - to, k = (o.s + w * d) * dt; o.s = (o.s - w * k) * e; o.v = to + (d + k) * e; return o.v; };
  const place = () => {
    const q = intro < 2.8 && !calm() ? Math.pow(1 - intro / 2.8, 3) : 0;
    off.copy(BASE).sub(TARGET).multiplyScalar(far * (1 - .2 * q));
    const r = Math.hypot(off.x, off.z), a = Math.atan2(off.x, off.z) + Y.v + O.v - .3 * q;
    cam.position.set(TARGET.x + Math.sin(a) * r, BASE.y + (Pt.v + Oy.v) * 14 + q * 1.5, TARGET.z + Math.cos(a) * r); cam.lookAt(TARGET.x, TARGET.y - 5 * q, TARGET.z);
  };
  const clampYaw = v => Math.max(-.55, Math.min(.55, v));
  canvas.addEventListener('pointerdown', e => { yawT = clampYaw(Y.v + O.v); Y.v = yawT; Y.s = O.v = O.s = vel = 0; drag = { x: e.clientX, y: e.clientY, at: e.timeStamp }; canvas.setPointerCapture(e.pointerId); kick(); });
  canvas.addEventListener('pointermove', e => { if (!drag) { if (e.pointerType !== 'touch') { const r = canvas.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width * 2 - 1; my = (e.clientY - r.top) / r.height * 2 - 1; } return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, ms = Math.max(1, e.timeStamp - drag.at); drag = { x: e.clientX, y: e.clientY, at: e.timeStamp };
    yawT = clampYaw(yawT - dx * .0032); vel += (-dx * .0032 / ms * 1000 - vel) * (1 - Math.exp(-ms / 60)); pitchT = Math.max(0, Math.min(.5, pitchT + dy * .003)); kick(); });
  const up = e => { if (drag && (calm() || e.timeStamp - drag.at > 70)) vel = 0; vel = Math.max(-1.6, Math.min(1.6, vel)); drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', () => { mx = my = 0; });
  function size() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; far = w / h < 1.2 ? 1.18 : 1; cam.updateProjectionMatrix(); kick(); }
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }); io.observe(canvas);
  function loop(now) {
    raf = 0; if (!active || !visible || dead) return;
    const moving = drag || Math.abs(vel) > .01 || Math.abs(Y.s) + Math.abs(O.s) > .06 || intro < 3;
    if (moving || now - last > (coarse ? 31 : 15)) {
      const dt = Math.max(0, Math.min(.05, (now - last) / 1000 || 0)); last = now; t += dt; intro += dt;
      if (!drag) { const f = Math.exp(-dt * 3.2); yawT = clampYaw(yawT + vel * (1 - f) / 3.2); vel *= f; idle += dt; } else idle = 0;
      const drift = calm() || drag ? 0 : Math.min(1, Math.max(0, idle - 1.5) / 4);
      damp(Y, yawT, .16, dt); damp(Pt, pitchT, .22, dt); if (!drag) damp(O, drift * Math.sin(Math.max(0, idle - 1.5) * .14) * .12 + (calm() ? 0 : mx * -.035), .9, dt); damp(Oy, calm() ? 0 : -my * .02, .9, dt);
      const f = calm() ? .26 : .25 + Math.sin(t * 1.4) * .015; glows.forEach(m => { m.opacity = f; });
      fly(calm() ? 12 : t + 8); place(); renderer.render(scene, cam);
    }
    const busy = moving;
    if (loaded && (!calm() || busy)) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && active && visible && !dead) raf = requestAnimationFrame(loop); }
  size(); place(); kick();
  const stub = () => {};
  return { isShowcase: true, active(on) { active = !!on; kick(); }, relight: kick, update: stub, focusRoom: stub, hoverRoom: stub, setFilter: stub, setVenues: stub, setWeather: stub,
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); dot.dispose(); scene.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.uniforms?.m?.value?.dispose?.(); o.material?.dispose?.(); }); renderer.dispose(); renderer.forceContextLoss(); } };
}
