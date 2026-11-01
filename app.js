(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const colors = ['#e3eacb', '#f1c6b7', '#cbdde9', '#e3d3eb', '#f1dfa7', '#d5e5dc'];
  const key = document.body.dataset.storageKey || 'ga2-little-connections-v1';
  const radius = 82;
  let state = { version: 1, title: 'untitled possibilities', nodes: [], edges: [] };
  let view = { x: 0, y: 0, scale: 1 };
  let selected = null, mode = 'select', source = null, gesture = null, pendingImport = null;
  let history = [], historyIndex = -1, toastTimer, saveTimer, storageOK = true;
  const uid = () => globalThis.crypto?.randomUUID?.() || `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const snapshot = () => JSON.stringify(state);
  function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
  }
  function validate(input) {
    if (!input || input.version !== 1 || typeof input.title !== 'string' || input.title.length > 100 || !Array.isArray(input.nodes) || !Array.isArray(input.edges) || input.nodes.length > 200 || input.edges.length > 3000) throw new Error('that file is not a supported concept map.');
    const ids = new Set();
    const nodes = input.nodes.map(n => {
      if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 100 || ids.has(n.id) || typeof n.text !== 'string' || n.text.length > 500 || !/^#[0-9a-f]{6}$/i.test(n.color) || !Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 100000 || Math.abs(n.y) > 100000) throw new Error('the file contains an invalid circle.');
      ids.add(n.id);
      return { id: n.id, text: n.text, color: n.color, x: n.x, y: n.y };
    });
    const pairs = new Set();
    const edges = input.edges.map(e => {
      if (!e || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) throw new Error('the file contains an invalid connection.');
      const pair = JSON.stringify([e.from, e.to].sort());
      if (pairs.has(pair)) throw new Error('the file contains duplicate connections.');
      pairs.add(pair);
      return { from: e.from, to: e.to };
    });
    return { version: 1, title: input.title, nodes, edges };
  }
  function persist() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(key, JSON.stringify({ ...state, view }));
      if ($('initial-map')) localStorage.setItem(`${key}:initial-map-loaded`, '1');
      storageOK = true;
      $('save-status').textContent = '✓ saved in this browser';
    } catch {
      storageOK = false;
      $('save-status').textContent = 'autosave unavailable · save a copy';
    }
  }
  function saveSoon() {
    $('save-status').textContent = storageOK ? 'saving…' : 'autosave unavailable · save a copy';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
  }
  function commit() {
    const next = snapshot();
    if (history[historyIndex] !== next) {
      history = history.slice(0, historyIndex + 1);
      history.push(next);
      if (history.length > 80) history.shift();
      historyIndex = history.length - 1;
    }
    $('undo').disabled = historyIndex <= 0;
    $('redo').disabled = historyIndex >= history.length - 1;
    persist();
  }
  function applyView() {
    $('world').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    $('zoom-level').textContent = `${Math.round(view.scale * 100)}%`;
  }
  function point(clientX, clientY) {
    const r = $('viewport').getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.scale, y: (clientY - r.top - view.y) / view.scale };
  }
  function zoom(factor) {
    const r = $('viewport').getBoundingClientRect();
    const next = Math.max(.001, Math.min(2, view.scale * factor));
    const ratio = next / view.scale;
    view.x = r.width / 2 - (r.width / 2 - view.x) * ratio;
    view.y = r.height / 2 - (r.height / 2 - view.y) * ratio;
    view.scale = next;
    applyView(); saveSoon();
  }
  function fit() {
    if (!state.nodes.length) { view = { x: 0, y: 0, scale: 1 }; applyView(); return; }
    const r = $('viewport').getBoundingClientRect();
    const minX = Math.min(...state.nodes.map(n => n.x)) - radius - 35;
    const minY = Math.min(...state.nodes.map(n => n.y)) - radius - 35;
    const maxX = Math.max(...state.nodes.map(n => n.x)) + radius + 35;
    const maxY = Math.max(...state.nodes.map(n => n.y)) + radius + 35;
    const scale = Math.max(.001, Math.min(1, (r.width - 40) / (maxX - minX), (r.height - 210) / (maxY - minY)));
    view = { scale, x: r.width / 2 - (minX + maxX) / 2 * scale, y: (r.height + 85) / 2 - (minY + maxY) / 2 * scale };
    applyView(); saveSoon();
  }
  function ink(color) {
    const rgb = color.match(/\w\w/g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#25332b' : '#ffffff';
  }
  function updateSelection(syncText = true) {
    const n = state.nodes.find(n => n.id === selected);
    $('properties').disabled = !n;
    $('selection-hint').textContent = n ? 'a little color goes a long way.' : 'pick a circle to edit its text and color.';
    if (syncText) $('node-text').value = n?.text || '';
    $('node-color').value = n?.color || colors[0];
    document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('chosen', !!n && b.dataset.color === n.color));
    document.querySelectorAll('.node').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === selected);
      el.classList.toggle('connect-source', el.dataset.id === source);
    });
  }
  function setMode(next) {
    mode = next; source = null;
    $('viewport').classList.toggle('connecting', mode === 'connect');
    for (const name of ['select', 'connect']) {
      $(name).classList.toggle('active', mode === name);
      $(name).setAttribute('aria-pressed', mode === name);
    }
    $('mode-hint').textContent = mode === 'connect' ? 'pick two circles to connect · esc to stop' : 'drag the paper to explore';
    updateSelection();
  }
  function choose(id) {
    selected = id;
    if (mode === 'connect') {
      if (source && source !== id) {
        if (!state.edges.some(e => (e.from === source && e.to === id) || (e.from === id && e.to === source))) {
          if (state.edges.length >= 3000) { notify('this map has reached its connection limit.'); return; }
          state.edges.push({ from: source, to: id });
          commit(); drawEdges(); notify('connected.');
        } else notify('those ideas are already connected.');
        source = null;
        $('mode-hint').textContent = 'pick two more circles · esc to stop';
      } else {
        source = source === id ? null : id;
        $('mode-hint').textContent = source ? 'now pick the second circle' : 'pick two circles to connect';
      }
    }
    updateSelection();
  }
  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }
  function drawEdges() {
    $('edges').replaceChildren();
    const byId = new Map(state.nodes.map(n => [n.id, n]));
    state.edges.forEach(e => {
      const a = byId.get(e.from), b = byId.get(e.to);
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const offset = Math.min(radius + 3, length / 3);
      const attrs = { x1: a.x + dx / length * offset, y1: a.y + dy / length * offset, x2: b.x - dx / length * offset, y2: b.y - dy / length * offset };
      const g = svgEl('g', { class: 'edge-group', tabindex: 0, role: 'button', 'aria-label': `disconnect ${a.text || 'blank circle'} from ${b.text || 'blank circle'}` });
      const title = svgEl('title', {}); title.textContent = 'click to disconnect'; g.append(title);
      g.append(svgEl('line', { ...attrs, class: 'edge' }), svgEl('line', { ...attrs, class: 'edge-hit' }));
      const remove = () => { state.edges = state.edges.filter(edge => edge !== e); commit(); drawEdges(); updateCounts(); notify('connection snipped. undo brings it back.'); };
      g.addEventListener('pointerdown', event => event.stopPropagation());
      g.addEventListener('click', remove);
      g.addEventListener('keydown', event => { if (['Enter', ' ', 'Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); remove(); } });
      $('edges').append(g);
    });
    updateCounts();
  }
  function updateCounts() {
    $('counts').textContent = `${state.nodes.length} ${state.nodes.length === 1 ? 'idea' : 'ideas'} · ${state.edges.length} ${state.edges.length === 1 ? 'connection' : 'connections'}`;
    $('empty').hidden = state.nodes.length > 0;
  }
  const bubbleMeasure = document.createElement('canvas').getContext('2d');
  function fitBubbleText(text) {
    // Measure the real textarea so wrapping matches the editable text exactly.
    // Padding protects glyph overhangs; extra measurement slack avoids edge clipping.
    // This rectangle sits inside the circle, leaving the rim free for dragging.
    const maxHeight = 108;
    const verticalBuffer = 4;
    text.style.height = `${maxHeight - verticalBuffer}px`;
    const words = (text.value || text.placeholder).match(/\S+/gu) || [];
    const style = getComputedStyle(text);
    const family = style.fontFamily;
    const safeWidth = text.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
    let low = .1, high = 64;
    for (let i = 0; i < 12; i++) {
      const size = (low + high) / 2;
      text.style.fontSize = `${size}px`;
      bubbleMeasure.font = `${size}px ${family}`;
      const wordsFit = words.every(word => {
        const measured = bubbleMeasure.measureText(word);
        const inkWidth = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight;
        return Math.max(measured.width, inkWidth) <= safeWidth;
      });
      if (wordsFit && text.scrollHeight <= text.clientHeight && text.scrollWidth <= text.clientWidth) low = size;
      else high = size;
    }
    text.style.fontSize = `${Math.floor(low * 10) / 10}px`;
    // Shrink the editor to its content so both single and multiline labels center.
    text.style.height = '0px';
    text.style.height = `${Math.min(maxHeight, Math.max(1, text.scrollHeight + verticalBuffer))}px`;
    text.scrollTop = 0;
    text.scrollLeft = 0;
  }
  function render() {
    $('map-title').value = state.title;
    $('nodes').replaceChildren();
    state.nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'node'; el.dataset.id = n.id; el.tabIndex = 0;
      el.setAttribute('role', 'group'); el.setAttribute('aria-label', `circle: ${n.text || 'blank'}. use arrow keys to move; enter to select or connect.`);
      el.style.left = `${n.x - radius}px`; el.style.top = `${n.y - radius}px`; el.style.background = n.color; el.style.color = ink(n.color);
      const text = document.createElement('textarea'); text.value = n.text; text.maxLength = 500; text.placeholder = 'an idea…';
      text.setAttribute('aria-label', 'circle text'); text.spellcheck = true;
      text.addEventListener('pointerdown', event => { event.stopPropagation(); choose(n.id); });
      text.addEventListener('focus', () => { if (selected !== n.id) { selected = n.id; updateSelection(); } });
      text.addEventListener('input', () => { n.text = text.value; fitBubbleText(text); if (selected === n.id) $('node-text').value = n.text; saveSoon(); });
      text.addEventListener('change', () => { commit(); drawEdges(); });
      el.append(text);
      el.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.stopPropagation(); choose(n.id);
        if (mode === 'connect') return;
        const p = point(event.clientX, event.clientY);
        gesture = { type: 'node', id: n.id, px: p.x, py: p.y, x: n.x, y: n.y };
        $('viewport').setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      el.addEventListener('keydown', event => {
        if (event.target !== el) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(n.id); }
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (directions[event.key]) {
          event.preventDefault(); selected = n.id;
          const d = directions[event.key], step = event.shiftKey ? 40 : 10;
          n.x = Math.max(-100000, Math.min(100000, n.x + d[0] * step)); n.y = Math.max(-100000, Math.min(100000, n.y + d[1] * step));
          el.style.left = `${n.x - radius}px`; el.style.top = `${n.y - radius}px`;
          updateSelection(); drawEdges(); commit();
        }
      });
      $('nodes').append(el);
      fitBubbleText(text);
    });
    drawEdges(); updateSelection(); applyView();
  }
  function addConcepts(texts) {
    if (!texts.length) { notify('add at least one concept first.'); $('concepts').focus(); return; }
    if (texts.some(t => t.length > 500)) { notify('keep each concept under 500 characters.'); return; }
    if (state.nodes.length + texts.length > 200) { notify('this notebook holds up to 200 circles. try a smaller list.'); return; }
    if (state.edges.length + texts.length - (state.nodes.length ? 0 : 1) > 3000) { notify('remove some connections before adding more concepts.'); return; }
    let previous = state.nodes.at(-1);
    const baseY = state.nodes.length ? Math.max(...state.nodes.map(n => n.y)) + 240 : 0;
    texts.forEach((text, i) => {
      const row = Math.floor(i / 4), col = row % 2 ? 3 - i % 4 : i % 4;
      const n = { id: uid(), text, color: colors[(state.nodes.length) % colors.length], x: col * 235, y: baseY + row * 235 };
      if (previous) state.edges.push({ from: previous.id, to: n.id });
      state.nodes.push(n); previous = n;
    });
    selected = previous.id; setMode('select'); render(); fit(); commit();
    notify(`${texts.length} ${texts.length === 1 ? 'idea added' : 'ideas added'}. make yourself some connections.`);
  }
  $('viewport').addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.node, .edge-group, #empty')) return;
    gesture = { type: 'pan', px: event.clientX, py: event.clientY, x: view.x, y: view.y };
    $('viewport').setPointerCapture(event.pointerId); $('viewport').classList.add('panning');
    $('viewport').focus({ preventScroll: true });
  });
  $('viewport').addEventListener('pointermove', event => {
    if (!gesture) return;
    if (gesture.type === 'pan') {
      view.x = gesture.x + event.clientX - gesture.px; view.y = gesture.y + event.clientY - gesture.py; applyView();
    } else {
      const p = point(event.clientX, event.clientY), n = state.nodes.find(n => n.id === gesture.id);
      n.x = Math.max(-100000, Math.min(100000, gesture.x + p.x - gesture.px)); n.y = Math.max(-100000, Math.min(100000, gesture.y + p.y - gesture.py));
      const el = [...$('nodes').children].find(el => el.dataset.id === n.id);
      el.style.left = `${n.x - radius}px`; el.style.top = `${n.y - radius}px`; drawEdges();
    }
  });
  function endGesture() {
    if (!gesture) return;
    if (gesture.type === 'node') commit(); else saveSoon();
    gesture = null; $('viewport').classList.remove('panning');
  }
  $('viewport').addEventListener('pointerup', endGesture);
  $('viewport').addEventListener('pointercancel', endGesture);
  $('viewport').addEventListener('lostpointercapture', endGesture);
  $('viewport').addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); }
  }, { passive: false });
  $('generate').onclick = () => {
    const texts = $('concepts').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const before = state.nodes.length; addConcepts(texts);
    if (state.nodes.length > before) $('concepts').value = '';
  };
  $('add').onclick = () => { addConcepts(['']); const text = [...$('nodes').children].find(el => el.dataset.id === selected)?.querySelector('textarea'); text?.focus(); };
  $('example').onclick = () => addConcepts(['a big idea', 'a useful detail', 'a new possibility', 'something to explore']);
  $('select').onclick = () => setMode('select'); $('connect').onclick = () => setMode(mode === 'connect' ? 'select' : 'connect');
  $('zoom-in').onclick = () => zoom(1.2); $('zoom-out').onclick = () => zoom(1 / 1.2); $('fit').onclick = fit;
  $('node-text').addEventListener('input', () => {
    const n = state.nodes.find(n => n.id === selected); if (!n) return;
    n.text = $('node-text').value;
    const el = [...$('nodes').children].find(el => el.dataset.id === n.id); const text = el.querySelector('textarea'); text.value = n.text; fitBubbleText(text); saveSoon();
  });
  $('node-text').addEventListener('change', () => { commit(); drawEdges(); });
  function setColor(color) {
    const n = state.nodes.find(n => n.id === selected); if (!n) return;
    n.color = color; const el = [...$('nodes').children].find(el => el.dataset.id === n.id);
    el.style.background = color; el.style.color = ink(color); updateSelection(false); saveSoon();
  }
  colors.forEach((color, i) => {
    const button = document.createElement('button'); button.className = 'swatch'; button.dataset.color = color;
    button.style.setProperty('--swatch', color); button.setAttribute('aria-label', ['sage', 'peach', 'sky', 'lavender', 'butter', 'mint'][i]);
    button.onclick = () => { setColor(color); commit(); }; $('palette').append(button);
  });
  $('node-color').addEventListener('input', event => setColor(event.target.value));
  $('node-color').addEventListener('change', commit);
  function deleteSelected() {
    if (!selected) return;
    state.nodes = state.nodes.filter(n => n.id !== selected); state.edges = state.edges.filter(e => e.from !== selected && e.to !== selected);
    selected = null; source = null; render(); commit(); notify('circle removed. undo brings it back.');
  }
  $('delete').onclick = deleteSelected;
  function undoRedo(delta) {
    commit(); const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    historyIndex = next; state = JSON.parse(history[next]); selected = null; source = null; render();
    $('undo').disabled = historyIndex <= 0; $('redo').disabled = historyIndex >= history.length - 1; persist();
  }
  $('undo').onclick = () => undoRedo(-1); $('redo').onclick = () => undoRedo(1);
  $('map-title').addEventListener('input', event => { state.title = event.target.value; saveSoon(); });
  $('map-title').addEventListener('change', commit);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { setMode('select'); return; }
    if (event.target.matches('textarea,input,[contenteditable=true]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undoRedo(event.shiftKey ? 1 : -1); }
    if (event.key === 'Delete' || event.key === 'Backspace') { if (selected) { event.preventDefault(); deleteSelected(); } }
  });
  $('export').onclick = () => {
    persist(); const blob = new Blob([JSON.stringify({ ...state, view }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${(state.title || 'concept-map').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'concept-map'}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('editable copy downloaded.');
  };
  $('import').onclick = () => $('file').click();
  function finishImport() {
    if (!pendingImport) return;
    state = pendingImport; pendingImport = null; selected = null; setMode('select'); render(); fit(); commit(); notify('map opened. your ideas are all here.');
  }
  $('file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('choose a concept map file smaller than 2 mb.');
      pendingImport = validate(JSON.parse(await file.text()));
      if (state.nodes.length) $('confirm-dialog').showModal(); else finishImport();
    } catch (error) { pendingImport = null; notify(error instanceof SyntaxError ? 'that file is not valid json.' : error.message); }
  });
  $('cancel-open').onclick = () => { pendingImport = null; $('confirm-dialog').close(); };
  $('confirm-open').onclick = () => { $('confirm-dialog').close(); finishImport(); };
  $('confirm-dialog').addEventListener('cancel', () => { pendingImport = null; });
  window.addEventListener('pagehide', persist);
  let fitInitialMap = false;
  let starter = null, savedRaw = null, starterLoaded = false;
  // Starter maps must load even when a browser blocks local-file storage.
  try {
    if ($('initial-map')) starter = validate(JSON.parse($('initial-map').textContent));
  } catch { notify('the starter map could not be read. open the editable json copy.'); }
  try {
    savedRaw = localStorage.getItem(key);
    starterLoaded = localStorage.getItem(`${key}:initial-map-loaded`) === '1';
  } catch { storageOK = false; }
  let saved = null;
  try {
    if (savedRaw) saved = JSON.parse(savedRaw);
    if (saved) state = validate(saved);
  } catch {
    saved = null;
    notify('couldn’t restore the saved map. using the starter ideas where available.');
  }
  // Repair an empty autosave made before starter-map initialization was supported.
  // Once initialized, intentionally emptied maps remain empty on future reloads.
  if (starter && (!saved || (!state.nodes.length && !starterLoaded))) {
    state = starter;
    fitInitialMap = true;
  } else if (saved?.view && Number.isFinite(saved.view.x) && Number.isFinite(saved.view.y) && Number.isFinite(saved.view.scale) && saved.view.scale >= .001 && saved.view.scale <= 2) {
    view = { x: saved.view.x, y: saved.view.y, scale: saved.view.scale };
  }
  render();
  if (fitInitialMap) fit();
  commit();
})();
