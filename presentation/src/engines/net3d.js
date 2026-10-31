// The statement's example network in 3D: one data center, three 100 MB caches, two endpoints.
// Cable length follows latency; request packets travel out and back at a speed set by that latency.
// Optional: every scene has a 2D fallback if WebGL is missing.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { STATEMENT } from '../content/facts.js';
import { parse } from '../solver/engine.js';

const INST = parse(STATEMENT.exampleIn);
const POS = {
  dc: new THREE.Vector3(-5.8, 0, -4.4),
  c: [new THREE.Vector3(2.3, 0, 0.6), new THREE.Vector3(-1.5, 0, -1.3), new THREE.Vector3(0.5, 0, -0.45)],
  e: [new THREE.Vector3(4.6, 0, 2.6), new THREE.Vector3(-3.6, 0, 3.0)],
};
export const VIEWS = {
  title: { pos: [6.5, 8.5, 16.5], target: [-4.6, 0.4, 0.2] },
  hero: { pos: [9.5, 7.2, 12.5], target: [-0.6, 0.5, -0.6] },
  wide: { pos: [12.5, 9.5, 15.5], target: [-0.8, 0.6, -0.8] },
  explode: { pos: [13, 13.5, 19], target: [-4.6, 4.0, -0.4] },
};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const col = n => new THREE.Color(css(n) || '#888');

export async function createNetwork({ container, labels, lite = false, theme = 'light' }) {
  const renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(1920, 1080, false);
  renderer.domElement.style.width = '1920px'; renderer.domElement.style.height = '1080px';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  const labelR = new CSS2DRenderer({ element: labels });
  labelR.setSize(1920, 1080);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1920 / 1080, 0.1, 300);
  const camTarget = new THREE.Vector3();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(8, 14, 9); sun.castShadow = !lite;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  scene.add(sun);

  const world = new THREE.Group(); scene.add(world);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, ...o });
  const box = (w, h, d, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.castShadow = !lite; b.receiveShadow = !lite; return b; };
  const label = (html, cls = 'lbl3d') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return new CSS2DObject(d); };
  const allLabels = [];

  // ground
  const groundMat = std(0xe9e6de, { roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = !lite; world.add(ground);
  let grid = new THREE.GridHelper(40, 40, 0xc9c4b9, 0xd9d5cc); grid.position.y = 0.002; world.add(grid);

  // data center
  const dcMat = std(0x9aa3ad), dcDark = std(0x3c4651), roofMat = std(0x7d8792);
  const dc = new THREE.Group(); dc.position.copy(POS.dc); world.add(dc);
  const hall = box(3.4, 2.3, 2.4, dcMat); hall.position.y = 1.15; dc.add(hall);
  for (let r = 0; r < 3; r++) { const w = box(3.0, 0.16, 0.02, dcDark); w.position.set(0, 0.55 + r * 0.6, 1.21); dc.add(w); }
  for (let i = 0; i < 3; i++) { const u = box(0.6, 0.3, 0.6, roofMat); u.position.set(-1 + i, 2.45, -0.3); dc.add(u); }
  const dcL = label('Data center <small>every video</small>', 'lbl3d dc'); dcL.position.set(0, 3.0, 0); dc.add(dcL); allLabels.push(dcL);

  // caches (racks) with their stored videos
  const rackMat = std(0x2b3036, { roughness: 0.55, metalness: 0.25 }), unitMat = std(0x3a4148), ledMat = std(0x2e7c80, { emissive: 0x2e7c80, emissiveIntensity: 0.35 });
  const racks = POS.c.map((p, c) => {
    const g = new THREE.Group(); g.position.copy(p); world.add(g);
    const body = box(0.8, 2.0, 0.9, rackMat); body.position.y = 1.0; g.add(body);
    for (let u = 0; u < 8; u++) { const s = box(0.66, 0.012, 0.02, unitMat); s.position.set(0, 0.2 + u * 0.22, 0.46); g.add(s); }
    const led = box(0.06, 0.06, 0.02, ledMat); led.position.set(0.3, 1.9, 0.46); g.add(led);
    const slabs = new THREE.Group(); slabs.position.set(0, 0.12, 0.47); g.add(slabs);
    const L = label(`Cache ${c} <small>${INST.X} MB</small>`, 'lbl3d cache'); L.position.set(0, 2.45, 0); g.add(L); allLabels.push(L);
    return { g, slabs };
  });

  // endpoints: a platform of small screens
  const padMat = std(0xd2cdc2), standMat = std(0x50565d), screenMat = std(0x2d3540, { emissive: 0x4d6079, emissiveIntensity: 0.25 });
  POS.e.forEach((p, e) => {
    const g = new THREE.Group(); g.position.copy(p); world.add(g);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.08, 40), padMat); pad.position.y = 0.04; pad.receiveShadow = !lite; g.add(pad);
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45, x = Math.sin(a) * 0.55, z = Math.cos(a) * 0.55 - 0.15;
      const st = box(0.03, 0.32, 0.03, standMat); st.position.set(x, 0.24, z); g.add(st);
      const sc = box(0.36, 0.24, 0.03, screenMat); sc.position.set(x, 0.48, z); sc.rotation.y = a; g.add(sc);
    }
    const k = INST.links[e].length;
    const L = label(`Endpoint ${e} <small>${k ? k + ' caches' : 'no cache'}</small>`, 'lbl3d ep'); L.position.set(0, 1.05, 0); g.add(L); allLabels.push(L);
  });

  // cables: fibre for cache links, dashed grey for the data-center route
  const routes = {}; // `${e}:${server}` -> curve ; server = 'dc' or cache id
  const fibreMat = new THREE.MeshStandardMaterial({ color: 0xc4581c, roughness: 0.5 });
  const dashMat = new THREE.LineDashedMaterial({ color: 0x7b8088, dashSize: 0.22, gapSize: 0.14 });
  function cable(a, b, lift, server, e, ms) {
    const mid = a.clone().lerp(b, 0.5); mid.y = lift;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    if (server === 'dc') {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), dashMat); line.computeLineDistances(); world.add(line);
    } else {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.028, 8), fibreMat); world.add(tube);
    }
    const L = label(`${ms} ms`, 'lbl3d ' + (server === 'dc' ? 'dc' : 'cache')); L.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.25, 0)); world.add(L); allLabels.push(L);
    routes[`${e}:${server}`] = curve;
  }
  POS.e.forEach((p, e) => {
    const from = p.clone().setY(0.55);
    cable(from, POS.dc.clone().setY(1.6), 3.2, 'dc', e, INST.ld[e]);
    INST.links[e].forEach(([c, ms]) => cable(from, POS.c[c].clone().setY(1.7), 1.4 + ms / 300, c, e, ms));
  });

  // explode floors: the solving pipeline stacked above the network
  const FLOORS = [
    { y: 3.3, title: '01 · Read & index', sub: 'each cache only sees videos its users ask for' },
    { y: 4.45, title: '02 · Greedy fill', sub: 'best saving per MB first · evict · swap' },
    { y: 5.6, title: '03 · Exact re-pack', sub: 'one cache at a time, solved exactly' },
    { y: 6.75, title: '04 · Large neighbourhood search', sub: 'empty two caches, rebuild them together' },
    { y: 7.9, title: '05 · Exact solver', sub: 'small cases: proven optimum · large: a bound' },
  ];
  const floors = FLOORS.map((F, i) => {
    const g = new THREE.Group(); g.position.y = 1.2; g.visible = false; world.add(g);
    const mats = [];
    const plateM = new THREE.MeshBasicMaterial({ color: 0x2b3036, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(10, 0.02, 7.4), plateM); g.add(plate); mats.push([plateM, 0.06]);
    const edgeM = new THREE.LineBasicMaterial({ color: 0x2b3036, transparent: true, opacity: 0 });
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), edgeM)); mats.push([edgeM, 0.5]);
    const add = (m, op = 1) => { m.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0; mats.push([o.material, op]); } }); g.add(m); return m; };
    if (i === 0) for (let k = 0; k < 3; k++) { const f = box(1.1, 0.04, 0.8, std(0xfbfaf6)); f.position.set(-0.6 + k * 0.25, 0.05 + k * 0.05, -0.2 + k * 0.1); add(f); }
    if (i === 1) for (let k = 0; k < 6; k++) { const b = box(0.36, 1.2 - k * 0.18, 0.36, std(0xa3771f)); b.position.set(-1.2 + k * 0.48, (1.2 - k * 0.18) / 2, 0); add(b); }
    if (i === 2) { const r = box(0.8, 1.2, 0.9, rackMat); r.position.y = 0.6; add(r); [0.42, 0.3, 0.3].forEach((h, k) => { const s = box(0.7, h - 0.02, 0.05, std([0x5a79a5, 0xb9703a, 0x6e8c4c][k])); s.position.set(0, 0.12 + [0, 0.42, 0.72][k] + h / 2, 0.47); add(s); }); }
    if (i === 3) { [-0.9, 0.9].forEach(x => { const r = box(0.8, 1.2, 0.9, rackMat); r.position.set(x, 0.6, 0); add(r); }); const t = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 8, 48, Math.PI * 1.6), std(0xc4581c)); t.rotation.x = Math.PI / 2; t.position.y = 0.7; add(t); }
    if (i === 4) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 1.2, 1.6, 4, 2, 3)), new THREE.LineBasicMaterial({ color: 0x2e7a4a })); l.position.y = 0.6; add(l); }
    const L = label(`<b>${F.title}</b><span>${F.sub}</span>`, 'layerlbl off'); L.position.set(5.0, 0.05, -3.7); L.center.set(-0.04, 0.5); g.add(L);
    return { g, mats, L, y: F.y };
  });
  function setExplode(n, dur = 1.0, showLabels = false) {
    floors.forEach((f, i) => {
      const on = i < n;
      gsap.killTweensOf(f.g.position);
      if (on) f.g.visible = true;
      f.L.element.classList.toggle('off', !on || !showLabels);
      gsap.to(f.g.position, { y: on ? f.y : 1.2, duration: dur, ease: 'power2.out', onComplete: () => { if (!on) f.g.visible = false; } });
      f.mats.forEach(([m, op]) => { gsap.killTweensOf(m); gsap.to(m, { opacity: on ? op : 0, duration: dur * 0.8 }); });
    });
  }

  // stored videos shown as cartridges on the rack front
  function setPlacement(placed) {
    racks.forEach(({ slabs }, c) => {
      slabs.clear();
      let y = 0;
      for (const v of [...(placed?.[c] || [])]) {
        const h = INST.sizes[v] / INST.X * 1.7;
        const s = box(0.7, h - 0.03, 0.05, std(col(`--vid${v}`), { roughness: 0.6 }));
        s.position.y = y + h / 2; slabs.add(s); y += h;
        const L = label(`v${v}`, 'lbl3d'); L.element.style.fontSize = '15px'; L.position.set(0.55, y - h / 2, 0); slabs.add(L);
      }
    });
    current = placed;
  }

  // request packets
  let mode = 'idle', current = null, spawnT = 0;
  const packets = [];
  const pgeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const reqs = INST.requests.filter(r => r.n > 0);
  const totalN = reqs.reduce((s, r) => s + r.n, 0);
  function spawn() {
    let x = Math.random() * totalN, r = reqs[0];
    for (const q of reqs) { x -= q.n; if (x <= 0) { r = q; break; } }
    let server = 'dc', ms = INST.ld[r.e];
    if (mode === 'warm' && current) for (const [c, L] of INST.links[r.e]) if (current[c]?.has(r.v) && L < ms) { server = c; ms = L; }
    const curve = routes[`${r.e}:${server}`]; if (!curve) return;
    const m = new THREE.Mesh(pgeo, std(col(`--vid${r.v}`))); world.add(m);
    packets.push({ m, curve, t: 0, dur: 0.35 + ms / 1000 * 2.6 });
  }

  // camera
  function setView(name, dur = 1.6) {
    const v = VIEWS[name] || VIEWS.hero;
    gsap.killTweensOf(camera.position); gsap.killTweensOf(camTarget);
    if (!dur) { camera.position.set(...v.pos); camTarget.set(...v.target); camera.lookAt(camTarget); return; }
    gsap.to(camera.position, { x: v.pos[0], y: v.pos[1], z: v.pos[2], duration: dur, ease: 'power2.inOut' });
    gsap.to(camTarget, { x: v.target[0], y: v.target[1], z: v.target[2], duration: dur, ease: 'power2.inOut', onUpdate: () => camera.lookAt(camTarget) });
  }
  setView('hero', 0);

  let orbit = 0, spin = false, last = performance.now(), visible = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    if (spin) { orbit += dt * 0.05; const off = camera.position.clone().sub(camTarget); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.05); camera.position.copy(camTarget).add(off); camera.lookAt(camTarget); }
    if (mode !== 'idle') { spawnT -= dt; if (spawnT <= 0) { spawn(); spawnT = 0.16; } }
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i]; p.t += dt / p.dur;
      const u = p.t < 1 ? p.t : 2 - p.t;
      p.m.position.copy(p.curve.getPoint(Math.max(0, Math.min(1, u))));
      if (p.t >= 2) { world.remove(p.m); p.m.material.dispose(); packets.splice(i, 1); }
    }
    renderer.render(scene, camera);
    labelR.render(scene, camera);
  }
  requestAnimationFrame(frame);

  function setTheme(t) {
    const dark = t === 'dark';
    groundMat.color.set(dark ? 0x171a1d : 0xe9e6de);
    world.remove(grid); grid = new THREE.GridHelper(40, 40, dark ? 0x343c44 : 0xc9c4b9, dark ? 0x22282d : 0xd9d5cc); grid.position.y = 0.002; world.add(grid);
    padMat.color.set(dark ? 0x3a4148 : 0xd2cdc2);
    rackMat.color.set(dark ? 0x5a646e : 0x2b3036);
    dcMat.color.set(dark ? 0x7d8792 : 0x9aa3ad);
    dashMat.color.set(dark ? 0x9aa3ad : 0x7b8088);
    if (current) setPlacement(current);
  }
  setTheme(theme);

  return {
    VIEWS, setView, setExplode, setPlacement, setTheme,
    show(on) { visible = on; container.classList.toggle('hidden', !on); labels.style.display = on ? '' : 'none'; },
    setMode(m) { mode = m; if (m === 'idle') { packets.forEach(p => world.remove(p.m)); packets.length = 0; } },
    labels(on) { allLabels.forEach(l => l.element.classList.toggle('off', !on)); },
    spin(on) { spin = on; },
    resize(stageScale) { const pr = Math.max(0.6, Math.min(2, (window.devicePixelRatio || 1) * stageScale * (lite ? 0.75 : 1))); renderer.setPixelRatio(pr); renderer.setSize(1920, 1080, false); renderer.domElement.style.width = '1920px'; renderer.domElement.style.height = '1080px'; },
    reset() { setExplode(0, 0); this.setMode('idle'); spin = false; setPlacement(null); this.labels(true); },
  };
}
