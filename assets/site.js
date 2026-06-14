/* Shared logic for all pages: nav, global search, maps, lightbox, table scroll, back-to-top. */
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
    const routes = {
          mapR1: [{n:"KFRG",c:[40.7288,-73.4134]},{n:"VZ",c:[40.6066,-74.0447]},{n:"Statue",c:[40.6892,-74.0445]},{n:"Intrepid",c:[40.7645,-73.9996]},{n:"GWB",c:[40.8517,-73.9527]},{n:"Alpine",c:[40.9557,-73.9180]},{n:"KFRG",c:[40.7288,-73.4134]}],
          mapR2: [{n:"KGAI",c:[39.1686,-77.1659]},{n:"W29",c:[38.9765,-76.3300]},{n:"KESN",c:[38.8040,-76.0690]},{n:"KTGI",c:[37.8250,-75.9920]},{n:"KGAI",c:[39.1686,-77.1659]}],
          mapR3: [{n:"KGAI",c:[39.1686,-77.1659]},{n:"KFRR",c:[38.9170,-78.2536]},{n:"W45",c:[38.667,-78.500]},{n:"KSHD",c:[38.2638,-78.8964]},{n:"KGAI",c:[39.1686,-77.1659]}],
          mapR4: [{n:"KFRG",c:[40.7288,-73.4134]},{n:"KJPX",c:[40.9602,-72.2512]},{n:"KMTP",c:[41.0767,-71.9200]},{n:"KBID",c:[41.1681,-71.5776]},{n:"KFRG",c:[40.7288,-73.4134]}],
          mapR5: [{n:"KFRG",c:[40.7288,-73.4134]},{n:"VZ",c:[40.6066,-74.0447]},{n:"Statue",c:[40.6892,-74.0445]},{n:"Govs",c:[40.6895,-74.0168]},{n:"Wburg",c:[40.7135,-73.9718]},{n:"CPark",c:[40.7812,-73.9665]},{n:"GWB",c:[40.8517,-73.9527]},{n:"Alpine",c:[40.9557,-73.9180]},{n:"KFRG",c:[40.7288,-73.4134]}],
          mapR6: [{n:"KGAI",c:[39.1686,-77.1659]},{n:"KOXB",c:[38.3104,-75.1238]},{n:"KISP",c:[40.7952,-73.1002]},{n:"KGON",c:[41.3301,-72.0451]},{n:"KFRG",c:[40.7288,-73.4134]}],
          mapM1: [{n:"KGAI",c:[39.1686,-77.1659]},{n:"KFRR",c:[38.9170,-78.2536]},{n:"W45",c:[38.667,-78.500]},{n:"KSHD",c:[38.2638,-78.8964]},{n:"KGAI",c:[39.1686,-77.1659]}],
          mapM2: [{n:"KGAI",c:[39.1686,-77.1659]},{n:"W29",c:[38.9765,-76.3300]},{n:"KESN",c:[38.8040,-76.0690]},{n:"KOXB",c:[38.3104,-75.1238]},{n:"KCGE",c:[38.5393,-76.0304]},{n:"KGAI",c:[39.1686,-77.1659]}],
          mapM3: [{n:"KGAI",c:[39.1686,-77.1659]},{n:"KFDK",c:[39.4176,-77.3743]},{n:"KCBE",c:[39.6153,-78.7600]},{n:"2G4",c:[39.5803,-79.3395]},{n:"KGAI",c:[39.1686,-77.1659]}],
          mapM4: [{n:"KGAI",c:[39.1686,-77.1659]},{n:"KIPT",c:[41.2418,-76.9211]},{n:"KIAG",c:[43.1073,-78.9462]},{n:"KITH",c:[42.4910,-76.4584]},{n:"KART",c:[43.9919,-76.0217]},{n:"KGAI",c:[39.1686,-77.1659]}],
          mapN1: [{n:"KFRG",c:[40.7288,-73.4134]},{n:"KJPX",c:[40.9602,-72.2512]},{n:"KMTP",c:[41.0767,-71.9200]},{n:"KFRG",c:[40.7288,-73.4134]}],
          mapN2: [{n:"KFRG",c:[40.7288,-73.4134]},{n:"20N",c:[41.9886,-73.9656]},{n:"44N",c:[41.7073,-73.7383]},{n:"KPOU",c:[41.6266,-73.8842]},{n:"KFRG",c:[40.7288,-73.4134]}],
          mapN3: [{n:"KFRG",c:[40.7288,-73.4134]},{n:"KBID",c:[41.1681,-71.5776]},{n:"KMVY",c:[41.3930,-70.6152]},{n:"KPVC",c:[42.0710,-70.2214]},{n:"KFRG",c:[40.7288,-73.4134]}],
          mapN4: [{n:"KFRG",c:[40.7288,-73.4134]},{n:"VZ",c:[40.6066,-74.0447]},{n:"Statue",c:[40.6892,-74.0445]},{n:"Intrepid",c:[40.7645,-73.9996]},{n:"GWB",c:[40.8517,-73.9527]},{n:"Alpine",c:[40.9557,-73.9180]},{n:"KFRG",c:[40.7288,-73.4134]}]
        };
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
