/* Agent Pi DSH site — theme, language, nav, reveal, docs scrollspy */
(function () {
  var root = document.documentElement;

  /* ---- Theme (default dark) ---- */
  var storedTheme = null;
  try { storedTheme = localStorage.getItem("ap-theme"); } catch (e) {}
  setTheme(storedTheme || "light");

  function setTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("ap-theme", t); } catch (e) {}
    document.querySelectorAll("[data-theme-icon]").forEach(function (el) {
      el.style.display = el.getAttribute("data-theme-icon") === t ? "none" : "";
    });
  }

  /* ---- Language (default zh) ---- */
  var storedLang = null;
  try { storedLang = localStorage.getItem("ap-lang"); } catch (e) {}
  setLang(storedLang || "zh");

  function setLang(l) {
    root.setAttribute("lang", l === "en" ? "en" : "zh-CN");
    root.setAttribute("data-lang", l);
    try { localStorage.setItem("ap-lang", l); } catch (e) {}
    document.title = root.getAttribute(l === "en" ? "data-title-en" : "data-title-zh") || document.title;
    var btn = document.querySelector(".lang-btn span");
    if (btn) btn.textContent = l === "en" ? "中文" : "EN";
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-toggle-theme]");
    if (t) setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    var l = e.target.closest("[data-toggle-lang]");
    if (l) setLang(root.getAttribute("data-lang") === "zh" ? "en" : "zh");
    var h = e.target.closest(".hamburger");
    if (h) document.querySelector(".nav").classList.toggle("open");
    var nl = e.target.closest(".nav-links a");
    if (nl) document.querySelector(".nav").classList.remove("open");
  });

  /* ---- Nav shadow on scroll ---- */
  var nav = document.querySelector(".nav");
  function onScroll() { if (nav) nav.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Reveal on scroll ---- */
  var io = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 })
    : null;
  document.querySelectorAll(".reveal").forEach(function (el) { io ? io.observe(el) : el.classList.add("in"); });

  /* ---- Docs: scrollspy + mobile TOC ---- */
  var sideLinks = document.querySelectorAll(".docs-side a.side-link");
  if (sideLinks.length) {
    var sections = [];
    sideLinks.forEach(function (a) {
      var s = document.querySelector(a.getAttribute("href"));
      if (s) sections.push({ a: a, s: s });
    });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        sections.forEach(function (x) {
          x.a.classList.toggle("active", x.s === en.target);
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    sections.forEach(function (x) { spy.observe(x.s); });

    var tocSelect = document.querySelector(".docs-mobile-toc select");
    if (tocSelect) {
      tocSelect.addEventListener("change", function () {
        var el = document.querySelector(tocSelect.value);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      });
    }
  }

  /* ---- Footer year ---- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();

/* ---- Latest release panel (GitHub API, with static fallback) ---- */
(function () {
  var panel = document.getElementById("release-panel");
  if (!panel) return;
  var API = "https://api.github.com/repos/xiangxin2021cn/agent-pi-dsh/releases?per_page=10";
  var CLASSIC_API = "https://api.github.com/repos/xiangxin2021cn/agent-pi/releases/tags/v2.6.5";
  var MIRRORS = [
    ["gh-proxy.com", "https://gh-proxy.com/"],
    ["ghfast.top", "https://ghfast.top/"]
  ];

  function bi(zh, en) {
    var f = document.createDocumentFragment();
    [["zh", zh], ["en", en]].forEach(function (p) {
      var s = document.createElement("span");
      s.setAttribute("data-lang", p[0]);
      s.textContent = p[1];
      f.appendChild(s);
    });
    return f;
  }
  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function fmtSize(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
    if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
    return b + " B";
  }
  function btn(href, label, primary) {
    var a = el("a", primary ? "primary" : null);
    a.href = href; a.target = "_blank"; a.rel = "noopener";
    a.textContent = label;
    return a;
  }
  function row(name, size, url, kind, primary) {
    var r = el("div", "rl-row");
    var n = el("span", "rl-name"); n.textContent = name;
    r.appendChild(n);
    if (kind) { var k = el("span", "rl-kind"); k.appendChild(bi(kind[0], kind[1])); r.appendChild(k); }
    if (size != null) { var s = el("span", "rl-size"); s.textContent = fmtSize(size); r.appendChild(s); }
    var bs = el("span", "rl-btns");
    var off = btn(url, "", primary); off.appendChild(bi("官方下载", "Official"));
    bs.appendChild(off);
    MIRRORS.forEach(function (m) { bs.appendChild(btn(m[1] + url, m[0], false)); });
    r.appendChild(bs);
    return r;
  }

  function headRow(d, track) {
    var head = el("div", "rl-head");
    var pill = el("span", "rl-pill"); pill.textContent = d.tag_name || "latest";
    head.appendChild(pill);
    if (track) {
      var tk = el("span", "rl-kind");
      tk.appendChild(bi(track[0], track[1]));
      head.appendChild(tk);
    }
    var dt = el("span", "rl-date");
    dt.appendChild(bi("发布于 " + (d.published_at || "").slice(0, 10), "Released " + (d.published_at || "").slice(0, 10)));
    head.appendChild(dt);
    return head;
  }

  function assetRows(d, primaryExe) {
    (d.assets || []).filter(function (a) { return /\.(exe|dmg|deb|appimage|rpm|msi)$/i.test(a.name); }).forEach(function (a) {
      var isSha = /\.sha256$/i.test(a.name);
      var isExe = /\.exe$/i.test(a.name);
      panel.appendChild(row(
        a.name, a.size, a.browser_download_url,
        isSha ? ["校验文件", "Checksum"] : null, isExe && primaryExe
      ));
    });
  }

  function render(main, classic) {
    panel.innerHTML = "";
    panel.appendChild(headRow(main, ["DSH 当前版", "DSH current"]));
    assetRows(main, true);

    if (classic) {
      panel.appendChild(headRow(classic, ["经典版", "Classic"]));
      assetRows(classic, false);
    }

    var note = el("p", "rl-note");
    var rel = "https://github.com/xiangxin2021cn/agent-pi-dsh/releases";
    var t1 = document.createElement("span"); t1.setAttribute("data-lang", "zh");
    t1.innerHTML = "仅展示 Windows / macOS / Linux 安装包；校验文件与全部资产见 <a href=\"" + rel + "\" target=\"_blank\" rel=\"noopener\">GitHub Releases</a>。";
    var t2 = document.createElement("span"); t2.setAttribute("data-lang", "en");
    t2.innerHTML = "Installers for Windows / macOS / Linux only; checksums and all assets on <a href=\"" + rel + "\" target=\"_blank\" rel=\"noopener\">GitHub Releases</a>.";
    note.appendChild(t1); note.appendChild(t2);
    panel.appendChild(note);
  }

  var ctrl = "AbortSignal" in window && AbortSignal.timeout ? { signal: AbortSignal.timeout(9000) } : {};
  Promise.all([
    fetch(API, ctrl).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch(CLASSIC_API, ctrl).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ])
    .then(function (results) {
      var list = results[0];
      var classic = results[1];
      if (!list || !list.length) return;
      var pub = list.filter(function (r) { return !r.draft && !r.prerelease; });
      var main = pub.filter(function (r) { return /^v3/i.test(r.tag_name || ""); })[0] || pub[0];
      if (!main || !main.assets) return;
      render(main, classic);
      panel.hidden = false;
      var st = document.getElementById("release-static");
      if (st) st.style.display = "none";
      var exe = main.assets.filter(function (a) { return /\.exe$/i.test(a.name); })[0];
      if (exe) {
        var h = document.getElementById("hero-dl");
        if (h) h.href = exe.browser_download_url;
      }
      if (main.tag_name) {
        document.querySelectorAll("[data-rel-version]").forEach(function (e) { e.textContent = main.tag_name; });
      }
    })
    .catch(function () { /* static fallback stays */ });
})();
