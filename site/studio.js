/* Pack Studio: live validation (Shellby's own validator, lib/shellby.js) and a
   live preview (Shellby's own renderer + effects). Nothing leaves the browser. */
(function () {
  'use strict';
  const S = window.Shellby;
  const base = document.body.dataset.base || '../';
  const $ = s => document.querySelector(s);
  const src = $('#src');
  const SLOT_LABEL = { hat: 'Hat', face: 'Face', neck: 'Neck', held: 'Held', shell: 'Shell', effect: 'Effect', skin: 'Colors' };
  const STORE = 'shellby-studio-draft';
  let classic = null;
  let fx = null;
  let pack = null;
  const choice = {}; // slot -> key

  const TEMPLATE = {
    $schema: 'https://x-salmon.github.io/shellby-packs/addon.schema.json',
    format: 1,
    id: 'my-first-pack',
    name: 'My First Pack',
    author: 'your-github-name',
    version: '1.0.0',
    description: 'A cozy beanie and a little glow.',
    accessories: [
      { id: 'cozy-hat', name: 'Cozy Hat', description: 'Warm and fuzzy.', slot: 'hat', pivot: [3, 3], rarity: 'common',
        palette: { B: '#e76f51', b: '#b3472c', w: '#f4f1ea' },
        pixels: ['...w...', '.BBBBB.', 'BbBbBbB', 'BBBBBBB'] },
    ],
    effects: [
      { id: 'glow', name: 'Glow', description: 'Soft floating lights.', motion: 'float', count: 8, speed: 0.7,
        sprites: [{ palette: { y: '#fff3a3' }, pixels: ['y'] }] },
    ],
  };

  const pretty = o => JSON.stringify(o, null, 2);

  function validate() {
    let json;
    try { json = JSON.parse(src.value); } catch (e) {
      return show({ pack: null, errors: [`Not valid JSON yet: ${e.message}`], warnings: [] });
    }
    const r = S.validatePack(json, { source: 'user', knownAchievements: S.KNOWN_ACHIEVEMENTS, knownSeasons: S.KNOWN_SEASONS });
    // The gallery is stricter than the app: skipped items (warnings) must be fixed too.
    show(r);
  }

  function show(r) {
    const problems = $('#problems');
    problems.replaceChildren(...r.errors.map(m => li(m, '')), ...r.warnings.map(m => li(m, 'warn')));
    const ok = r.pack && !r.errors.length && !r.warnings.length;
    const status = $('#status');
    status.className = `status ${ok ? 'ok' : 'bad'}`;
    status.textContent = ok
      ? `✓ Valid: ${count(r.pack)}. Ready for the gallery.`
      : r.pack ? `Loads in Shellby, but ${r.warnings.length} item${r.warnings.length === 1 ? ' is' : 's are'} skipped. Fix ${r.warnings.length === 1 ? 'it' : 'them'} before submitting.` : '✗ Not a valid pack yet';
    if (r.pack) { pack = r.pack; pickers(); render(); }
  }
  const li = (text, cls) => { const el = document.createElement('li'); el.textContent = text; if (cls) el.className = cls; return el; };
  const count = p => [[p.accessories.length, 'accessory', 'accessories'], [p.effects.length, 'effect', 'effects'], [p.skins.length, 'color', 'colors']]
    .filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(', ') || 'empty';

  function pickers() {
    const host = $('#pickers');
    const groups = {};
    for (const a of pack.accessories) (groups[a.slot] = groups[a.slot] || []).push(a);
    if (pack.effects.length) groups.effect = pack.effects;
    if (pack.skins.length) groups.skin = pack.skins;
    host.replaceChildren(...Object.entries(groups).map(([slot, items]) => {
      const label = document.createElement('label');
      label.append(SLOT_LABEL[slot] || slot);
      const sel = document.createElement('select');
      sel.append(new Option('None', ''));
      for (const it of items) sel.append(new Option(it.name, it.key));
      if (!(slot in choice) || (choice[slot] && !items.some(i => i.key === choice[slot]))) choice[slot] = items[0].key;
      sel.value = choice[slot] || '';
      sel.addEventListener('change', () => { choice[slot] = sel.value; render(); });
      label.append(sel);
      return label;
    }));
  }

  function render() {
    if (!classic || !pack) return;
    const acc = pack.accessories.filter(a => choice[a.slot] === a.key);
    const effect = pack.effects.find(e => choice.effect === e.key) || null;
    const skinItem = pack.skins.find(s => choice.skin === s.key);
    const skin = skinItem ? { ...classic, ...skinItem, parts: skinItem.parts || classic.parts } : classic;
    $('#studioStage .stage-crab').replaceChildren(window.ShellbySprite.build(skin, { accessories: acc, fit: false }));
    if (!fx) fx = window.ShellbyFx.mount($('#studioStage .stage-fx'), null, { px: 5 });
    fx.set(effect);
    $('#studioCaption').textContent = [...acc.map(a => a.name), effect?.name, skinItem?.name].filter(Boolean).join(' · ') || 'Just the shell';
  }

  let timer;
  src.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { validate(); try { localStorage.setItem(STORE, src.value); } catch { /* private mode */ } }, 200);
  });
  src.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b } = src;
    src.setRangeText('  ', a, b, 'end');
  });
  $('#templateBtn').addEventListener('click', () => { src.value = pretty(TEMPLATE); validate(); });
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > S.constants.MAX_FILE_BYTES) { show({ pack: null, errors: ['That file is over 512 KB, the limit for packs.'], warnings: [] }); return; }
    src.value = await f.text();
    validate();
  });
  $('#downloadBtn').addEventListener('click', () => {
    let id = 'pack';
    try { id = JSON.parse(src.value).id || id; } catch { /* keep default */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([src.value.endsWith('\n') ? src.value : src.value + '\n'], { type: 'application/json' }));
    a.download = `${String(id).replace(/[^a-z0-9-]/gi, '') || 'pack'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(src.value); $('#copyBtn').textContent = 'Copied!'; } catch { src.select(); }
    setTimeout(() => { $('#copyBtn').textContent = 'Copy'; }, 1500);
  });

  fetch(`${base}catalog.json`).then(r => r.json()).then(c => {
    classic = c.skin;
    let draft = null;
    try { draft = localStorage.getItem(STORE); } catch { /* ignore */ }
    src.value = draft || pretty(TEMPLATE);
    validate();
  });
})();
