// three.js для промо-рендера: тот же модуль, что на сайте, но перед каждой отрисовкой
// можно подменить камеру (window.__camHook), а после — забрать кадр (window.__onRender).
// В three.js метод render задаётся в конструкторе, поэтому оборачиваем экземпляр, а не прототип.
import * as T from '../public/vendor/three/build/three.module.js';
export * from '../public/vendor/three/build/three.module.js';
export class WebGLRenderer extends T.WebGLRenderer {
  constructor(opts = {}) {
    super(opts);
    const render = this.render;
    this.render = (scene, cam) => {
      if (window.__camHook && cam.isPerspectiveCamera) window.__camHook(cam);
      // прокрутка состояния без отрисовки (догоняем время при рендере с середины ролика)
      if (window.__skip && cam.isPerspectiveCamera) { window.__rendered = true; return; }
      render.call(this, scene, cam);
      if (cam.isPerspectiveCamera) { window.__rendered = true; window.__onRender?.(this.domElement); }
    };
  }
}
