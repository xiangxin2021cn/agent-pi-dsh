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

/* Release metadata is intentionally static so the public site never queries a source-code host. */
