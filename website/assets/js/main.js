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

  /* ---- Language (persisted; first visit follows the browser) ---- */
  var storedLang = null;
  try { storedLang = localStorage.getItem("ap-lang"); } catch (e) {}
  var i18n = window.AgentPiI18n || null;
  var initialLang = i18n
    ? i18n.initialLocale(storedLang)
    : (storedLang === "zh" || storedLang === "zh-CN" ? "zh-CN" : "en");
  var preserveInitialPreference = !i18n && storedLang && storedLang !== "zh" && storedLang !== "zh-CN" && storedLang !== "en";

  function setLang(l, skipPersist) {
    var locale = i18n ? (i18n.normaliseLocale(l) || "en") : (l === "en" ? "en" : "zh-CN");
    root.setAttribute("lang", locale);
    root.setAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    root.setAttribute("data-locale", locale);
    root.setAttribute("data-lang", locale === "zh-CN" ? "zh" : "en");
    if (!skipPersist) {
      try { localStorage.setItem("ap-lang", locale); } catch (e) {}
    }
    if (i18n) i18n.apply(locale);
    else document.title = root.getAttribute(locale === "en" ? "data-title-en" : "data-title-zh") || document.title;
    var btn = document.querySelector(".lang-btn span");
    if (btn) btn.textContent = locale === "zh-CN" ? "EN" : "中文";
  }

  document.addEventListener("change", function (event) {
    var select = event.target.closest && event.target.closest("[data-language-select]");
    if (select) setLang(select.value);
  });
  setLang(initialLang, preserveInitialPreference);

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-toggle-theme]");
    if (t) setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    var l = e.target.closest("[data-toggle-lang]");
    if (l) setLang(root.getAttribute("data-locale") === "zh-CN" ? "en" : "zh-CN");
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

/* ---- Latest complete GitHub release, with a verified static fallback ---- */
(function () {
  var releaseNodes = document.querySelectorAll("[data-rel-version], [data-release-version]");
  var panel = document.getElementById("release-panel");
  if (!panel && !releaseNodes.length) return;

  var API = "https://api.github.com/repos/xiangxin2021cn/agent-pi-dsh/releases/latest";
  var DOWNLOAD_PREFIX = "https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/";
  var assetSuffixes = {
    "windows-exe": "-x64.exe",
    "windows-sha": "-x64.exe.sha256",
    "mac-dmg": "-mac-arm64.dmg",
    "mac-zip": "-mac-arm64.zip",
    "mac-intel-dmg": "-mac-x64.dmg",
    "mac-intel-zip": "-mac-x64.zip",
    "mac-intel-sha": "-mac-x64.dmg.sha256",
    "linux-appimage": "-linux-x86_64.AppImage",
    "linux-deb": "-linux-amd64.deb"
  };
  var intelKeys = ["mac-intel-dmg", "mac-intel-zip", "mac-intel-sha"];

  function fmtSize(bytes) {
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function validAsset(asset, expectedName, tag) {
    return asset && asset.name === expectedName && asset.state === "uploaded" &&
      Number.isFinite(asset.size) && asset.size > 0 &&
      typeof asset.browser_download_url === "string" &&
      asset.browser_download_url === DOWNLOAD_PREFIX + tag + "/" + expectedName;
  }

  function applyRelease(release) {
    var tag = release && release.tag_name;
    if (!/^v\d+\.\d+\.\d+$/.test(tag || "") || release.draft || release.prerelease ||
      typeof release.published_at !== "string" || Number.isNaN(Date.parse(release.published_at))) return;
    var identity = window.AgentPiReleaseMetadata &&
      window.AgentPiReleaseMetadata.releaseIdentity(release);
    if (!identity) return;
    var version = identity.appVersion;
    var prefix = "Agent-Pi-DSH-" + version;
    var byName = {};
    (release.assets || []).forEach(function (asset) { byName[asset.name] = asset; });

    var assets = {};
    Object.keys(assetSuffixes).forEach(function (key) {
      if (intelKeys.indexOf(key) !== -1) return;
      var expected = prefix + assetSuffixes[key];
      var asset = byName[expected];
      if (validAsset(asset, expected, tag)) assets[key] = asset;
    });
    ["-mac-x64", "-mac-x64-monterey"].some(function (family) {
      var group = {};
      var complete = intelKeys.every(function (key) {
        var expected = prefix + assetSuffixes[key].replace("-mac-x64", family);
        var asset = byName[expected];
        if (!validAsset(asset, expected, tag)) return false;
        group[key] = asset;
        return true;
      });
      if (!complete) return false;
      intelKeys.forEach(function (key) { assets[key] = group[key]; });
      return true;
    });

    /* Never switch the page to a newly published release until all three
       primary desktop platforms have finished uploading. */
    if (!assets["windows-exe"] || !assets["mac-dmg"] || !assets["linux-appimage"]) return;
    var digest = assets["windows-exe"].digest || "";
    var digestMatch = digest.match(/^sha256:([a-f0-9]{64})$/i);
    if (!digestMatch) return;

    if (version !== "3.8.2") {
      var currentRequirements = version === "3.8.5";
      document.querySelectorAll("[data-release-electron-version]").forEach(function (node) {
        node.textContent = currentRequirements ? "45.0.0" : "See Release";
      });
      document.querySelectorAll('[data-release-system="mac-arm64"]').forEach(function (node) {
        node.textContent = currentRequirements ? "Apple Silicon · macOS 15+" : "Apple Silicon · See Release";
      });
      document.querySelectorAll('[data-release-system="mac-x64"]').forEach(function (node) {
        node.textContent = currentRequirements ? "Intel x64 · macOS 15+" : "Intel x64 · See Release";
      });
      document.querySelectorAll("[data-release-system-fallback]").forEach(function (node) { node.hidden = true; });
      /* Live notes are inserted after initial translation collection so a
         language change cannot restore the fallback system requirements. */
      document.querySelectorAll("[data-release-system-note]").forEach(function (node) {
        node.innerHTML = currentRequirements
          ? '<span data-lang="zh">3.8.5：Apple Silicon 最低 macOS 15，Intel 最低 macOS 15；请按对应架构下载。</span><span data-lang="en">3.8.5 requires macOS 15+ on Apple Silicon and macOS 15+ on Intel. Download the package for your architecture.</span>'
          : '<span data-lang="zh">请参阅本次 GitHub Release 的系统要求，按对应架构下载。</span><span data-lang="en">Check the system requirements in this GitHub Release and download the package for your architecture.</span>';
        node.hidden = false;
      });
    }

    document.querySelectorAll("[data-rel-version]").forEach(function (node) {
      node.textContent = tag;
    });
    document.querySelectorAll("[data-release-version]").forEach(function (node) {
      node.textContent = version;
    });
    document.querySelectorAll("[data-release-date]").forEach(function (node) {
      node.textContent = (release.published_at || "").slice(0, 10);
    });
    document.querySelectorAll("[data-release-sha]").forEach(function (node) {
      node.textContent = digestMatch[1].toUpperCase();
      node.setAttribute("data-release-sha-source", "github-release");
    });
    document.querySelectorAll("[data-kernel-version]").forEach(function (node) {
      node.textContent = identity.kernelVersion;
    });
    document.querySelectorAll("[data-kernel-pin]").forEach(function (node) {
      if (!identity.kernelPin) return;
      var length = Number(node.getAttribute("data-kernel-pin-length")) || 40;
      node.textContent = identity.kernelPin.slice(0, length);
    });

    Object.keys(assetSuffixes).forEach(function (key) {
      var asset = assets[key];
      document.querySelectorAll('[data-release-asset="' + key + '"]').forEach(function (link) {
        link.hidden = !asset;
        if (asset) {
          var proxy = link.hasAttribute("data-release-proxy") ? "https://gh-proxy.org/" : "";
          link.href = proxy + asset.browser_download_url;
        }
      });
      if (!asset) return;
      document.querySelectorAll('[data-release-name="' + key + '"]').forEach(function (node) {
        node.textContent = asset.name;
      });
      document.querySelectorAll('[data-release-size="' + key + '"]').forEach(function (node) {
        node.textContent = fmtSize(asset.size);
      });
    });

    document.querySelectorAll("[data-require-release-asset], [data-missing-release-asset]").forEach(function (node) {
      var required = node.getAttribute("data-require-release-asset");
      var keys = required || node.getAttribute("data-missing-release-asset");
      var available = keys.split(/\s+/).every(function (key) { return !!assets[key]; });
      node.hidden = required ? !available : available;
    });

    if (panel) panel.setAttribute("data-release-state", "synced");
  }

  var options = { credentials: "omit", referrerPolicy: "no-referrer", cache: "default" };
  if ("AbortSignal" in window && AbortSignal.timeout) options.signal = AbortSignal.timeout(8000);
  fetch(API, options)
    .then(function (response) {
      if (!response.ok) throw new Error("GitHub release metadata: " + response.status);
      return response.json();
    })
    .then(applyRelease)
    .catch(function () { /* Keep the complete, verified fallback embedded in the page. */ });
})();
