// Фасад башни без WebGL: этажи отеля сверху вниз, окна — номера в цвете статуса.
// Тот же интерфейс, что у 3D-башни (skyline3d.mountTower), поэтому лифт, план этажа и бронь
// работают без изменений. Используется, если WebGL недоступен или 3D-сцена не создалась.
import { esc } from './ui.js';

const STATUS = { free: 'Свободен', booked: 'Забронирован', occupied: 'Заселён', cleaning: 'Уборка', repair: 'Ремонт' };

export function mountFacade(host, { onPick, onHoverFloor } = {}) {
  const el = document.createElement('div');
  el.className = 'facade'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Фасад отеля: этажи и номера');
  host.prepend(el); host.classList.add('flat');
  let rooms = [], sel = null, focus = null, hov = null, hovFloor = null, match = null;

  function paint() {
    const floors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => b - a);
    el.innerHTML = `<span class="crown" aria-hidden="true"></span>${floors.map(f => {
      const fr = rooms.filter(r => r.floor === f), free = fr.filter(r => r.status === 'free').length;
      return `<button type="button" class="ff${f === sel ? ' on' : ''}${f === hovFloor ? ' hv' : ''}" data-f="${f}" aria-pressed="${f === sel}" aria-label="${f} этаж, свободно ${free} из ${fr.length}">
        <b class="num">${f}</b><span class="ws">${fr.map(r => `<i class="w ${esc(r.status)}${match && !match.has(r.id) ? ' dim' : ''}${r.id === focus ? ' sel' : ''}${r.id === hov ? ' hv' : ''}" title="${esc(r.id)} · ${STATUS[r.status] || ''}"></i>`).join('')}</span><small class="num">${free}/${fr.length}</small></button>`;
    }).join('')}<span class="base" aria-hidden="true">Атриум</span>`;
    el.querySelectorAll('.ff').forEach(b => {
      b.onclick = () => onPick?.(+b.dataset.f);
      b.onmouseenter = () => onHoverFloor?.(+b.dataset.f);
      b.onmouseleave = () => onHoverFloor?.(null);
    });
  }
  return {
    update(r, s) { rooms = r || []; sel = s; paint(); },
    focusRoom(id) { focus = id; paint(); },
    hoverRoom(id) { hov = id; paint(); },
    hoverFloor(f) { hovFloor = f; paint(); },
    setFilter(ids) { match = ids; paint(); },
    active() {}, setWeather() {}, relight() {}
  };
}
