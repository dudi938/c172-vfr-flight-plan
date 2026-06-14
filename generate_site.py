#!/usr/bin/env python3
"""Generate a multi-page version of the C172 VFR plan from the original single-page HTML.

Run:  python3 generate_site.py
Source: the original single-page file (SRC).
Output: index.html, maryland.html, new-york.html, bonus.html, airports.html, info.html
        and assets/site.css, assets/site.js, assets/search-index.js

To add a new trip later: add its card to the right region page (same markup as the
others), add its coordinates to ROUTES in assets/site.js, and add one line to
assets/search-index.js. The map and search pick it up automatically.
"""
import re, os, html, json

SRC = "/Users/dgershtenkoren/c172_us_hour_building_jul_aug_v2_vfr.html"
OUT = "/Users/dgershtenkoren/c172-vfr-flight-plan"

with open(SRC, encoding="utf-8") as f:
    raw = f.read()

# ---------- helpers ----------
def extract_balanced(text, start_idx, open_tok="<div", close_tok="</div>"):
    """Return substring of a balanced <div>...</div> starting at start_idx (index of '<div')."""
    depth = 0
    i = start_idx
    n = len(text)
    while i < n:
        no = text.find(open_tok, i)
        nc = text.find(close_tok, i)
        if nc == -1:
            raise ValueError("unbalanced div")
        if no != -1 and no < nc:
            depth += 1
            i = no + len(open_tok)
        else:
            depth -= 1
            i = nc + len(close_tok)
            if depth == 0:
                return text[start_idx:i]
    raise ValueError("unbalanced div (eof)")

def strip_tags(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()

# ---------- extract CSS (reuse, page-agnostic) ----------
css = re.search(r"<style>(.*?)</style>", raw, re.S).group(1).strip()

# ---------- extract routes object ----------
routes_js = re.search(r"const routes = \{.*?\n    \};", raw, re.S).group(0)

# ---------- extract trip cards ----------
starts = [m.start() for m in re.finditer(r'<div class="card trip" id="trip-', raw)]
trip_cards = {}  # id -> html
for s in starts:
    block = extract_balanced(raw, s)
    cid = re.search(r'id="(trip-[a-z0-9]+)"', block).group(1)
    # normalise indentation: dedent to base then re-indent later
    trip_cards[cid] = block

# ---------- extract principles grid ----------
ph = raw.index('<h2 id="vfr-principles">')
pg = raw.index('<div class="grid">', ph)
principles_grid = extract_balanced(raw, pg)

# ---------- extract recommended grid ----------
rh = raw.index('<h2 id="recommended-vfr">')
rg = raw.index('<div class="grid">', rh)
recommended_grid = extract_balanced(raw, rg)

# ---------- extract disclaimer note ----------
disclaimer = extract_balanced(raw, raw.index('<div class="note">'))

# ---------- extract airport cards ----------
airport_cards = [extract_balanced(raw, m.start())
                 for m in re.finditer(r'<div class="airport">', raw)]

# ---------- region config ----------
regions = {
    "maryland":  ("trip-m1 trip-m2 trip-m3 trip-m4".split(), "מרילנד", "מסלולי VFR מבסיס KGAI (Montgomery County / WIFA). שימו לב לנהלי DC SFRA בכל המראה/נחיתה."),
    "new-york":  ("trip-n1 trip-n2 trip-n3 trip-n4".split(), "ניו יורק", "מסלולי VFR מבסיס KFRG (Republic, Long Island), מתחת ל-Class B של ניו יורק."),
    "bonus":     ("trip-r1 trip-r2 trip-r3 trip-r4 trip-r5 trip-r6".split(), "טיולי בונוס", "מסלולי VFR מומלצים נוספים שחקרנו - שילובי מרילנד/ניו יורק/קונטיקט."),
}

# nice short titles for chip nav + overview from each trip's trip-title h3
def trip_title(cid):
    m = re.search(r'<h3 class="trip-title">(.*?)</h3>', trip_cards[cid], re.S)
    return strip_tags(m.group(1)) if m else cid

# ---------- build search index ----------
region_label_for_trip = {}
for key, (ids, label, _desc) in regions.items():
    for cid in ids:
        region_label_for_trip[cid] = (label, f"{key}.html")

search_entries = []
for key, (ids, label, _desc) in regions.items():
    for cid in ids:
        card = trip_cards[cid]
        title = trip_title(cid)
        kw = strip_tags(card).lower()
        search_entries.append({"t": title, "r": label, "u": f"{key}.html#{cid}", "k": kw})
# airports -> airports.html
for ac in airport_cards:
    name = strip_tags(re.search(r"<h3>(.*?)</h3>", ac, re.S).group(1))
    search_entries.append({"t": "שדה: " + name, "r": "שדות", "u": "airports.html",
                            "k": strip_tags(ac).lower()})

search_index_js = "window.SEARCH_INDEX = " + json.dumps(search_entries, ensure_ascii=False) + ";\n"

# ---------- nav + shell templates ----------
NAV_ITEMS = [
    ("index.html", "בית"),
    ("maryland.html", "מרילנד"),
    ("new-york.html", "ניו יורק"),
    ("bonus.html", "טיולי בונוס"),
    ("airports.html", "שדות"),
    ("info.html", "מידע ובטיחות"),
]

def nav_html(active):
    links = "".join(
        f'<a href="{href}"{" class=\"active\"" if href==active else ""}>{label}</a>'
        for href, label in NAV_ITEMS
    )
    return f'''<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="index.html">🛩️ תוכנית VFR · C172</a>
    <button class="nav-toggle" id="navToggle" type="button" aria-label="תפריט">☰ תפריט</button>
    <nav class="site-nav" id="siteNav">{links}</nav>
  </div>
  <div class="search-bar">
    <input id="globalSearch" type="search" autocomplete="off"
      placeholder="חיפוש בכל האתר: טיול, שדה, KFRG, Hudson, Niagara..." />
    <div id="searchResults" class="search-dropdown" role="listbox"></div>
  </div>
</header>'''

FOOTER = '''<footer class="site-footer">
  <div class="footer-inner">
    תוכנית VFR · C172 · יולי-אוגוסט — כלי תכנון בלבד. לפני כל טיסה אמת מול Chart Supplement, NOTAMs, מז"א, TFRs, ביצועים ומשקל/איזון.
  </div>
</footer>'''

def page(title, active, body, with_maps=False):
    leaflet_head = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />' if with_maps else ""
    leaflet_js = '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>' if with_maps else ""
    return f'''<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet">
  {leaflet_head}
  <link rel="stylesheet" href="assets/site.css" />
</head>
<body>
{nav_html(active)}
  <div class="wrap" id="top">
{body}
  </div>
{FOOTER}
  {leaflet_js}
  <script src="assets/search-index.js"></script>
  <script src="assets/site.js"></script>
</body>
</html>
'''

def reindent(block, spaces=4):
    pad = " " * spaces
    return "\n".join(pad + ln if ln.strip() else ln for ln in block.splitlines())

# ---------- region pages ----------
for key, (ids, label, desc) in regions.items():
    chips = "".join(f'<a class="chip" href="#{cid}">{trip_title(cid)}</a>' for cid in ids)
    cards = "\n\n".join(reindent(trip_cards[cid]) for cid in ids)
    body = f'''    <h1>{label} — מסלולי VFR</h1>
    <p class="lead">{desc}</p>
    <div class="chip-nav">{chips}</div>

{cards}'''
    out = page(f"{label} · תוכנית VFR C172", f"{key}.html", body, with_maps=True)
    with open(os.path.join(OUT, f"{key}.html"), "w", encoding="utf-8") as f:
        f.write(out)

# ---------- airports page ----------
airports_body = '''    <h1>פרופיל שדות בתוכנית (VFR Ready)</h1>
    <p class="lead">שדות המופיעים במסלולים. תמיד אמת תדרים/מסלולים/הערות מול Chart Supplement עדכני.</p>
    <div class="airport-grid">
''' + "\n".join("      " + ac for ac in airport_cards) + '''
    </div>'''
with open(os.path.join(OUT, "airports.html"), "w", encoding="utf-8") as f:
    f.write(page("שדות · תוכנית VFR C172", "airports.html", airports_body))

# ---------- info page ----------
info_body = f'''    <h1>מידע ובטיחות</h1>
    <p class="lead">עקרונות הטיסה הנופית, אזהרות בטיחות, ומקורות מומלצים מטייסים.</p>
{reindent(disclaimer)}

    <h2 id="vfr-principles">עקרונות VFR לגרסה זו</h2>
{reindent(principles_grid)}

    <h2 id="recommended-vfr">טיולי VFR מומלצים מטייסים (מחקר רשת)</h2>
{reindent(recommended_grid)}'''
with open(os.path.join(OUT, "info.html"), "w", encoding="utf-8") as f:
    f.write(page("מידע ובטיחות · תוכנית VFR C172", "info.html", info_body))

# ---------- home / index ----------
overview = ""
region_meta = [
    ("maryland.html", "מרילנד", "M1–M4", "מבסיס KGAI · שננדואה, צ'ספיק, הרי מערב מרילנד, ניאגרה", len(regions["maryland"][0])),
    ("new-york.html", "ניו יורק", "N1–N4", "מבסיס KFRG · קצה לונג איילנד, עמק ההדסון, איים, מסדרון מנהטן", len(regions["new-york"][0])),
    ("bonus.html", "טיולי בונוס", "R1–R6", "מסלולים מומלצים נוספים שחקרנו ברשת", len(regions["bonus"][0])),
]
cards_html = "\n".join(
    f'''      <a class="ov-card" href="{href}">
        <div class="ov-top"><span class="ov-badge">{code}</span><span class="ov-count">{count} טיולים</span></div>
        <h3>{label}</h3>
        <p>{sub}</p>
        <span class="ov-go">לצפייה במסלולים ←</span>
      </a>''' for href, label, code, sub, count in region_meta
)
home_body = f'''    <section class="hero">
      <h1>תוכנית VFR נופית · בניית שעות · C172</h1>
      <p class="lead">מסלולי VFR יפים ומפורטים ליולי-אוגוסט עבור טייס PPL בתחילת הדרך — תחנות, לגים, גבהים, תדרים, נקודות עניין, מפות ותמונות. שני בסיסים: מרילנד (KGAI) וניו יורק (KFRG).</p>
      <div class="hero-cta">
        <a class="btn-primary" href="maryland.html">התחל ממרילנד</a>
        <a class="btn-ghost" href="info.html">מידע ובטיחות</a>
      </div>
    </section>

    <h2>בחר אזור</h2>
    <div class="overview-grid">
{cards_html}
    </div>

    <h2>איך משתמשים באתר</h2>
    <div class="grid">
      <div class="card"><h3>🔎 חיפוש חכם</h3><p>תיבת החיפוש למעלה מחפשת בכל הדפים — טיול, שדה או מילת מפתח — ולוחצת ישר לאזור הרלוונטי.</p></div>
      <div class="card"><h3>🗺️ מפות אינטראקטיביות</h3><p>בכל טיול יש מפת מסלול. לחיצה על המפה פותחת תצוגת מסך מלא עם זום.</p></div>
      <div class="card"><h3>📱 מותאם למובייל</h3><p>הכל עובד חלק בנייד — תפריט, חיפוש, טבלאות נגללות ותמונות.</p></div>
    </div>

{reindent(disclaimer)}'''
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("תוכנית VFR נופית · C172 · יולי-אוגוסט", "index.html", home_body))

# ---------- assets/site.css ----------
nav_css = '''
/* ===== Multi-page shell: header / nav / search / hero / overview / footer ===== */
.site-header{position:sticky;top:0;z-index:1000;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.header-inner{max-width:1260px;margin:auto;padding:10px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.brand{font-weight:800;color:#1d4ed8;text-decoration:none;font-size:1.05rem;white-space:nowrap}
.site-nav{display:flex;gap:4px;flex-wrap:wrap;margin-inline-start:auto}
.site-nav a{color:#334155;text-decoration:none;padding:7px 12px;border-radius:999px;font-weight:600;font-size:.95rem;transition:background .15s,color .15s}
.site-nav a:hover{background:#eff6ff;color:#1d4ed8}
.site-nav a.active{background:#1d4ed8;color:#fff}
.nav-toggle{display:none;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;color:#1e3a8a;cursor:pointer;margin-inline-start:auto}
.search-bar{max-width:1260px;margin:auto;padding:0 24px 10px;position:relative}
#globalSearch{width:100%;padding:10px 14px;border:1px solid #cbd5e1;border-radius:12px;font:inherit;background:#fff}
#globalSearch:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
.search-dropdown{position:absolute;left:24px;right:24px;top:100%;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 14px 34px rgba(15,23,42,.18);max-height:60vh;overflow:auto;display:none;z-index:1200}
.search-dropdown.open{display:block}
.search-hit{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #eef2f7;color:#0f172a;text-decoration:none}
.search-hit:last-child{border-bottom:0}
.search-hit:hover,.search-hit.active{background:#eff6ff}
.search-hit .badge{flex:none;font-size:.72rem;font-weight:700;color:#1e3a8a;background:#dbeafe;border-radius:999px;padding:2px 9px}
.search-hit .hit-title{font-weight:600}
.search-empty{padding:12px 14px;color:#64748b}
.site-footer{border-top:1px solid var(--line);margin-top:40px;background:#fff}
.footer-inner{max-width:1260px;margin:auto;padding:18px 24px;color:#64748b;font-size:.9rem}
.hero{background:linear-gradient(135deg,#1d4ed8,#0ea5e9);color:#fff;border-radius:18px;padding:30px 26px;margin:6px 0 8px;box-shadow:0 14px 34px rgba(29,78,216,.22)}
.hero h1{color:#fff;font-size:2rem;margin-bottom:10px}
.hero .lead{color:#e0f2fe}
.hero-cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.btn-primary{background:#fff;color:#1d4ed8;font-weight:800;text-decoration:none;padding:11px 18px;border-radius:999px}
.btn-ghost{border:1px solid rgba(255,255,255,.7);color:#fff;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:999px}
.overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.ov-card{display:flex;flex-direction:column;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;text-decoration:none;color:var(--text);box-shadow:0 8px 20px rgba(15,23,42,.04);transition:transform .15s,box-shadow .15s,border-color .15s}
.ov-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(15,23,42,.1);border-color:#bfdbfe}
.ov-top{display:flex;align-items:center;justify-content:space-between}
.ov-badge{font-weight:800;color:#1d4ed8;background:#dbeafe;border-radius:999px;padding:3px 12px}
.ov-count{color:#64748b;font-size:.9rem}
.ov-card h3{margin:4px 0}
.ov-card p{color:var(--muted);margin:0}
.ov-go{margin-top:auto;color:#1d4ed8;font-weight:700;font-size:.95rem}
.chip-nav{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 22px}
.chip{background:#fff;border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;color:#1e3a8a;text-decoration:none;font-weight:600;font-size:.9rem}
.chip:hover{background:#eff6ff;border-color:#93c5fd}
.trip:target,.card:target{outline:3px solid #60a5fa;outline-offset:3px;border-radius:14px}
@media (max-width:820px){
  .header-inner{padding:10px 14px}
  .nav-toggle{display:inline-flex}
  .site-nav{display:none;width:100%;flex-direction:column;gap:2px;margin:6px 0 2px}
  .site-nav.open{display:flex}
  .site-nav a{padding:10px 12px}
  .search-bar{padding:0 14px 10px}
  .search-dropdown{left:14px;right:14px}
  .hero{padding:22px 18px}
  .hero h1{font-size:1.5rem}
  .footer-inner{padding:16px 14px}
}
'''
with open(os.path.join(OUT, "assets", "site.css"), "w", encoding="utf-8") as f:
    f.write(css + "\n" + nav_css)

# ---------- assets/site.js ----------
site_js = '''/* Shared logic for all pages: nav, global search, maps, lightbox, table scroll, back-to-top. */
(function () {
  // ---- mobile nav toggle ----
  var navToggle = document.getElementById("navToggle");
  var siteNav = document.getElementById("siteNav");
  if (navToggle && siteNav) {
    navToggle.addEventListener("click", function () { siteNav.classList.toggle("open"); });
  }

  // ---- global cross-page search ----
  var input = document.getElementById("globalSearch");
  var box = document.getElementById("searchResults");
  var INDEX = window.SEARCH_INDEX || [];
  function render(q) {
    box.innerHTML = "";
    q = (q || "").trim().toLowerCase();
    if (!q) { box.classList.remove("open"); return; }
    var hits = INDEX.filter(function (e) {
      return e.t.toLowerCase().indexOf(q) !== -1 || e.k.indexOf(q) !== -1 || e.r.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 20);
    if (!hits.length) {
      box.innerHTML = '<div class="search-empty">לא נמצאו תוצאות</div>';
      box.classList.add("open");
      return;
    }
    hits.forEach(function (h) {
      var a = document.createElement("a");
      a.className = "search-hit";
      a.href = h.u;
      a.innerHTML = '<span class="badge">' + h.r + '</span><span class="hit-title"></span>';
      a.querySelector(".hit-title").textContent = h.t;
      box.appendChild(a);
    });
    box.classList.add("open");
  }
  if (input && box) {
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("focus", function () { if (input.value.trim()) render(input.value); });
    document.addEventListener("click", function (e) {
      if (!box.contains(e.target) && e.target !== input) box.classList.remove("open");
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Escape") box.classList.remove("open"); });
  }

  // ---- highlight target trip/card when arriving via #anchor ----
  function flashTarget() {
    if (!location.hash) return;
    var el = document.querySelector(location.hash);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.outline = "3px solid #60a5fa";
      el.style.outlineOffset = "3px";
      el.style.borderRadius = "14px";
      setTimeout(function () { el.style.outline = ""; }, 1800);
    }
  }
  window.addEventListener("load", function () { setTimeout(flashTarget, 250); });
  window.addEventListener("hashchange", flashTarget);

  // ---- wrap wide tables for horizontal scroll ----
  document.querySelectorAll("table").forEach(function (tbl) {
    if (tbl.parentElement && tbl.parentElement.classList.contains("table-scroll")) return;
    var wrap = document.createElement("div");
    wrap.className = "table-scroll";
    tbl.parentNode.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  });

  // ---- lightbox for trip images (created on demand) ----
  var lightbox = null, lightboxImg = null;
  function ensureLightbox() {
    if (lightbox) return;
    lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.innerHTML = '<button type="button" id="lbClose">✕ סגור</button><img alt="תמונה" id="lbImg" />';
    document.body.appendChild(lightbox);
    lightboxImg = lightbox.querySelector("#lbImg");
    lightbox.querySelector("#lbClose").addEventListener("click", closeLb);
    lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLb(); });
  }
  function closeLb() { if (lightbox) { lightbox.classList.remove("open"); lightboxImg.src = ""; } }
  document.querySelectorAll(".img-grid img").forEach(function (img) {
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () {
      if (img.src.indexOf("placehold.co") === -1) {
        img.src = "https://placehold.co/1400x800/e2e8f0/334155?text=Image+Unavailable";
      }
    }, { once: true });
  });
  document.addEventListener("click", function (e) {
    if (!(e.target instanceof HTMLImageElement)) return;
    if (!e.target.closest(".img-grid")) return;
    ensureLightbox();
    lightboxImg.src = e.target.src;
    lightbox.classList.add("open");
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });

  // ---- back to top ----
  var back = document.createElement("a");
  back.href = "#top";
  back.className = "back-to-top";
  back.textContent = "חזרה לראש הדף ↑";
  back.addEventListener("click", function (e) {
    e.preventDefault();
    var t = document.getElementById("top");
    if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.body.appendChild(back);

  // ---- maps (only when Leaflet present and .map elements exist) ----
  if (window.L && document.querySelector(".map")) {
    __ROUTES__
    var renderedMaps = {};
    Object.entries(routes).forEach(function (entry) {
      var id = entry[0], pts = entry[1];
      if (!document.getElementById(id)) return; // map not on this page
      var map = L.map(id, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 13, attribution: "&copy; OpenStreetMap" }).addTo(map);
      var line = L.polyline(pts.map(function (p) { return p.c; }), { color: "#16a34a", weight: 4 }).addTo(map);
      pts.forEach(function (p) {
        L.circleMarker(p.c, { radius: 4, color: "#1d4ed8", fillColor: "#1d4ed8", fillOpacity: 1 }).addTo(map)
          .bindTooltip(p.n, { permanent: true, direction: "top", className: "poi-label", offset: [0, -6] });
      });
      map.fitBounds(line.getBounds(), { padding: [18, 18] });
      renderedMaps[id] = map;
      map.getContainer().addEventListener("click", function () { openMapPopup(id); });
    });

    var mapResizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(mapResizeTimer);
      mapResizeTimer = setTimeout(function () {
        Object.keys(renderedMaps).forEach(function (id) {
          var m = renderedMaps[id];
          m.invalidateSize();
          m.fitBounds(L.polyline(routes[id].map(function (p) { return p.c; })).getBounds(), { padding: [18, 18] });
        });
      }, 200);
    });

    // fullscreen popup
    var mapPopup = document.createElement("div");
    mapPopup.className = "map-popup";
    mapPopup.innerHTML = '<div class="map-popup-shell"><button type="button" class="map-popup-close">✕ סגור</button><div class="map-popup-map"></div></div>';
    document.body.appendChild(mapPopup);
    var mapPopupEl = mapPopup.querySelector(".map-popup-map");
    var popupLeafletMap = null, popupLayer = null;
    function drawPopupRoute(mapId) {
      var pts = routes[mapId];
      if (!pts) return;
      if (popupLayer) popupLayer.remove();
      popupLayer = L.layerGroup().addTo(popupLeafletMap);
      var line = L.polyline(pts.map(function (p) { return p.c; }), { color: "#16a34a", weight: 5 }).addTo(popupLayer);
      pts.forEach(function (p) {
        L.circleMarker(p.c, { radius: 5, color: "#1d4ed8", fillColor: "#1d4ed8", fillOpacity: 1 }).addTo(popupLayer)
          .bindTooltip(p.n, { permanent: true, direction: "top", className: "poi-label", offset: [0, -6] });
      });
      popupLeafletMap.fitBounds(line.getBounds(), { padding: [24, 24] });
    }
    window.openMapPopup = function (mapId) {
      mapPopup.classList.add("open");
      if (!popupLeafletMap) {
        popupLeafletMap = L.map(mapPopupEl, { scrollWheelZoom: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 16, attribution: "&copy; OpenStreetMap" }).addTo(popupLeafletMap);
      }
      setTimeout(function () { popupLeafletMap.invalidateSize(); drawPopupRoute(mapId); }, 30);
    };
    function closeMapPopup() { mapPopup.classList.remove("open"); }
    mapPopup.querySelector(".map-popup-close").addEventListener("click", closeMapPopup);
    mapPopup.addEventListener("click", function (e) { if (e.target === mapPopup) closeMapPopup(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMapPopup(); });
  }
})();
'''
site_js = site_js.replace("    __ROUTES__", "    " + routes_js.replace("\n", "\n    "))
with open(os.path.join(OUT, "assets", "site.js"), "w", encoding="utf-8") as f:
    f.write(site_js)

# ---------- assets/search-index.js ----------
with open(os.path.join(OUT, "assets", "search-index.js"), "w", encoding="utf-8") as f:
    f.write(search_index_js)

print("Generated pages:", [p for p in os.listdir(OUT) if p.endswith(".html")])
print("Trips extracted:", sorted(trip_cards.keys()))
print("Airports:", len(airport_cards))
print("Search entries:", len(search_entries))
