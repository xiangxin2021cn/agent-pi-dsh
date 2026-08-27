/* Agent Pi DSH — flow field: parallel worker lanes converging into one stream */
(function () {
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function isDark() { return document.documentElement.getAttribute("data-theme") !== "light"; }

  function Flow(canvas, variant) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1, lanes = [], parts = [], running = false, raf = null, t0 = 0;

    function build() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      lanes = []; parts = [];
      var n = variant === "hero" ? 6 : 8;
      var targetY = H * 0.52;
      for (var i = 0; i < n; i++) {
        var y0 = H * (0.12 + 0.76 * (i / (n - 1)));
        var lane = {
          x0: -60, y0: y0,
          cx: W * (0.42 + Math.sin(i * 2.1) * 0.06), cy: y0 + (targetY - y0) * 0.22,
          x1: W + 60, y1: targetY + (y0 - targetY) * 0.06
        };
        lanes.push(lane);
        var count = variant === "hero" ? 9 : 13;
        for (var j = 0; j < count; j++) {
          parts.push({
            lane: lane,
            t: Math.random(),
            sp: (0.0006 + Math.random() * 0.0009) * (variant === "hero" ? 0.8 : 1),
            sz: 1 + Math.random() * 1.6,
            wob: Math.random() * Math.PI * 2
          });
        }
      }
    }

    function pt(l, t) {
      var u = 1 - t;
      return {
        x: u * u * l.x0 + 2 * u * t * l.cx + t * t * l.x1,
        y: u * u * l.y0 + 2 * u * t * l.cy + t * t * l.y1
      };
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      var dark = isDark();
      var cA = dark ? "79,141,255" : "47,109,240";   // blue
      var cB = dark ? "58,214,232" : "15,160,190";   // cyan
      var laneA = dark ? 0.07 : 0.10;
      var dt = t0 ? Math.min(now - t0, 50) : 16; t0 = now;

      // lanes
      ctx.lineWidth = 1;
      for (var i = 0; i < lanes.length; i++) {
        var l = lanes[i];
        ctx.strokeStyle = "rgba(" + cA + "," + laneA + ")";
        ctx.beginPath();
        ctx.moveTo(l.x0, l.y0);
        ctx.quadraticCurveTo(l.cx, l.cy, l.x1, l.y1);
        ctx.stroke();
      }

      // particles with short trails
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        p.t += p.sp * dt;
        if (p.t > 1.02) { p.t = -0.02; p.wob = Math.random() * Math.PI * 2; }
        var glow = p.t; // brighter toward convergence
        for (var s = 5; s >= 0; s--) {
          var tt = p.t - s * 0.012;
          if (tt < 0 || tt > 1) continue;
          var q = pt(p.lane, tt);
          q.y += Math.sin(now / 700 + p.wob + s) * 2.2 * (1 - tt);
          var a = (0.16 + 0.72 * glow) * (1 - s / 6) * (dark ? 1 : 0.8);
          var mix = glow; // blue -> cyan toward the end
          var cr = Math.round(79 + (58 - 79) * mix), cg = Math.round(141 + (214 - 141) * mix), cb = Math.round(255 + (232 - 255) * mix);
          if (!dark) { cr = 47; cg = Math.round(109 + 60 * mix); cb = Math.round(240 - 50 * mix); }
          ctx.fillStyle = "rgba(" + cr + "," + cg + "," + cb + "," + a.toFixed(3) + ")";
          if (dark && s === 0) { ctx.shadowBlur = 12 * glow + 4; ctx.shadowColor = "rgba(" + cB + ",.9)"; }
          var r = p.sz * (0.7 + 0.9 * glow) * (s === 0 ? 1.35 : 0.9);
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, 6.2832);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // convergence pulse on the right
      var px = W * 0.985, py = H * 0.52;
      var pulse = (Math.sin(now / 900) + 1) / 2;
      var pr = 14 + pulse * 22;
      var g = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.2);
      var pa = dark ? 0.5 : 0.35;
      g.addColorStop(0, "rgba(" + cB + "," + (pa * (0.6 + pulse * 0.4)) + ")");
      g.addColorStop(1, "rgba(" + cB + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, pr * 2.2, 0, 6.2832); ctx.fill();
    }

    function loop(now) { draw(now); if (running) raf = requestAnimationFrame(loop); }
    this.setRunning = function (v) {
      if (reduced) { draw(performance.now()); return; }
      if (v && !running) { running = true; t0 = 0; raf = requestAnimationFrame(loop); }
      else if (!v && running) { running = false; cancelAnimationFrame(raf); }
    };
    this.resize = function () { build(); if (!running) draw(performance.now()); };
    build();
  }

  var flows = [];
  document.querySelectorAll("canvas[data-flow]").forEach(function (c) {
    var f = new Flow(c, c.getAttribute("data-flow"));
    flows.push({ c: c, f: f });
  });
  if (!flows.length) return;

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var fl = flows.filter(function (x) { return x.c === en.target; })[0];
        if (fl) fl.f.setRunning(en.isIntersecting);
      });
    }, { threshold: 0.05 });
    flows.forEach(function (x) { io.observe(x.c); });
  } else {
    flows.forEach(function (x) { x.f.setRunning(true); });
  }

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { flows.forEach(function (x) { x.f.resize(); }); }, 150);
  });
  // re-render a static frame on theme switch so colors follow immediately
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-toggle-theme]")) {
      setTimeout(function () { flows.forEach(function (x) { if (reduced) x.f.resize(); }); }, 60);
    }
  });
})();
