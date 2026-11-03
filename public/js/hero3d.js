// Главный экран: атриум из трёх планов (дальний, колонны и люстры, перила и наш балкон).
// Планы двигаются целиком, пиксели не растягиваются. Картинка заранее увеличена нейросетью до 2880px,
// а WebGL2 строит мипмапы с анизотропией: на телефоне и на 4K одинаково чётко, без ряби при движении.
// Под передними планами дорисован фон, поэтому при сдвиге не открываются дыры.
const VS = `attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;
uniform sampler2D uFar,uImg,uMask;uniform vec2 uRes,uImgRes,uMouse,uDrift;uniform float uP,uT,uDay,uFade,uLayers,uRain,uFog,uSnow;varying vec2 v;
vec2 cover(vec2 uv){float ra=uRes.x/uRes.y,ri=uImgRes.x/uImgRes.y;vec2 s=ra>ri?vec2(1.,ri/ra):vec2(ra/ri,1.);return (uv-.5)*s+.5;}
const vec2 F=vec2(.53,.47);
vec2 lay(vec2 uv,float z,float m){return clamp(F+(uv-F)/z+(uMouse+uDrift)*m,.0005,.9995);}
void main(){
  vec2 uv=cover(vec2(v.x,1.-v.y));
  float p=uP*uP*(3.-2.*uP);
  float z=1.045+p*.3;
  vec3 c;
  if(uLayers>.5){
    vec2 a=lay(uv,z,-.004), b=lay(uv,z*(1.+p*.03),.005), n=lay(uv,z*(1.+p*.08),.014);
    // туман гуще на дальнем плане и почти не трогает перила — так видна глубина атриума
    vec3 haze=mix(vec3(.24,.16,.17),vec3(.86,.8,.72),uDay);
    c=mix(texture2D(uFar,a).rgb,haze,uFog*.42);
    vec4 mb=texture2D(uMask,b);
    // средний план: под перилами берём уже дорисованный фон, чтобы перила не двоились
    vec3 mid=mix(texture2D(uImg,b).rgb,texture2D(uFar,b).rgb,mb.g);
    c=mix(c,mix(mid,haze,uFog*.22),mb.r);
    c=mix(c,mix(texture2D(uImg,n).rgb,haze,uFog*.06),texture2D(uMask,n).g);
  } else c=texture2D(uImg,lay(uv,z,.004)).rgb;
  float l0=dot(c,vec3(.299,.587,.114));
  c=mix(c,c*vec3(.84,.88,.94),uRain*.7);
  c=mix(c,vec3(l0)*vec3(1.02,1.03,1.06)+.035,uSnow*.22);
  float lum=dot(c,vec3(.299,.587,.114));
  float warm=smoothstep(.55,.95,lum)*smoothstep(-.05,.15,c.r-c.b);
  c+=c*warm*(.06+.06*sin(uT*1.1+uv.x*7.))*(1.-uDay*.6);
  // тёплая подгонка под палитру логотипа: тени в бордо, света в крем
  c=mix(c,c*vec3(1.07,.97,.94),.65);
  c+=vec3(.035,.0,.012)*(1.-smoothstep(0.,.35,lum));
  float vg=smoothstep(1.3,.32,length((v-.5)*vec2(1.2,1.)));
  c*=mix(.55,1.,vg);
  gl_FragColor=vec4(c*uFade,1.);
}`;

export function layersFor(url) {
  const m = /img\/(atrium-night|atrium-day)\.webp$/.exec(url || '');
  if (!m) return null; const b = 'img/layers/' + m[1];
  return { far: b + '-far.webp', mask: b + '-mask.png' };
}

export function mountHero(canvas, section) {
  const opts = { antialias: false, alpha: false, powerPreference: 'high-performance' };
  const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
  if (!gl) return null;
  const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(pr, n), uRes = U('uRes'), uImgRes = U('uImgRes'), uMouse = U('uMouse'), uDrift = U('uDrift'), uP = U('uP'), uT = U('uT'), uDay = U('uDay'), uFade = U('uFade'), uLayers = U('uLayers'), uRain = U('uRain'), uFog = U('uFog'), uSnow = U('uSnow');
  ['uFar', 'uImg', 'uMask'].forEach((n, i) => gl.uniform1i(U(n), i));
  const texs = [0, 1, 2].map(() => gl.createTexture());
  const load = (unit, url, mip = true) => new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    im.onload = () => {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      ['TEXTURE_WRAP_S', 'TEXTURE_WRAP_T'].forEach(k => gl.texParameteri(gl.TEXTURE_2D, gl[k], gl.CLAMP_TO_EDGE));
      const useMip = mip && gl2;
      if (useMip) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, useMip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (aniso && useMip) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      res(im);
    }; im.onerror = rej; im.src = url;
  });
  let wx = [0, 0, 0], wxT = [0, 0, 0], ready = false, layered = 0, imgW = 16, imgH = 9, mouse = [0, 0], mt = [0, 0], p = 0, fade = 0, day = 0, visible = true, raf = 0, srcKey = '';
  async function setImage(url, isDay) {
    day = isDay ? 1 : 0; if (url === srcKey) return; srcKey = url; fade = 0;
    const L = layersFor(url);
    try {
      if (L) { const [, im] = await Promise.all([load(0, L.far), load(1, url), load(2, L.mask, false)]); imgW = im.naturalWidth; imgH = im.naturalHeight; layered = 1; }
      else { const im = await load(1, url); imgW = im.naturalWidth; imgH = im.naturalHeight; layered = 0; }
      ready = true; canvas.classList.add('on'); kick();
    } catch {
      if (L) try { const im = await load(1, url); imgW = im.naturalWidth; imgH = im.naturalHeight; layered = 0; ready = true; canvas.classList.add('on'); kick(); return; } catch { }
      ready = false; canvas.classList.remove('on');
    }
  }
  // рендерим в полном разрешении экрана (до 2×): без апскейла канваса нет «мыла»
  const size = () => { const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); gl.viewport(0, 0, canvas.width, canvas.height); kick(); };
  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(canvas);
  const coarse = matchMedia('(pointer: coarse)').matches;
  section.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; const r = section.getBoundingClientRect(); mt = [Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)), Math.max(-1, Math.min(1, (e.clientY - r.top) / Math.min(r.height, innerHeight) * 2 - 1))]; kick(); });
  section.addEventListener('pointerleave', () => { mt = [0, 0]; kick(); });
  if (coarse && 'DeviceOrientationEvent' in window) addEventListener('deviceorientation', e => { if (e.gamma == null) return; mt = [Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, (e.beta - 45) / 25))]; kick(); }, { passive: true });
  const progress = () => { const r = section.getBoundingClientRect(); return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight * 0.92))); };
  addEventListener('scroll', () => kick(), { passive: true });
  function kick() { if (!raf && visible && ready && document.body.contains(canvas)) raf = requestAnimationFrame(frame); }
  let onProgress = null, last = 0;
  function frame(t) {
    raf = 0; if (!document.body.contains(canvas)) return;
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
    const kp = 1 - Math.exp(-dt * 12), km = 1 - Math.exp(-dt * 6);
    const target = progress(); p += (target - p) * kp; mouse[0] += (mt[0] - mouse[0]) * km; mouse[1] += (mt[1] - mouse[1]) * km; fade = Math.min(1, fade + dt * 2.2);
    const s = t / 1000;
    gl.uniform2f(uRes, canvas.width, canvas.height); gl.uniform2f(uImgRes, imgW, imgH); gl.uniform2f(uMouse, mouse[0], -mouse[1]); gl.uniform2f(uDrift, Math.sin(s * .13) * .15, Math.cos(s * .11) * .12);
    gl.uniform1f(uP, p); gl.uniform1f(uT, s); gl.uniform1f(uDay, day); gl.uniform1f(uFade, fade); gl.uniform1f(uLayers, layered); for (let i = 0; i < 3; i++) wx[i] += (wxT[i] - wx[i]) * (1 - Math.exp(-dt * 1.5)); gl.uniform1f(uRain, wx[0]); gl.uniform1f(uFog, wx[1]); gl.uniform1f(uSnow, wx[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); onProgress?.(p);
    if (visible) raf = requestAnimationFrame(frame); else last = 0;
  }
  size();
  return { setWeather(k) { wxT = [k === 'rain' ? 1 : 0, k === 'fog' ? 1 : 0, k === 'snow' ? 1 : 0]; kick(); }, setImage, onProgress: fn => { onProgress = fn; } };
}
