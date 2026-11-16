'use strict';
// Liquid Glass, the parts CSS cannot do alone:
//  1. Refraction: floating glass (sidebar, tab pill, server picker, popovers, sheets, toasts) bends what is behind
//     it near its edges, like thick glass. Each gets an SVG displacement filter sized to it, used in backdrop-filter.
//  2. The selected tab sits on a glass pill that slides and stretches to the next tab.
//  3. A soft highlight follows the pointer over glass (style.css draws it from --mx/--my).
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduceGlass = matchMedia('(prefers-reduced-transparency: reduce)');

  // ---- 1. refraction ----------------------------------------------------------------------------
  // [selector, bezel px (how far in from the edge the bending reaches), scale (strength), blur px, saturate]
  const LENS = [
    ['#side', 22, 46, 22, 1.9],
    ['.nav-pill', 12, 34, 1, 1.6],
    ['.picker', 14, 30, 6, 1.8],
    ['.pop', 14, 36, 14, 1.9],
    ['.sheet', 24, 56, 16, 1.9],
    ['.toast', 16, 32, 14, 1.8],
  ];
  const LENS_SEL = LENS.map((l) => l[0]).join(',');
  const defs = document.createElementNS(NS, 'svg');
  defs.setAttribute('aria-hidden', 'true');
  defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  document.body.prepend(defs);

  // Displacement map for a rounded rectangle. Red/green say where each pixel samples from: 128 = itself.
  // Inside the rim, pixels sample from further in, so the edge magnifies and curves what is behind it.
  function lensMap(w, h, r, bezel) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data, hw = w / 2, hh = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x + 0.5 - hw, py = y + 0.5 - hh, qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
        let nx = 0, ny = 0, inside; // outward normal of the nearest edge, and distance in from that edge
        if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; inside = r - l; nx = (qx / l) * Math.sign(px); ny = (qy / l) * Math.sign(py); }
        else if (qx > qy) { inside = r - qx; nx = Math.sign(px); }
        else { inside = r - qy; ny = Math.sign(py); }
        const t = Math.max(0, Math.min(1, 1 - inside / bezel)), m = t * t, i = (y * w + x) * 4;
        d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  const lensed = new Map(); // element -> its <filter>
  function applyLens(el) {
    if (reduceGlass.matches) return;
    const spec = LENS.find((l) => el.matches(l[0])); if (!spec) return;
    const w = el.offsetWidth, h = el.offsetHeight; if (w < 8 || h < 8) return;
    const size = w + 'x' + h;
    let f = lensed.get(el);
    if (f && f.dataset.size === size) return;
    if (!f) { f = document.createElementNS(NS, 'filter'); f.id = 'lg' + Math.random().toString(36).slice(2, 9); defs.append(f); lensed.set(el, f); }
    const [, bezel, scale, blur, sat] = spec, r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
    f.dataset.size = size;
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
    f.innerHTML = `<feImage href="${lensMap(w, h, r, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`
      + `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>`;
    el.style.backdropFilter = `blur(${blur}px) url(#${f.id}) saturate(${sat})`;
  }
  const resized = new ResizeObserver((entries) => entries.forEach((e) => applyLens(e.target)));
  function adopt(root) {
    if (root.nodeType !== 1) return;
    const found = root.matches(LENS_SEL) ? [root] : [];
    found.push(...root.querySelectorAll(LENS_SEL));
    for (const el of found) if (!lensed.has(el)) { applyLens(el); resized.observe(el); }
  }
  function forget() { for (const [el, f] of lensed) if (!el.isConnected) { f.remove(); lensed.delete(el); resized.unobserve(el); } }

  // ---- 2. the sliding tab pill --------------------------------------------------------------------
  const side = document.getElementById('side'), nav = document.getElementById('nav');
  const pill = document.createElement('i'); pill.className = 'nav-pill'; pill.hidden = true; side.prepend(pill);
  let lastTab = null;
  function placePill() {
    const on = nav.querySelector('.nav.on');
    if (!on) { pill.hidden = true; lastTab = null; return; }
    const tab = on.dataset.tab, move = !pill.hidden && lastTab && tab !== lastTab && !reduceMotion.matches;
    pill.hidden = false;
    if (!move) pill.style.transition = 'none';
    Object.assign(pill.style, { top: on.offsetTop + 'px', left: on.offsetLeft + 'px', width: on.offsetWidth + 'px', height: on.offsetHeight + 'px' });
    if (!move) { void pill.offsetWidth; pill.style.transition = ''; }
    else {
      // stretch along the way like a drop of liquid, then settle; the glass clears while it moves
      pill.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(.92,1.4)', offset: 0.3 }, { transform: 'scale(1.04,.9)', offset: 0.7 }, { transform: 'scale(1,1)' }], { duration: 620, easing: 'ease-out' });
      pill.classList.add('moving'); clearTimeout(pill.t); pill.t = setTimeout(() => pill.classList.remove('moving'), 430);
      on.classList.add('arrive');
    }
    lastTab = tab;
    adopt(pill);
  }
  new MutationObserver(placePill).observe(nav, { childList: true });
  new ResizeObserver(() => { lastTab = null; placePill(); }).observe(side);

  // ---- 3. pointer highlight -------------------------------------------------------------------------
  const HL = '.btn,.picker,.tile,.hero,.join>div,.chip,.choice,.card,.group';
  let pending = null;
  document.addEventListener('pointermove', (e) => {
    if (!pending) requestAnimationFrame(() => {
      const ev = pending; pending = null;
      const el = ev.target instanceof Element && ev.target.closest(HL); if (!el) return;
      const b = el.getBoundingClientRect();
      el.style.setProperty('--mx', ev.clientX - b.left + 'px'); el.style.setProperty('--my', ev.clientY - b.top + 'px');
    });
    pending = e;
  }, { passive: true });

  // ---- wiring -----------------------------------------------------------------------------------------
  new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach(adopt); forget(); }).observe(document.body, { childList: true, subtree: true });
  adopt(document.body);
  placePill();
})();
