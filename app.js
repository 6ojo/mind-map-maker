(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const colors = ['#e3eacb', '#f1c6b7', '#cbdde9', '#e3d3eb', '#f1dfa7', '#d5e5dc'];
  const key = document.body.dataset.storageKey || 'ga2-little-connections-v1';
  const radius = 82;
  const nodeScale = n => n.scale ?? 1;
  const nodeRadius = n => radius * nodeScale(n);
  let state = { version: 1, title: 'untitled possibilities', nodes: [], edges: [], groups: [] };
  let view = { x: 0, y: 0, scale: 1 };
  let selected = null, mode = 'select', source = null, gesture = null, pendingImport = null;
  let selectedIds = new Set();
  const selectedNodes = () => state.nodes.filter(n => selectedIds.has(n.id));
  function selectNodes(ids) { selectedIds = new Set(ids); selected = selectedIds.values().next().value || null; }
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
      if (n.scale !== undefined && (!Number.isFinite(n.scale) || n.scale < .5 || n.scale > 2.5)) throw new Error('the file contains an invalid bubble size.');
      ids.add(n.id);
      return { id: n.id, text: n.text, color: n.color, x: n.x, y: n.y, scale: nodeScale(n) };
    });
    const pairs = new Set();
    const edges = input.edges.map(e => {
      if (!e || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) throw new Error('the file contains an invalid connection.');
      const pair = JSON.stringify([e.from, e.to].sort());
      if (pairs.has(pair)) throw new Error('the file contains duplicate connections.');
      pairs.add(pair);
      return { from: e.from, to: e.to };
    });
    if (input.groups !== undefined && (!Array.isArray(input.groups) || input.groups.length > 100)) throw new Error('the file contains invalid selection groups.');
    const groupIds = new Set();
    const groups = (input.groups || []).map(g => {
      if (!g || typeof g.id !== 'string' || !g.id || g.id.length > 100 || groupIds.has(g.id) || typeof g.name !== 'string' || !g.name.trim() || g.name.length > 80 || !Array.isArray(g.nodeIds) || !g.nodeIds.length || g.nodeIds.length > 200 || new Set(g.nodeIds).size !== g.nodeIds.length || !g.nodeIds.every(id => ids.has(id))) throw new Error('the file contains an invalid selection group.');
      groupIds.add(g.id);
      return { id: g.id, name: g.name, nodeIds: [...g.nodeIds] };
    });
    return { version: 1, title: input.title, nodes, edges, groups };
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
    const minX = Math.min(...state.nodes.map(n => n.x - nodeRadius(n))) - 35;
    const minY = Math.min(...state.nodes.map(n => n.y - nodeRadius(n))) - 35;
    const maxX = Math.max(...state.nodes.map(n => n.x + nodeRadius(n))) + 35;
    const maxY = Math.max(...state.nodes.map(n => n.y + nodeRadius(n))) + 35;
    const scale = Math.max(.001, Math.min(1, (r.width - 40) / (maxX - minX), (r.height - 210) / (maxY - minY)));
    view = { scale, x: r.width / 2 - (minX + maxX) / 2 * scale, y: (r.height + 85) / 2 - (minY + maxY) / 2 * scale };
    applyView(); saveSoon();
  }
  function ink(color) {
    const rgb = color.match(/\w\w/g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2] > .179 ? '#25332b' : '#ffffff';
  }
  function updateSelection(syncText = true) {
    const chosen = selectedNodes(), n = chosen[0], count = chosen.length;
    $('properties').disabled = !count;
    $('selection-hint').textContent = count > 1 ? `${count} bubbles selected · color and size apply to the whole selection.` : count ? '1 bubble selected · ctrl-click to add or remove bubbles.' : 'ctrl-drag a box to select bubbles, or click one to edit it.';
    $('node-text').disabled = count !== 1;
    $('node-text').placeholder = count > 1 ? 'select one bubble to edit its text' : 'what’s the idea?';
    if (syncText) $('node-text').value = count === 1 ? n.text : '';
    $('node-color').value = n?.color || colors[0];
    $('node-scale').value = Math.round(nodeScale(n || {}) * 100);
    const sameSize = chosen.every(item => nodeScale(item) === nodeScale(n));
    $('node-scale-value').value = count && !sameSize ? 'mixed' : `${$('node-scale').value}%`;
    $('delete').textContent = count > 1 ? `⌫ remove ${count} bubbles` : '⌫ remove circle';
    $('group-name').disabled = !count;
    $('save-group').disabled = !count;
    document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('chosen', !!count && chosen.every(item => b.dataset.color === item.color)));
    document.querySelectorAll('.node').forEach(el => {
      el.classList.toggle('selected', selectedIds.has(el.dataset.id));
      el.classList.toggle('connect-source', el.dataset.id === source);
      el.dataset.selected = selectedIds.has(el.dataset.id);
    });
    renderGroups();
  }
  function renderGroups() {
    $('group-list').replaceChildren();
    $('groups-empty').hidden = !!state.groups.length;
    state.groups.forEach(group => {
      const row = document.createElement('li');
      const recall = document.createElement('button');
      recall.className = 'recall-group';
      recall.textContent = `${group.name} · ${group.nodeIds.length}`;
      recall.title = 'select these bubbles';
      const active = group.nodeIds.length === selectedIds.size && group.nodeIds.every(id => selectedIds.has(id));
      recall.classList.toggle('active', active); recall.setAttribute('aria-pressed', active);
      recall.onclick = () => { selectNodes(group.nodeIds); setMode('select'); notify(`${group.name}: ${group.nodeIds.length} bubbles selected.`); };
      const remove = document.createElement('button'); remove.textContent = '×'; remove.className = 'remove-group';
      remove.setAttribute('aria-label', `remove saved group ${group.name}; keep its bubbles`);
      remove.title = 'remove group; keep bubbles';
      remove.onclick = () => { state.groups = state.groups.filter(g => g.id !== group.id); commit(); renderGroups(); };
      row.append(recall, remove); $('group-list').append(row);
    });
  }
  function setMode(next) {
    mode = next; source = null;
    $('viewport').classList.toggle('connecting', mode === 'connect');
    for (const name of ['select', 'connect']) {
      $(name).classList.toggle('active', mode === name);
      $(name).setAttribute('aria-pressed', mode === name);
    }
    $('mode-hint').textContent = mode === 'connect' ? 'pick two circles to connect · esc to stop' : 'middle-drag to pan · ctrl-drag to select';
    updateSelection();
  }
  function choose(id, toggle = false) {
    if (mode === 'connect') selectNodes([id]);
    else if (toggle) {
      const ids = new Set(selectedIds); if (ids.has(id)) ids.delete(id); else ids.add(id);
      selectNodes(ids);
    } else if (!selectedIds.has(id)) selectNodes([id]);
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
      const start = nodeRadius(a) + 3, end = nodeRadius(b) + 3;
      const fraction = Math.min(1, length / (start + end + 1));
      const attrs = { x1: a.x + dx / length * start * fraction, y1: a.y + dy / length * start * fraction, x2: b.x - dx / length * end * fraction, y2: b.y - dy / length * end * fraction };
      const g = svgEl('g', { class: 'edge-group', tabindex: 0, role: 'button', 'aria-label': `disconnect ${a.text || 'blank circle'} from ${b.text || 'blank circle'}` });
      const title = svgEl('title', {}); title.textContent = 'click to disconnect'; g.append(title);
      g.append(svgEl('line', { ...attrs, class: 'edge' }), svgEl('line', { ...attrs, class: 'edge-hit' }));
      const remove = () => { state.edges = state.edges.filter(edge => edge !== e); commit(); drawEdges(); updateCounts(); notify('connection snipped. undo brings it back.'); };
      g.addEventListener('pointerdown', event => event.stopPropagation());
      g.addEventListener('click', event => { if (event.button === 0 && !event.ctrlKey) remove(); });
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
    const scale = parseFloat(text.parentElement.style.getPropertyValue('--bubble-scale')) || 1;
    const maxHeight = 108 * scale;
    const verticalBuffer = 4 * scale;
    text.style.height = `${maxHeight - verticalBuffer}px`;
    const words = (text.value || text.placeholder).match(/\S+/gu) || [];
    const style = getComputedStyle(text);
    const family = style.fontFamily;
    const safeWidth = text.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4 * scale;
    let low = .1, high = 64 * scale;
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
  function positionBubble(el, n) {
    const r = nodeRadius(n);
    el.style.setProperty('--bubble-scale', nodeScale(n));
    el.style.width = `${r * 2}px`;
    el.style.height = `${r * 2}px`;
    el.style.left = `${n.x - r}px`;
    el.style.top = `${n.y - r}px`;
  }
  function render() {
    $('map-title').value = state.title;
    $('nodes').replaceChildren();
    state.nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'node'; el.dataset.id = n.id; el.tabIndex = 0;
      el.setAttribute('role', 'group'); el.setAttribute('aria-label', `circle: ${n.text || 'blank'}. use arrow keys to move; enter to select or connect.`);
      positionBubble(el, n); el.style.background = n.color; el.style.color = ink(n.color);
      const text = document.createElement('textarea'); text.value = n.text; text.maxLength = 500; text.placeholder = 'an idea…';
      text.setAttribute('aria-label', 'circle text'); text.spellcheck = true;
      text.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.stopPropagation(); choose(n.id); });
      text.addEventListener('focus', () => { if (!selectedIds.has(n.id)) { selectNodes([n.id]); updateSelection(); } });
      text.addEventListener('input', () => { n.text = text.value; fitBubbleText(text); if (selectedIds.size === 1 && selectedIds.has(n.id)) $('node-text').value = n.text; saveSoon(); });
      text.addEventListener('change', () => { commit(); drawEdges(); });
      el.append(text);
      el.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.stopPropagation(); choose(n.id);
        if (mode === 'connect') return;
        const p = point(event.clientX, event.clientY);
        gesture = { type: 'node', px: p.x, py: p.y, nodes: selectedNodes().map(item => ({ id: item.id, x: item.x, y: item.y })) };
        $('viewport').setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      el.addEventListener('keydown', event => {
        if (event.target !== el) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(n.id); }
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (directions[event.key]) {
          event.preventDefault(); if (!selectedIds.has(n.id)) selectNodes([n.id]);
          const d = directions[event.key], step = event.shiftKey ? 40 : 10;
          moveNodes(selectedNodes().map(item => ({ id: item.id, x: item.x, y: item.y })), d[0] * step, d[1] * step);
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
    const baseY = state.nodes.length ? Math.max(...state.nodes.map(n => n.y + nodeRadius(n))) + radius + 76 : 0;
    texts.forEach((text, i) => {
      const row = Math.floor(i / 4), col = row % 2 ? 3 - i % 4 : i % 4;
      const n = { id: uid(), text, color: colors[(state.nodes.length) % colors.length], x: col * 235, y: baseY + row * 235, scale: 1 };
      if (previous) state.edges.push({ from: previous.id, to: n.id });
      state.nodes.push(n); previous = n;
    });
    selectNodes([previous.id]); setMode('select'); render(); fit(); commit();
    notify(`${texts.length} ${texts.length === 1 ? 'idea added' : 'ideas added'}. make yourself some connections.`);
  }
  function moveNodes(originals, dx, dy) {
    dx = Math.max(-100000 - Math.min(...originals.map(n => n.x)), Math.min(100000 - Math.max(...originals.map(n => n.x)), dx));
    dy = Math.max(-100000 - Math.min(...originals.map(n => n.y)), Math.min(100000 - Math.max(...originals.map(n => n.y)), dy));
    const byId = new Map(state.nodes.map(n => [n.id, n]));
    const elements = new Map([...$('nodes').children].map(el => [el.dataset.id, el]));
    originals.forEach(original => {
      const n = byId.get(original.id); n.x = original.x + dx; n.y = original.y + dy;
      positionBubble(elements.get(n.id), n);
    });
  }
  function beginPan(event) {
    gesture = { type: 'pan', px: event.clientX, py: event.clientY, x: view.x, y: view.y, button: event.button, moved: false };
    $('viewport').setPointerCapture(event.pointerId); $('viewport').classList.add('panning');
    $('viewport').focus({ preventScroll: true }); event.preventDefault();
  }
  // Capture modified drags before bubble editors and connection lines consume them.
  $('viewport').addEventListener('pointerdown', event => {
    if (event.button === 1) { event.stopImmediatePropagation(); beginPan(event); return; }
    if (event.button === 0 && event.ctrlKey) {
      setMode('select');
      event.stopImmediatePropagation(); event.preventDefault();
      const p = point(event.clientX, event.clientY);
      gesture = { type: 'box', px: event.clientX, py: event.clientY, start: p, previous: [...selectedIds], additive: event.shiftKey, moved: false, targetId: event.target.closest('.node')?.dataset.id };
      $('selection-box').hidden = false; $('viewport').classList.add('box-selecting');
      const r = $('viewport').getBoundingClientRect();
      Object.assign($('selection-box').style, { left: `${event.clientX - r.left}px`, top: `${event.clientY - r.top}px`, width: '0px', height: '0px' });
      $('viewport').setPointerCapture(event.pointerId); $('viewport').focus({ preventScroll: true });
    }
  }, true);
  $('viewport').addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });
  $('viewport').addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.node, .edge-group, #empty')) return;
    beginPan(event);
  });
  $('viewport').addEventListener('pointermove', event => {
    if (!gesture) return;
    if (gesture.type === 'pan') {
      gesture.moved ||= Math.hypot(event.clientX - gesture.px, event.clientY - gesture.py) > 3;
      view.x = gesture.x + event.clientX - gesture.px; view.y = gesture.y + event.clientY - gesture.py; applyView();
    } else if (gesture.type === 'box') {
      gesture.moved ||= Math.hypot(event.clientX - gesture.px, event.clientY - gesture.py) > 3;
      const p = point(event.clientX, event.clientY), a = gesture.start;
      const left = Math.min(a.x, p.x), right = Math.max(a.x, p.x), top = Math.min(a.y, p.y), bottom = Math.max(a.y, p.y);
      const screen = $('viewport').getBoundingClientRect();
      Object.assign($('selection-box').style, { left: `${Math.min(event.clientX, gesture.px) - screen.left}px`, top: `${Math.min(event.clientY, gesture.py) - screen.top}px`, width: `${Math.abs(event.clientX - gesture.px)}px`, height: `${Math.abs(event.clientY - gesture.py)}px` });
      const inside = state.nodes.filter(n => n.x - nodeRadius(n) >= left && n.x + nodeRadius(n) <= right && n.y - nodeRadius(n) >= top && n.y + nodeRadius(n) <= bottom).map(n => n.id);
      selectNodes(gesture.additive ? [...new Set([...gesture.previous, ...inside])] : inside);
      updateSelection();
    } else {
      const p = point(event.clientX, event.clientY);
      moveNodes(gesture.nodes, p.x - gesture.px, p.y - gesture.py); drawEdges();
    }
  });
  function endGesture(event) {
    if (!gesture) return;
    if (gesture.type === 'node') commit();
    else if (gesture.type === 'box') {
      if (event.type === 'pointercancel') selectNodes(gesture.previous);
      else if (!gesture.moved) {
        selectNodes(gesture.previous);
        if (gesture.targetId) choose(gesture.targetId, true); else if (!gesture.additive) selectNodes([]);
      }
      $('selection-box').hidden = true; $('viewport').classList.remove('box-selecting'); updateSelection();
    } else {
      if (!gesture.moved && gesture.button === 0) { selectNodes([]); updateSelection(); }
      saveSoon();
    }
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
    const n = selectedNodes()[0]; if (!n || selectedIds.size !== 1) return;
    n.text = $('node-text').value;
    const el = [...$('nodes').children].find(el => el.dataset.id === n.id); const text = el.querySelector('textarea'); text.value = n.text; fitBubbleText(text); saveSoon();
  });
  $('node-text').addEventListener('change', () => { commit(); drawEdges(); });
  function setColor(color) {
    selectedNodes().forEach(n => {
      n.color = color; const el = [...$('nodes').children].find(el => el.dataset.id === n.id);
      el.style.background = color; el.style.color = ink(color);
    });
    updateSelection(false); saveSoon();
  }
  colors.forEach((color, i) => {
    const button = document.createElement('button'); button.className = 'swatch'; button.dataset.color = color;
    button.style.setProperty('--swatch', color); button.setAttribute('aria-label', ['sage', 'peach', 'sky', 'lavender', 'butter', 'mint'][i]);
    button.onclick = () => { setColor(color); commit(); }; $('palette').append(button);
  });
  $('node-color').addEventListener('input', event => setColor(event.target.value));
  $('node-color').addEventListener('change', commit);
  function resizeBubble(n, scale) {
    n.scale = scale;
    const el = [...$('nodes').children].find(el => el.dataset.id === n.id);
    positionBubble(el, n);
    fitBubbleText(el.querySelector('textarea'));
  }
  $('node-scale').addEventListener('input', event => {
    const scale = Number(event.target.value) / 100;
    selectedNodes().forEach(n => resizeBubble(n, scale));
    updateSelection(false); drawEdges(); saveSoon();
  });
  $('node-scale').addEventListener('change', commit);
  $('scale-all').onclick = () => {
    const scale = Number($('node-scale').value) / 100;
    state.nodes.forEach(n => resizeBubble(n, scale));
    drawEdges(); commit(); notify(`all bubbles set to ${Math.round(scale * 100)}%.`);
  };
  $('save-group').onclick = () => {
    if (!selectedIds.size) return;
    const name = $('group-name').value.trim();
    if (!name) { notify('give this selection a group name first.'); $('group-name').focus(); return; }
    if (state.groups.length >= 100) { notify('this map already has 100 saved groups.'); return; }
    if (state.groups.some(g => g.name.toLowerCase() === name.toLowerCase())) { notify('that group name is already taken. choose a new name.'); return; }
    state.groups.push({ id: uid(), name, nodeIds: [...selectedIds] });
    $('group-name').value = ''; commit(); renderGroups(); notify(`saved group: ${name}.`);
  };
  $('group-name').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('save-group').click(); } });
  function deleteSelected() {
    if (!selectedIds.size) return;
    state.nodes = state.nodes.filter(n => !selectedIds.has(n.id)); state.edges = state.edges.filter(e => !selectedIds.has(e.from) && !selectedIds.has(e.to));
    state.groups = state.groups.map(g => ({ ...g, nodeIds: g.nodeIds.filter(id => !selectedIds.has(id)) })).filter(g => g.nodeIds.length);
    selectNodes([]); source = null; render(); commit(); notify('selection removed. undo brings it back.');
  }
  $('delete').onclick = deleteSelected;
  function undoRedo(delta) {
    commit(); const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    historyIndex = next; state = JSON.parse(history[next]); selectNodes([]); source = null; render();
    $('undo').disabled = historyIndex <= 0; $('redo').disabled = historyIndex >= history.length - 1; persist();
  }
  $('undo').onclick = () => undoRedo(-1); $('redo').onclick = () => undoRedo(1);
  $('map-title').addEventListener('input', event => { state.title = event.target.value; saveSoon(); });
  $('map-title').addEventListener('change', commit);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (gesture?.type === 'box') { selectNodes(gesture.previous); gesture = null; $('selection-box').hidden = true; $('viewport').classList.remove('box-selecting'); }
      else selectNodes([]);
      setMode('select'); return;
    }
    if (event.target.matches('textarea,input,[contenteditable=true]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undoRedo(event.shiftKey ? 1 : -1); }
    if (event.key === 'Delete' || event.key === 'Backspace') { if (selectedIds.size) { event.preventDefault(); deleteSelected(); } }
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
    state = pendingImport; pendingImport = null; selectNodes([]); setMode('select'); render(); fit(); commit(); notify('map opened. your ideas are all here.');
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
