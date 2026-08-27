/* Agent Pi DSH — hero 3D construction site (Three.js, wireframe hologram style) */
import * as THREE from "../../showcase/vendor/three.module.min.js";

(function () {
  var canvas = document.getElementById("hero3d");
  if (!canvas) return;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isDark() { return document.documentElement.getAttribute("data-theme") !== "light"; }

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(33, 20, 46);

  /* ---------- materials (theme-aware) ---------- */
  var M = {
    line: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }),
    accent: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }),
    faint: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 }),
    points: new THREE.PointsMaterial({ size: 0.5, transparent: true, opacity: 0.9, depthWrite: false }),
    grid: null
  };

  function applyTheme() {
    var dark = isDark();
    M.line.color.set(dark ? 0x4f8dff : 0x2f6df0);
    M.line.opacity = dark ? 0.34 : 0.3;
    M.line.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    M.accent.color.set(dark ? 0x3ad6e8 : 0x0f9fb8);
    M.accent.opacity = dark ? 0.6 : 0.5;
    M.accent.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    M.faint.color.set(dark ? 0x4f8dff : 0x2f6df0);
    M.faint.opacity = dark ? 0.22 : 0.18;
    M.faint.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    M.points.color.set(dark ? 0x6fd8f0 : 0x2f8fd0);
    M.points.opacity = dark ? 0.7 : 0.6;
    M.points.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    M.grid.color.set(dark ? 0x2a4a8a : 0x9db8dd);
    M.grid.opacity = dark ? 0.13 : 0.13;
    [M.line, M.accent, M.faint, M.points, M.grid].forEach(function (m) { m.needsUpdate = true; });
  }

  function edges(geo, mat) {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat || M.line);
  }

  /* ---------- grid floor ---------- */
  var grid = new THREE.GridHelper(220, 55, 0x2a4a8a, 0x2a4a8a);
  grid.material.transparent = true;
  M.grid = grid.material;
  scene.add(grid);

  /* ---------- suspension bridge (z = -8) ---------- */
  var bridge = new THREE.Group();
  var deck = edges(new THREE.BoxGeometry(92, 0.9, 6));
  deck.position.set(0, 3.2, 0);
  bridge.add(deck);

  [-18, 18].forEach(function (x) {
    var tower = edges(new THREE.BoxGeometry(2, 17, 3.6));
    tower.position.set(x, 11, 0);
    bridge.add(tower);
    var cap = edges(new THREE.BoxGeometry(3, 1, 4.4), M.accent);
    cap.position.set(x, 19.6, 0);
    bridge.add(cap);
  });

  var cablePts = [
    new THREE.Vector3(-46, 3.6, 0),
    new THREE.Vector3(-18, 19.4, 0),
    new THREE.Vector3(0, 6.2, 0),
    new THREE.Vector3(18, 19.4, 0),
    new THREE.Vector3(46, 3.6, 0)
  ];
  [-2.4, 2.4].forEach(function (z) {
    var curve = new THREE.CatmullRomCurve3(cablePts.map(function (p) { return new THREE.Vector3(p.x, p.y, z); }));
    var geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(80));
    bridge.add(new THREE.Line(geo, M.accent));
    // suspenders
    var sp = [];
    for (var i = 3; i <= 77; i += 4) {
      var p = curve.getPoint(i / 80);
      if (p.y > 4.2) sp.push(p.x, p.y, z, p.x, 3.7, z);
    }
    var sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    bridge.add(new THREE.LineSegments(sgeo, M.faint));
  });
  bridge.position.z = -8;
  scene.add(bridge);

  /* ---------- tower crane (right, x=16 z=10) ---------- */
  var crane = new THREE.Group();
  var mast = edges(new THREE.BoxGeometry(1.7, 15, 1.7));
  mast.position.y = 7.5;
  crane.add(mast);
  var base = edges(new THREE.BoxGeometry(4, 1.2, 4), M.faint);
  base.position.y = 0.6;
  crane.add(base);

  var craneTop = new THREE.Group();
  craneTop.position.y = 15;
  var jib = edges(new THREE.BoxGeometry(17, 0.8, 0.8));
  jib.position.x = 7.5;
  craneTop.add(jib);
  var counter = edges(new THREE.BoxGeometry(5.5, 0.9, 0.9));
  counter.position.x = -3.6;
  craneTop.add(counter);
  var apex = edges(new THREE.ConeGeometry(1.15, 2.6, 4), M.accent);
  apex.position.y = 1.7;
  craneTop.add(apex);

  var trolley = edges(new THREE.BoxGeometry(0.9, 0.7, 0.9), M.accent);
  craneTop.add(trolley);
  var cableGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -6, 0)]);
  var cable = new THREE.Line(cableGeo, M.accent);
  craneTop.add(cable);
  var hook = edges(new THREE.BoxGeometry(0.8, 0.8, 0.8), M.accent);
  craneTop.add(hook);
  crane.add(craneTop);
  crane.position.set(17, 0, 10);
  scene.add(crane);

  /* ---------- excavator (left, x=-16 z=12) ---------- */
  var exc = new THREE.Group();
  var tracks = edges(new THREE.BoxGeometry(4.6, 1, 2.8), M.faint);
  tracks.position.y = 0.5;
  exc.add(tracks);
  var body = edges(new THREE.BoxGeometry(3, 1.7, 2.5));
  body.position.y = 1.9;
  exc.add(body);
  var cab = edges(new THREE.BoxGeometry(1.3, 1.1, 1.3), M.faint);
  cab.position.set(-0.7, 3.2, 0.5);
  exc.add(cab);

  var boom = new THREE.Group();
  boom.position.set(1.6, 2.2, 0);
  var boomMesh = edges(new THREE.BoxGeometry(4.6, 0.6, 0.55));
  boomMesh.position.x = 2.3;
  boom.add(boomMesh);
  var stick = new THREE.Group();
  stick.position.x = 4.6;
  var stickMesh = edges(new THREE.BoxGeometry(3.2, 0.5, 0.45));
  stickMesh.position.x = 1.6;
  stick.add(stickMesh);
  var bucket = edges(new THREE.BoxGeometry(0.9, 0.9, 0.9), M.accent);
  bucket.position.set(3.3, -0.4, 0);
  stick.add(bucket);
  boom.add(stick);
  exc.add(boom);
  exc.position.set(-17, 0, 12);
  exc.rotation.y = 0.5;
  scene.add(exc);

  /* ---------- particle stream along the deck ---------- */
  var N = 260;
  var pos = new Float32Array(N * 3);
  var spd = new Float32Array(N);
  for (var i = 0; i < N; i++) {
    pos[i * 3] = -46 + Math.random() * 92;
    pos[i * 3 + 1] = 3.7 + Math.random() * 0.9;
    pos[i * 3 + 2] = -8 + (Math.random() - 0.5) * 5;
    spd[i] = 0.02 + Math.random() * 0.05;
  }
  var pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  var points = new THREE.Points(pgeo, M.points);
  scene.add(points);

  scene.position.y = -3;

  applyTheme();

  /* ---------- sizing / visibility ---------- */
  var running = false, raf = null;
  function resize() {
    var r = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  function frame(t) {
    var s = t / 1000;
    craneTop.rotation.y = Math.sin(s * 0.22) * 0.75;
    var tx = 5.5 + Math.sin(s * 0.35) * 4.6;
    trolley.position.set(tx, -0.4, 0);
    var drop = 5.2 + Math.sin(s * 0.5) * 1.6;
    cable.position.set(tx, -0.6, 0);
    cable.scale.y = drop / 6;
    hook.position.set(tx, -0.6 - drop, 0);

    boom.rotation.z = -0.62 + Math.sin(s * 0.45) * 0.22;
    stick.rotation.z = 0.75 + Math.sin(s * 0.45 - 0.9) * 0.3;

    var arr = pgeo.attributes.position.array;
    for (var i = 0; i < N; i++) {
      arr[i * 3] += spd[i];
      if (arr[i * 3] > 46) arr[i * 3] = -46;
    }
    pgeo.attributes.position.needsUpdate = true;

    camera.position.x = 33 + Math.sin(s * 0.05) * 3.2;
    camera.position.y = 20 + Math.sin(s * 0.04) * 1.4;
    camera.lookAt(0, 2.5, -2);
    renderer.render(scene, camera);
  }

  function loop(t) { frame(t); if (running) raf = requestAnimationFrame(loop); }
  function setRunning(v) {
    if (reduced) { frame(1200); return; }
    if (v && !running) { running = true; raf = requestAnimationFrame(loop); }
    else if (!v && running) { running = false; cancelAnimationFrame(raf); }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      setRunning(en[0].isIntersecting);
    }, { threshold: 0.03 }).observe(canvas);
  } else setRunning(true);

  // live theme switch
  new MutationObserver(function () {
    applyTheme();
    if (reduced) frame(1200);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
