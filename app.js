(function () {
  "use strict";

  const D = window.RIDE_DATA;
  if (!D) return;

  /* =========================================================
   *  GCJ-02 → WGS-84 坐标转换（coordtransform 标准算法）
   * ========================================================= */
  var PI = Math.PI;
  var a = 6378245.0;                // 长半轴
  var ee = 0.00669342162296594323;  // 偏心率平方

  function outOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }
  /** 输入 GCJ-02 经纬度，返回 WGS-84 [lng, lat] */
  function gcj02ToWgs84(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    var dlat = transformLat(lng - 105.0, lat - 35.0);
    var dlng = transformLng(lng - 105.0, lat - 35.0);
    var radlat = lat / 180.0 * PI;
    var magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    var sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * PI);
    dlng = (dlng * 180.0) / (a / sqrtmagic * Math.cos(radlat) * PI);
    var mglat = lat + dlat;
    var mglng = lng + dlng;
    return [lng * 2 - mglng, lat * 2 - mglat];
  }

  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ---------- 1. Hero ---------- */
  function hero() {
    document.getElementById("hero-title").textContent = D.title;

    const period = D.period || "";
    document.getElementById("hero-period").textContent =
      "骑行时段　" + period + (D.ride_days ? "｜共 " + D.ride_days + " 天" : "");

    document.getElementById("hero-route").innerHTML =
      "西进东出 · 逆时针环线：<b>海口 → 临高 → 儋州 → 东方 → 莺歌海 → 三亚 → 陵水 → 万宁 → 博鳌 → 文昌 → 海口</b>";

    const stats = [
      { num: D.total_km || 0, small: "km", lab: "总里程" },
      { num: D.ride_days || 0, small: "天", lab: "骑行天数" },
      { num: (D.nodes ? D.nodes.length : 0), small: "站", lab: "途经站点" },
      { num: D.start && D.start.name ? "→" : "", small: "", lab: (D.start && D.end) ? D.start.name + " ⇒ " + D.end.name : "海口 → 海口" }
    ];
    document.getElementById("hero-stats").innerHTML = stats.map(function (s) {
      return '<div class="stat"><div class="num">' + esc(s.num) + '<small>' + esc(s.small) + '</small></div>' +
        '<div class="lab">' + esc(s.lab) + '</div></div>';
    }).join("");

    const chips = document.getElementById("hero-chips");
    const order = [];
    if (D.nodes) {
      D.nodes.forEach(function (n) {
        if (n.type !== "rest" && order.indexOf(n.city) === -1) order.push(n.city);
      });
    }
    chips.innerHTML = order.map(function (c) { return '<span class="city-chip">' + esc(c) + "</span>"; }).join("")
      || '<span class="city-chip">海口</span>';
  }

  /* ---------- 2. Map ---------- */
  function map() {
    if (typeof L === "undefined") return;

    const mapDiv = document.getElementById("ride-map");
    const map2 = L.map(mapDiv, { scrollWheelZoom: false, zoomControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(map2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map2);

    // 拼接所有 route 的 points 成一条连续环线，并全部转为 WGS-84
    const latlngs = [];
    (D.routes || []).forEach(function (r) {
      (r.points || []).forEach(function (p) {
        if (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null) {
          latlngs.push(gcj02ToWgs84(p[0], p[1]));
        }
      });
    });

    const routeLine = L.polyline(latlngs, {
      color: "#0d7a82", weight: 4, opacity: 0.85
    }).addTo(map2);
    routeLine.bindPopup(
      '<div class="p-title">环线全程</div><div class="p-sub">逆时针 · 海韵椰风</div>'
    );

    // 数据点（start/stop/rest/end）
    const nodeStyle = {
      start: { color: "#3aa66a", label: "起点" },
      stop:  { color: "#4356c9", label: "过夜" },
      rest:  { color: "#d9a13f", label: "休整" },
      end:   { color: "#d9654b", label: "终点" }
    };
    (D.nodes || []).forEach(function (n) {
      if (!Array.isArray(n.lnglat) || n.lnglat[0] == null || n.lnglat[1] == null) return; // 跳过无坐标点（如莺歌海）
      const st = nodeStyle[n.type] || { color: "#4356c9", label: "过夜" };
      const p = gcj02ToWgs84(n.lnglat[0], n.lnglat[1]);
      const mk = L.circleMarker(p, {
        radius: n.type === "rest" ? 7 : 9,
        color: "#fff", weight: 2,
        fillColor: st.color, fillOpacity: 1
      }).addTo(map2);
      const lines = [];
      if (n.day) lines.push('<div class="p-title">' + esc(n.day) + "　" + esc(n.city) + "</div>");
      else lines.push('<div class="p-title">' + esc(n.city) + "</div>");
      if (n.tag) lines.push('<div class="p-sub">' + esc(n.tag) + "</div>");
      if (n.date) lines.push('<div class="p-sub">' + esc(n.date) + "</div>");
      mk.bindPopup(lines.join(""));
    });

    // 景区小圆点
    (D.scenic || []).forEach(function (s) {
      if (!Array.isArray(s.lnglat) || s.lnglat[0] == null || s.lnglat[1] == null) return;
      const p = gcj02ToWgs84(s.lnglat[0], s.lnglat[1]);
      const mk = L.circleMarker(p, {
        radius: 5, color: "#fff", weight: 1.5,
        fillColor: "#2ea5ad", fillOpacity: 0.95
      }).addTo(map2);
      const txt = '<div class="p-title">' + esc(s.name) + "</div>"
        + (s.desc ? '<div class="p-sub">' + esc(s.desc) + "</div>" : "");
      mk.bindPopup(txt);
    });

    // 图例
    const legend = [
      { type: "line", color: "#0d7a82", label: "骑行环线" },
      { type: "dot", color: "#3aa66a", label: "起点" },
      { type: "dot", color: "#4356c9", label: "过夜" },
      { type: "dot", color: "#d9a13f", label: "休整" },
      { type: "dot", color: "#d9654b", label: "终点" },
      { type: "dot", color: "#2ea5ad", label: "景区" }
    ];
    document.getElementById("map-legend").innerHTML = legend.map(function (o) {
      return '<span class="legend-item"><span class="' + (o.type === "line" ? "legend-line" : "legend-dot") +
        '" style="background:' + o.color + '"></span>' + o.label + "</span>";
    }).join("");

    // 自动适应整岛范围
    if (latlngs.length) {
      map2.fitBounds(L.latLngBounds(latlngs).pad(0.18));
    }
  }

  /* ---------- 3. Itinerary ---------- */
  function itinerary() {
    const box = document.getElementById("itinerary-list");
    const nodes = D.nodes || [];
    if (!nodes.length) { box.innerHTML = ""; return; }
    const typeLabel = { start: "起点·落地", stop: "过夜", rest: "休整", end: "终点·离岛" };
    box.innerHTML = nodes.map(function (n) {
      const typeCss = n.type in { start: 1, end: 1, rest: 1 } ? (n.type === "start" ? "day-start" : (n.type === "end" ? "day-end" : "day-rest")) : "day-stop";
      const city = n.city || "";
      const km = (n.type === "start" || n.type === "rest" || !n.km) ? "—" : n.km + " km";
      const tag = n.tag || (typeLabel[n.type] || "过夜");
      return '<div class="day ' + typeCss + '">' +
        '<div class="d-day">' + esc(n.day || n.date || "") + "</div>" +
        '<div class="d-city">' + esc(city) + "</div>" +
        '<div class="d-km">' + esc(km) + "</div>" +
        '<div class="d-tag">' + esc(tag) + "</div>" +
        "</div>";
    }).join("");
  }

  /* ---------- 4. Weather ---------- */
  function tagOf(season) {
    if (!season) return [];
    const tags = [];
    if (/台[风疯]|高风|大风/.test(season)) tags.push({ k: "tf", t: "注意台风/大风" });
    if (/雨|湿/.test(season)) tags.push({ k: "rain", t: "雨季·阵雨" });
    if (/晒|热|日[照射]/.test(season) || /晴|干燥|少雨/.test(season)) tags.push({ k: "sun", t: "防晒补水" });
    if (!tags.length) tags.push({ k: "", t: "沿海风大" });
    return tags;
  }
  function weather() {
    const grid = document.getElementById("weather-grid");
    const keys = Object.keys(D.weather || {});
    if (!keys.length) { grid.innerHTML = ""; return; }
    grid.innerHTML = keys.map(function (city) {
      const w = D.weather[city] || {};
      const now = w.now || {};
      const weatherText = now.weather || "暂无数据";
      const temp = (now.temperature != null) ? now.temperature : (now.temperature_float != null ? now.temperature_float : null);
      const humidity = (now.humidity != null) ? now.humidity : (now.humidity_float != null ? now.humidity_float : null);
      const winddir = now.winddirection || "—";
      const windpow = now.windpower != null ? now.windpower : "—";
      const season = w.season || "沿海气候，风大需防风";

      return '<div class="wx-card">' +
        '<div class="wx-top"><span class="wx-city">' + esc(city) + '</span>' +
        '<span class="wx-now">' + esc(weatherText) + "</span></div>" +
        '<div class="wx-temp">' + esc(temp != null ? temp : "—") + '<small>°C</small></div>' +
        '<div class="wx-meta">' +
        (humidity != null ? '<span><b>湿度</b> ' + esc(humidity) + "%</span>" : "") +
        '<span><b>风向</b> ' + esc(winddir) + "</span>" +
        '<span><b>风力</b> ' + esc(windpow) + "</span>" +
        "</div>" +
        '<div class="wx-badges">' + tagOf(season).map(function (t) {
          return '<span class="badge ' + t.k + '">' + esc(t.t) + "</span>";
        }).join("") + "</div>" +
        '<div class="wx-season">' + esc(season) + "</div>" +
        "</div>";
    }).join("");
  }

  /* ---------- 5. Scenic ---------- */
  function scenic() {
    const grid = document.getElementById("scenic-grid");
    const list = D.scenic || [];
    if (!list.length) { grid.innerHTML = ""; return; }
    grid.innerHTML = list.map(function (s) {
      const name = esc(s.name || "");
      const city = esc(s.city || "");
      const desc = esc(s.desc || "");
      const img = s.img ? esc(s.img) : "";
      return '<article class="scenic-card">' +
        '<div class="scenic-media">' +
        (img ? '<img src="' + img + '" alt="' + name + '" loading="lazy" onerror="this.remove()" />' : "") +
        "</div>" +
        '<div class="scenic-body">' +
        '<span class="scenic-city">' + city + "</span>" +
        '<h3 class="scenic-name">' + name + "</h3>" +
        '<p class="scenic-desc">' + (desc || "") + "</p>" +
        "</div>" +
        "</article>";
    }).join("");
  }

  /* ---------- 6. Gear tips ---------- */
  function gear() {
    const tips = [
      { ico: "🚴", title: "单车与装备", text: "山地车或公路车首选，出发前检查刹车、链条与胎压；带好头盔、手套、车灯与备用内胎和打气筒。" },
      { ico: "🧴", title: "防晒是头等大事", text: "海南日照强，物理防晒（长袖骑行服）＋高倍防晒霜，每隔 2 小时补涂；墨镜、面巾同样能挡风防晒。" },
      { ico: "🌧", title: "雨具与防水", text: "9–10 月仍是台风雨季尾部，随身轻薄雨披、手机防水袋；电子设备与证件务必装入防水包。" },
      { ico: "💧", title: "补水与能量", text: "每天补水 1.5–2L，携带电解质冲剂与能量补给；沿途村镇多，避开正午暴晒时段骑行更安全。" },
      { ico: "🔋", title: "电量与导航", text: "全程约 800km，移动电源（2 万毫安以上）随身带；提前离线下载沿线地图，沿海路段信号偶有波动。" }
    ];
    document.getElementById("gear-list").innerHTML = tips.map(function (t) {
      return '<div class="gear-card"><div class="gear-ico">' + t.ico + "</div>" +
        '<h3 class="gear-title">' + esc(t.title) + "</h3>" +
        '<p class="gear-text">' + esc(t.text) + "</p></div>";
    }).join("");
  }

  hero();
  itinerary();
  weather();
  scenic();
  gear();
  map();
})();