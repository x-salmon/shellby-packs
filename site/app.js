/* Shellby Wardrobe site: gallery filtering, the hero dress-up show, and try-on
   stages on pack pages. Interactive crabs use Shellby's own renderer
   (lib/sprite.js) and effects engine (lib/effects.js). */
(function () {
  'use strict';
  const base = document.body.dataset.base || './';
  const page = document.body.dataset.page;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let catalog = null;
  const loadCatalog = () => catalog ? Promise.resolve(catalog) : fetch(`${base}catalog.json`).then(r => r.json()).then(c => (catalog = c));

  // ------------------------------------------------------------ stage helper
  function stage(el) {
    const crabHost = el.querySelector('.stage-crab');
    const fx = window.ShellbyFx.mount(el.querySelector('.stage-fx'), null, { px: 5 });
    return {
      show(skin, accessories, effect) {
        crabHost.replaceChildren(window.ShellbySprite.build(skin, { accessories, fit: false }));
        fx.set(effect || null);
      },
    };
  }

  // ------------------------------------------------------------ gallery filters
  function gallery() {
    const q = $('#q');
    const sort = $('#sort');
    let slot = 'all';
    const cards = $$('#packGrid .card');
    const tiles = $$('#itemGrid .tile');
    function apply() {
      const text = q.value.trim().toLowerCase();
      const match = el => (!text || el.dataset.search.includes(text)) && (slot === 'all' || el.dataset.slots.split(' ').includes(slot));
      let shown = 0;
      for (const el of cards) { const ok = match(el); el.hidden = !ok; if (ok) shown++; }
      for (const el of tiles) el.hidden = !match(el);
      $('#empty').hidden = shown > 0;
      const by = sort.value === 'az' ? (a, b) => a.dataset.name.localeCompare(b.dataset.name) : (a, b) => b.dataset.updated.localeCompare(a.dataset.updated);
      for (const grid of ['#packGrid', '#itemGrid']) {
        const host = $(grid);
        [...host.children].sort(by).forEach(el => host.append(el));
      }
      const params = new URLSearchParams(location.search);
      text ? params.set('q', text) : params.delete('q');
      slot !== 'all' ? params.set('slot', slot) : params.delete('slot');
      history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`);
    }
    q.addEventListener('input', apply);
    sort.addEventListener('change', apply);
    $$('.chip').forEach(c => c.addEventListener('click', () => {
      slot = c.dataset.slot;
      $$('.chip').forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', String(x === c)); });
      apply();
    }));
    const params = new URLSearchParams(location.search);
    if (params.get('q')) q.value = params.get('q');
    if (params.get('slot')) $(`.chip[data-slot="${CSS.escape(params.get('slot'))}"]`)?.click(); else apply();
  }

  // ------------------------------------------------------------ hero: a little fashion show
  async function hero() {
    const el = $('#heroStage');
    if (!el) return;
    const c = await loadCatalog();
    const s = stage(el);
    const accs = c.packs.flatMap(p => p.accessories);
    const effects = c.packs.flatMap(p => p.effects);
    const skins = [c.skin, ...c.packs.flatMap(p => p.skins)];
    if (!accs.length) return;
    const pick = list => list[Math.floor(Math.random() * list.length)];
    function outfit() {
      const bySlot = {};
      for (const a of [...accs].sort(() => Math.random() - 0.5)) if (!bySlot[a.slot] && Math.random() > 0.35) bySlot[a.slot] = a;
      if (!Object.keys(bySlot).length) bySlot.hat = pick(accs);
      const skin = Math.random() < 0.2 && skins.length > 1 ? pick(skins.slice(1)) : c.skin;
      const effect = effects.length && Math.random() < 0.45 ? pick(effects) : null;
      s.show(skin, Object.values(bySlot), effect);
      $('#heroCaption').textContent = [...Object.values(bySlot).map(a => a.name), effect?.name, skin !== c.skin ? skin.name : null].filter(Boolean).join(' · ');
    }
    outfit();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(outfit, 3200);
  }

  // ------------------------------------------------------------ pack page: try items on
  async function packPage() {
    const el = $('#packStage');
    if (!el) return;
    const c = await loadCatalog();
    const pack = c.packs.find(p => p.id === el.dataset.pack);
    if (!pack) return;
    const s = stage(el);
    const worn = {};          // slot -> accessory
    let effect = null;
    let skin = c.skin;
    const byKey = new Map([...pack.accessories, ...pack.effects, ...pack.skins].map(i => [i.key, i]));
    function render() {
      s.show(skin, Object.values(worn), effect);
      const names = [...Object.values(worn).map(a => a.name), effect?.name, skin !== c.skin ? skin.name : null].filter(Boolean);
      $('#packCaption').textContent = names.length ? names.join(' · ') : 'Click items below to try them on';
      $$('#tryGrid .try').forEach(b => {
        const i = byKey.get(b.dataset.key);
        const on = i && (worn[i.slot] === i || effect === i || skin === i);
        b.setAttribute('aria-pressed', String(!!on));
      });
    }
    $$('#tryGrid .try').forEach(b => b.addEventListener('click', () => {
      const i = byKey.get(b.dataset.key);
      if (!i) return;
      if (b.dataset.kind === 'effect') effect = effect === i ? null : i;
      else if (b.dataset.kind === 'skin') skin = skin === i ? c.skin : i;
      else worn[i.slot] = worn[i.slot] === i ? undefined : i;
      if (!worn[i.slot]) delete worn[i.slot];
      render();
    }));
    // Start wearing one of everything (or the item from the URL hash).
    const target = location.hash && $(`#tryGrid [id="${CSS.escape(location.hash.slice(1))}"]`);
    if (target) { target.click(); target.scrollIntoView({ block: 'center' }); }
    else {
      for (const a of pack.accessories) if (!worn[a.slot]) worn[a.slot] = a;
      if (!pack.accessories.length && pack.skins[0]) skin = pack.skins[0];
      if (pack.effects[0]) effect = pack.effects[0];
      render();
    }
  }

  // ------------------------------------------------------------ "Add to Shellby"
  // The shellby:// link can't report back; if the page is still focused a moment
  // later, Shellby probably isn't installed or is older than 0.4, so offer help.
  $$('[data-install]').forEach(a => a.addEventListener('click', () => {
    const hint = $('#installHint');
    let left = false;
    const onBlur = () => { left = true; };
    window.addEventListener('blur', onBlur, { once: true });
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (left) return;
      if (hint) hint.hidden = false;
      else location.href = `${base}pack/${encodeURIComponent(a.dataset.install)}/#install`;
    }, 1600);
  }));

  if (page === 'home') { gallery(); hero(); }
  if (page === 'pack') {
    packPage();
    // Arrived from a gallery "Add" that Shellby didn't answer: explain the options.
    if (location.hash === '#install') $('#installHint')?.removeAttribute('hidden');
  }
})();
