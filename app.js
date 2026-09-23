/* ============================================================
 * 环海南岛骑行计划 · 单文件离线版 —— 全部逻辑
 * 依赖：Leaflet（内联）、PLAN / ROUTES / COAST / BUILD（构建时注入）
 * 坐标政策：全程 GCJ-02，不做纠偏；底图用高德栅格瓦片（同坐标系）
 * 联网增强（瓦片 / 天气 / 定位）失败一律静默降级，绝不弹窗打断
 * 兼容：ES5+（iOS Safari），无框架、无外部字体
 * ============================================================ */
(function () {
  'use strict';

  if (typeof PLAN === 'undefined' || typeof ROUTES === 'undefined' || typeof COAST === 'undefined') return;

  /* ================= 基础工具 ================= */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function todayStr() {
    var t = new Date();
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  }
  function fmtTs(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtH(h) {  // 6.1 → "6h06m"
    if (!h) return '';
    var hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    return hh + 'h' + (mm ? (mm < 10 ? '0' : '') + mm + 'm' : '');
  }

  /* ================= 数据访问 ================= */
  // 11 日色板（D6 休整日配灰，其余按建议色板）
  var DAY_COLORS = ['#0ea5e9', '#0891b2', '#14b8a6', '#22c55e', '#84cc16', '#94a3b8', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1'];
  function dayColor(dayId) {
    var i = parseInt(String(dayId).replace('D', ''), 10) - 1;
    return DAY_COLORS[i] || '#0e7490';
  }
  function routeDay(dayId) {
    for (var i = 0; i < ROUTES.days.length; i++) if (ROUTES.days[i].day === dayId) return ROUTES.days[i];
    return null;
  }
  function planDay(dayId) {
    for (var i = 0; i < PLAN.days.length; i++) if (PLAN.days[i].id === dayId) return PLAN.days[i];
    return null;
  }
  // 强度日红 / 缓冲日绿 / 休整日蓝 / 硬时限日橙 / 出发日紫 / 其余灰
  function tagInfo(d) {
    var t = d.tag || '';
    if (d.type === 'rest') return { cls: 'tag-blue', label: '休整日' };
    if (t.indexOf('强度') >= 0 || t.indexOf('最长') >= 0) return { cls: 'tag-red', label: '强度日' };
    if (t.indexOf('缓冲') >= 0) return { cls: 'tag-green', label: '缓冲日' };
    if (t.indexOf('硬时限') >= 0 || t.indexOf('收官') >= 0) return { cls: 'tag-orange', label: '硬时限日' };
    if (t.indexOf('出发') >= 0) return { cls: 'tag-purple', label: '出发日' };
    return { cls: 'tag-slate', label: '常规日' };
  }
  // 文本中的电话号码转为 tel: 链接
  function appendLinkedText(parent, text) {
    var re = /(1[3-9]\d{9}|(?:0\d{2,3}-)?\d{7,8})/g;
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el('a', 'tel', m[1]);
      a.href = 'tel:' + m[1];
      parent.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ================= WGS-84 → GCJ-02（标准算法，纯 JS） =================
   * 浏览器定位返回 WGS-84，需转换后才能与 GCJ-02 轨迹/底图对齐 */
  var PI = 3.1415926535897932384626;
  var SEMI = 6378245.0;
  var EE = 0.00669342162296594323;
  function outOfChina(lng, lat) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
  function tfLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }
  function tfLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }
  function wgs84ToGcj02(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    var dLat = tfLat(lng - 105.0, lat - 35.0);
    var dLng = tfLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((SEMI * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (SEMI / sqrtMagic * Math.cos(radLat) * PI);
    return [lng + dLng, lat + dLat];
  }

  /* ================= Toast（替代 alert 的轻提示） ================= */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2400);
  }

  /* ================= 1 · Hero 总览 ================= */
  function renderHero() {
    var m = PLAN.meta;
    var root = $('hero');
    var wrap = el('div', 'hero');
    wrap.appendChild(el('h1', 'hero-title', m.title));
    wrap.appendChild(el('p', 'hero-sub', m.subtitle));
    wrap.appendChild(el('p', 'hero-dir', '🧭 ' + m.direction + ' · ' + m.rest_note));

    var restDays = 0;
    for (var i = 0; i < PLAN.days.length; i++) if (PLAN.days[i].type === 'rest') restDays++;
    var nums = el('div', 'hero-nums');
    var numItems = [
      [m.total_km + ' km', '总里程'],
      [m.ride_days + ' 天', '骑行'],
      [restDays + ' 天', '休整'],
      ['10.6 10:30', '还车硬截止·到店']
    ];
    for (var j = 0; j < numItems.length; j++) {
      var n = el('div', 'hero-num');
      n.appendChild(el('b', null, numItems[j][0]));
      n.appendChild(el('span', null, numItems[j][1]));
      nums.appendChild(n);
    }
    wrap.appendChild(nums);

    var hc = el('div', 'hard-cards');
    for (var k = 0; k < m.hard.length; k++) {
      var c = el('div', 'hard-card');
      c.appendChild(el('div', 'hard-icon', m.hard[k].icon));
      c.appendChild(el('div', 'hard-t', m.hard[k].t));
      c.appendChild(el('div', 'hard-d', m.hard[k].d));
      hc.appendChild(c);
    }
    wrap.appendChild(hc);

    var r = m.rider;
    var rc = el('div', 'rider-card');
    rc.appendChild(el('div', 'block-title', '🧍 骑手画像与配速依据'));
    var chips = el('div', 'rider-chips');
    var chipTxt = [r.age + ' 岁', r.height_cm + ' cm', r.weight_kg + ' kg', 'BMI ' + round1(r.weight_kg / Math.pow(r.height_cm / 100, 2))];
    for (var ci = 0; ci < chipTxt.length; ci++) chips.appendChild(el('span', 'rider-chip', chipTxt[ci]));
    rc.appendChild(chips);
    rc.appendChild(el('p', 'rider-bg', '背景：' + r.background));
    rc.appendChild(el('p', 'rider-pace', '🚲 ' + r.pace));
    var ul = el('ul', 'rider-basis');
    for (var bi = 0; bi < r.basis.length; bi++) ul.appendChild(el('li', null, r.basis[bi]));
    rc.appendChild(ul);

    root.appendChild(wrap);
    root.appendChild(rc);
  }

  /* ================= 2 · 地图 ================= */
  var map = null;
  var dayLayers = {};    // dayId -> L.polyline（可见轨迹）
  var dayBounds = {};    // dayId -> L.LatLngBounds
  var selected = null;   // 当前高亮的日
  var allBounds = null;  // 全部轨迹范围
  var altGroup = null;   // 备选线图层组
  var locMarker = null;  // “我的位置”标记
  var ALT_INFO = {
    pb_d10_direct: { name: '清澜 → 演丰 直达', note: 'D9 止步清澜时启用 · 跳过东北角省 84km' },
    pb_d11_direct: { name: '铺前 → 还车点 直达', note: 'D10 止步铺前时启用 · 次日 05:45 出发直奔还车点' }
  };

  function emojiIcon(emoji, cls) {
    // 标记一律用 divIcon（HTML/emoji），不依赖任何图片
    return L.divIcon({
      html: '<div class="mk ' + cls + '">' + emoji + '</div>',
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function applySelection() {
    for (var i = 0; i < ROUTES.days.length; i++) {
      var d = ROUTES.days[i];
      var pl = dayLayers[d.day];
      if (!pl) continue;
      var on = !selected || selected === d.day;
      pl.setStyle({ opacity: on ? 0.92 : 0.10, weight: selected === d.day ? 5.5 : 3 });
    }
    var chips = document.querySelectorAll('.lg-chip');
    for (var c = 0; c < chips.length; c++) {
      var chip = chips[c];
      var act = chip.getAttribute('data-day') === selected;
      chip.className = 'lg-chip' + (act ? ' lg-active' : '');
      chip.style.borderColor = act ? dayColor(chip.getAttribute('data-day')) : '';
    }
  }

  function selectDay(dayId, opts) {  // 图例/轨迹点击：切换高亮 + 滚动到卡片
    opts = opts || {};
    selected = (selected === dayId) ? null : dayId;
    applySelection();
    if (selected && opts.scroll) scrollDayCard(selected);
  }
  function highlightDay(dayId) {     // 卡片“在地图上查看”：强制高亮
    selected = dayId;
    applySelection();
  }
  function scrollDayCard(dayId) {
    var card = $('card-' + dayId);
    if (card && card.scrollIntoView) {
      try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e) { card.scrollIntoView(); }
    }
  }

  function focusDayOnMap(dayId) {    // 卡片 → 地图反向联动
    highlightDay(dayId);
    var b = dayBounds[dayId];
    if (!b) {  // 休整日无轨迹：飞到前一日过夜点
      var idx = -1;
      for (var i = 0; i < ROUTES.days.length; i++) if (ROUTES.days[i].day === dayId) idx = i;
      for (var j = idx - 1; j >= 0; j--) {
        var pts = ROUTES.days[j].points;
        if (pts && pts.length) {
          var p = pts[pts.length - 1];
          b = L.latLngBounds([p, p]);
          break;
        }
      }
    }
    var sec = $('mapsec');
    if (sec && sec.scrollIntoView) {
      try { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e) { sec.scrollIntoView(); }
    }
    if (b && map) {
      try { map.flyToBounds(b, { padding: [36, 36], maxZoom: 12 }); }
      catch (e) { map.fitBounds(b, { padding: [36, 36] }); }
    }
  }

  /* 坐标顺序：数据文件按 GeoJSON / 高德惯例存 [lng, lat]，而 Leaflet 一律要求 [lat, lng]。
     不转换会被 Leaflet 当成 lat=110 之类的非法纬度，投影时钳制到 85.051 → 整幅图塌成一条水平线。
     这里在交给 Leaflet 之前统一转换一次（原地改 ROUTES，保证后续读取点一致）。 */
  function toLL(p) { return [p[1], p[0]]; }
  function toLLs(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) out.push(toLL(arr[i]));
    return out;
  }
  function toLLDeep(a) {            // Polygon / MultiPolygon 递归
    if (!a || !a.length) return a;
    if (typeof a[0][0] === 'number') return toLLs(a);
    var o = [];
    for (var j = 0; j < a.length; j++) o.push(toLLDeep(a[j]));
    return o;
  }

  function initMap() {
    // [lng,lat] → [lat,lng]
    for (var n = 0; n < ROUTES.days.length; n++) {
      var dn = ROUTES.days[n];
      if (dn.points && dn.points.length) dn.points = toLLs(dn.points);
    }
    for (var ek in ROUTES.extras) {
      var ev = ROUTES.extras[ek];
      if (ev && ev.points && ev.points.length) ev.points = toLLs(ev.points);
    }
    var coastLL = toLLDeep(COAST.coordinates);

    map = L.map('map', { attributionControl: true });
    // 用纯文本替换默认 attribution 前缀（默认值带官网外链，离线页面不需要）
    if (map.attributionControl && map.attributionControl.setPrefix) {
      map.attributionControl.setPrefix('Leaflet');
    }

    // 高德栅格瓦片（GCJ-02，与轨迹/海岸线同坐标系；断网时加载失败自动静默）
    L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: '1234',
      attribution: '高德地图',
      maxZoom: 18
    }).addTo(map);

    // 海南主岛海岸线（离线常显）
    L.polygon(coastLL, {
      color: '#0e7490', weight: 1.2, opacity: 0.55,
      fillColor: '#0891b2', fillOpacity: 0.07,
      interactive: false
    }).addTo(map);

    allBounds = L.latLngBounds([]);

    // 逐日轨迹 + 点击热区（透明宽线，方便手指点击）
    for (var i = 0; i < ROUTES.days.length; i++) {
      (function (d) {
        if (!d.points || !d.points.length) return;
        var color = dayColor(d.day);
        var pl = L.polyline(d.points, { color: color, weight: 3, opacity: 0.92 }).addTo(map);
        var hit = L.polyline(d.points, { weight: 16, opacity: 0, interactive: true }).addTo(map);
        var onHit = function () {
          selectDay(d.day, { scroll: true });
        };
        pl.on('click', onHit);
        hit.on('click', onHit);
        dayLayers[d.day] = pl;
        dayBounds[d.day] = pl.getBounds();
        allBounds.extend(dayBounds[d.day]);
      })(ROUTES.days[i]);
    }

    // 点击空白处取消高亮（点击轨迹时通过标志位跳过一次）
    var suppressMapClick = false;
    map.on('click', function () {
      if (suppressMapClick) return;
      if (selected) { selected = null; applySelection(); }
    });
    var rawSelect = selectDay;
    selectDay = function (dayId, opts) {  // 包装：标记本帧刚点过轨迹
      suppressMapClick = true;
      setTimeout(function () { suppressMapClick = false; }, 0);
      rawSelect(dayId, opts);
    };

    // 起点 ⭐
    var d1 = routeDay('D1');
    if (d1 && d1.points && d1.points.length) {
      L.marker(d1.points[0], { icon: emojiIcon('⭐', 'mk-start') }).addTo(map)
        .bindPopup('<b>出发 · CDF免税城</b><br>环岛旅游公路零点纪念碑<br>9.26（周六）11:00 打卡出发');
    }

    // 每晚过夜点（按日配色 circleMarker；D11 为还车点 🏁；D6 无轨迹跳过）
    for (var k = 0; k < ROUTES.days.length; k++) {
      var d = ROUTES.days[k];
      if (!d.points || !d.points.length) continue;
      var p = d.points[d.points.length - 1];
      var dateShort = String(d.date || '').split(' ')[0];
      var km = '';
      var pd = planDay(d.day);
      if (pd && pd.distance_km) km = ' ' + round1(pd.distance_km) + 'km';
      if (d.day === 'D11') {
        L.marker(p, { icon: emojiIcon('🏁', 'mk-finish') }).addTo(map)
          .bindPopup('<b>D11 · ' + dateShort + ' · 还车点</b><br>新埠岛·西湾别墅 517驿站<br>10:30 前到店 · 11:00 租期硬截止');
      } else if (d.type !== 'rest') {
        L.circleMarker(p, {
          radius: 6, color: '#ffffff', weight: 2,
          fillColor: dayColor(d.day), fillOpacity: 1
        }).addTo(map)
          .bindPopup('<b>' + d.day + ' · ' + dateShort + '</b><br>' + (d.overnight || '') + km);
      }
    }

    // 机场 ✈️（浏览器/公开数据为 WGS-84，转换到 GCJ-02 后打点）
    var airport = wgs84ToGcj02(110.4517, 19.9350);
    L.marker(toLL(airport), { icon: emojiIcon('✈️', 'mk-airport') }).addTo(map)
      .bindPopup('<b>美兰机场</b><br>10.6 17:40 起飞 · 16:40 前值机<br>还车点打车约 25km / 30 分钟');

    // 备选线（默认隐藏，图例区复选框切换；灰色虚线）
    var altLines = [];
    for (var key in ALT_INFO) {
      if (!ROUTES.extras || !ROUTES.extras[key] || !ROUTES.extras[key].points) continue;
      var ex = ROUTES.extras[key];
      var info = ALT_INFO[key];
      altLines.push(
        L.polyline(ex.points, { color: '#64748b', weight: 3, dashArray: '7 7', opacity: 0.9 })
          .bindPopup('<b>备选线 · ' + info.name + '</b> ' + round1(ex.distance_km) + 'km<br>' + info.note)
      );
    }
    altGroup = L.layerGroup(altLines);

    // 初始视野：全部轨迹
    if (allBounds.isValid()) map.fitBounds(allBounds, { padding: [16, 16] });

    // 工具按钮
    $('btn-fit').onclick = function () {
      if (allBounds.isValid()) map.flyToBounds(allBounds, { padding: [16, 16] });
    };
    $('btn-locate').onclick = function () {
      if (!navigator.geolocation) { toast('此浏览器不支持定位'); return; }
      toast('定位中…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var c = toLL(wgs84ToGcj02(pos.coords.longitude, pos.coords.latitude));
        if (locMarker) {
          locMarker.setLatLng(c);
        } else {
          locMarker = L.circleMarker(c, {
            radius: 9, color: '#ffffff', weight: 3,
            fillColor: '#2563eb', fillOpacity: 1
          }).addTo(map).bindPopup('📍 我的位置（已转 GCJ-02）');
        }
        map.flyTo(c, Math.max(map.getZoom(), 11));
        locMarker.openPopup();
      }, function (err) {
        toast('定位失败：' + (err && err.message ? err.message : '未授权或无信号'));
      }, { enableHighAccuracy: true, timeout: 9000 });
    };
  }

  function renderLegend() {
    var bar = $('legend-bar');
    var chips = el('div', 'legend-chips');
    for (var i = 0; i < PLAN.days.length; i++) {
      (function (d) {
        var b = el('button', 'lg-chip');
        b.type = 'button';
        b.setAttribute('data-day', d.id);
        var dot = el('i', 'lg-dot');
        dot.style.background = dayColor(d.id);
        b.appendChild(dot);
        b.appendChild(document.createTextNode(d.id + ' ' + String(d.label || '').split(' ')[0]));
        b.onclick = function () { selectDay(d.id, { scroll: true }); };
        chips.appendChild(b);
      })(PLAN.days[i]);
    }
    bar.appendChild(chips);

    var alt = el('label', 'lg-alt');
    var cb = el('input');
    cb.type = 'checkbox';
    cb.onchange = function () {
      if (cb.checked) altGroup.addTo(map);
      else map.removeLayer(altGroup);
    };
    alt.appendChild(cb);
    var altNames = [];
    for (var key in ALT_INFO) altNames.push(ALT_INFO[key].name);
    alt.appendChild(document.createTextNode(' 显示备选线（' + altNames.join(' / ') + '）'));
    bar.appendChild(alt);
  }

  /* ================= 3 · 行程卡片 ================= */
  function buildDayCard(d) {
    var isToday = (d.date === todayStr());
    var color = dayColor(d.id);
    var card = el('article', 'day-card' + (isToday ? ' is-today' : ''));
    card.id = 'card-' + d.id;
    card.style.borderLeftColor = color;

    // 卡头
    var head = el('div', 'day-head');
    var no = el('span', 'day-no', d.id);
    no.style.color = color;
    head.appendChild(no);
    head.appendChild(el('span', 'day-label', d.label));
    var tg = tagInfo(d);
    head.appendChild(el('span', 'tagb ' + tg.cls, tg.label));
    if (isToday) head.appendChild(el('span', 'todayb', '今天'));
    var btn = el('button', 'btn-mapview', '📍 地图');
    btn.type = 'button';
    btn.title = '在地图上查看 ' + d.id;
    btn.onclick = function () { focusDayOnMap(d.id); };
    head.appendChild(btn);
    card.appendChild(head);

    // 关键数据
    var stats = el('div', 'day-stats');
    if (d.type !== 'rest') {
      stats.appendChild(el('span', 'day-dist', d.distance_km + ' km'));
      if (d.start) stats.appendChild(el('span', 'day-time', '⏱ ' + d.start + ' → ' + d.eta));
      if (d.ride_h) stats.appendChild(el('span', 'day-rideh', '骑行 ' + fmtH(d.ride_h)));
    }
    card.appendChild(stats);

    if (d.type === 'rest') {
      card.appendChild(el('p', 'day-route', '三亚 · 完整休整（不位移）'));
    } else {
      var route = el('p', 'day-route');
      route.appendChild(document.createTextNode(d.from));
      var ar = el('span', 'arrow', ' → ');
      route.appendChild(ar);
      route.appendChild(document.createTextNode(d.to));
      card.appendChild(route);
    }
    if (d.tag) card.appendChild(el('p', 'day-tagline', d.tag));

    // 地形与风向
    if (d.terrain || d.wind) {
      var tw = el('div', 'day-terrain');
      if (d.terrain) tw.appendChild(el('div', 'tw-row', '🛣 ' + d.terrain));
      if (d.wind) tw.appendChild(el('div', 'tw-row', '🌬 ' + d.wind));
      card.appendChild(tw);
    }

    // 分段进度
    if (d.segments && d.segments.length) {
      var seg = el('div', null);
      seg.appendChild(el('div', 'mini-title', '🧭 分段进度'));
      var barEl = el('div', 'segbar');
      var list = el('ul', 'seg-list');
      var cum = 0;
      for (var i = 0; i < d.segments.length; i++) {
        var s = d.segments[i];
        cum += s.km;
        var fill = el('div', 'segfill');
        fill.style.width = Math.max(2.5, s.km / d.distance_km * 100).toFixed(1) + '%';
        fill.style.background = color;
        fill.style.opacity = (0.35 + 0.65 * (i + 1) / d.segments.length).toFixed(2);
        fill.setAttribute('title', s.to + ' +' + s.km + 'km');
        barEl.appendChild(fill);
        var li = el('li', 'seg-item');
        li.appendChild(el('span', 'seg-name', (i + 1) + '. ' + s.to));
        li.appendChild(el('span', 'seg-km', '+' + s.km + ' km · 累计 ' + Math.round(cum * 10) / 10));
        list.appendChild(li);
      }
      seg.appendChild(barEl);
      seg.appendChild(list);
      card.appendChild(seg);
    }

    // 当日时间线
    if (d.schedule && d.schedule.length) {
      var tl = el('div', null);
      tl.appendChild(el('div', 'mini-title', d.type === 'rest' ? '🗓 当日安排' : '⏱ 当日时间线'));
      for (var t = 0; t < d.schedule.length; t++) {
        var row = el('div', 'tl-row');
        row.appendChild(el('span', 'tl-t', d.schedule[t].t));
        row.appendChild(el('span', 'tl-e', d.schedule[t].e));
        tl.appendChild(row);
      }
      card.appendChild(tl);
    }

    // 亮点 chips
    if (d.highlights && d.highlights.length) {
      var hl = el('div', 'day-highlights');
      for (var h = 0; h < d.highlights.length; h++) hl.appendChild(el('span', 'chip', '🌟 ' + d.highlights[h]));
      card.appendChild(hl);
    }

    // 补给 / 食 / 宿
    var info = el('div', 'day-info');
    function infoRow(k, v) {
      var r = el('div', 'info-row');
      r.appendChild(el('span', 'info-k', k));
      r.appendChild(el('span', 'info-v', v));
      return r;
    }
    if (d.supply) info.appendChild(infoRow('补给', d.supply));
    if (d.food) info.appendChild(infoRow('食', d.food));
    if (d.lodge && d.lodge !== '—') info.appendChild(infoRow('宿', d.lodge));
    if (info.childNodes.length) card.appendChild(info);

    // 必达
    if (d.must) {
      var mu = el('div', 'must');
      mu.appendChild(el('i', 'must-ic', '❗'));
      mu.appendChild(el('span', null, d.must));
      card.appendChild(mu);
    }

    // 彩蛋
    if (d.eggs && d.eggs.length) {
      var eg = el('div', 'day-eggs');
      for (var e = 0; e < d.eggs.length; e++) {
        var b = el('div', 'egg');
        b.appendChild(el('div', 'egg-name', '🥚 ' + d.eggs[e].name));
        b.appendChild(el('div', 'egg-note', d.eggs[e].note));
        eg.appendChild(b);
      }
      card.appendChild(eg);
    }

    // Plan B（文本中的电话自动转为 tel: 链接）
    if (d.planb) {
      var pb = el('div', 'planb');
      pb.appendChild(el('div', 'planb-t', '🅱️ Plan B'));
      var pp = el('p');
      appendLinkedText(pp, d.planb);
      pb.appendChild(pp);
      card.appendChild(pb);
    }

    // 闸门条
    if (d.gate) card.appendChild(el('div', 'gate', '🚧 闸门 · ' + d.gate));

    return card;
  }

  function renderDays() {
    var root = $('days');
    var todayDay = null;
    for (var i = 0; i < PLAN.days.length; i++) {
      var d = PLAN.days[i];
      if (d.date === todayStr()) todayDay = d;
      root.appendChild(buildDayCard(d));
    }
    // 导航“行程”高亮今天
    if (todayDay) {
      var navIt = $('nav-itinerary');
      if (navIt) {
        var dot = el('span', 'nav-dot', '今天 ' + todayDay.id);
        navIt.appendChild(dot);
      }
    }
  }

  /* ================= 4 · 健壮性 ================= */
  function renderRobust() {
    var R = PLAN.robustness;
    var root = $('robust-body');
    root.appendChild(el('p', 'rob-intro', '🎯 ' + R.intro));

    // 闸门表
    var b1 = el('div', 'block');
    b1.appendChild(el('div', 'block-title', '🚧 每晚闸门（最低到达位置）'));
    var table = el('table', 'gate-table');
    var thead = el('thead');
    var hr = el('tr');
    var heads = ['夜', '必须到达位置', '累计 km'];
    for (var i = 0; i < heads.length; i++) hr.appendChild(el('th', null, heads[i]));
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    for (var g = 0; g < R.gates.length; g++) {
      var gt = R.gates[g];
      var tr = el('tr');
      if (String(gt.place).indexOf('硬闸门') >= 0 || String(gt.place).indexOf('还车') >= 0) tr.className = 'g-hard';
      tr.appendChild(el('td', 'g-night', gt.night));
      tr.appendChild(el('td', null, gt.place));
      tr.appendChild(el('td', 'g-km', String(gt.cum_km)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    b1.appendChild(table);
    root.appendChild(b1);

    // 省里程开关
    var b2 = el('div', 'block');
    b2.appendChild(el('div', 'block-title', '🎚️ 省里程 / 省时开关'));
    var sgrid = el('div', 'switch-grid');
    for (var s = 0; s < R.switches.length; s++) {
      var sw = R.switches[s];
      var sc = el('div', 'switch-card');
      var sh = el('div', 'sw-head');
      sh.appendChild(el('span', 'sw-name', sw.name));
      sh.appendChild(el('span', 'sw-save', sw.save));
      sc.appendChild(sh);
      sc.appendChild(el('p', 'sw-note', sw.note));
      sgrid.appendChild(sc);
    }
    b2.appendChild(sgrid);
    root.appendChild(b2);

    // 追赶方案
    var b3 = el('div', 'block');
    b3.appendChild(el('div', 'block-title', '🐢 追赶方案'));
    var c1 = el('div', 'catch');
    c1.appendChild(el('div', 'catch-t', '落后半天（午后爆胎 / 午后雷阵雨）'));
    c1.appendChild(el('p', null, R.catchup.half));
    b3.appendChild(c1);
    var c2 = el('div', 'catch');
    c2.appendChild(el('div', 'catch-t', '落后一天（10.3 晚仍在万宁 / 陵水一带）'));
    c2.appendChild(el('p', null, R.catchup.full));
    b3.appendChild(c2);
    root.appendChild(b3);

    // 止损方案（电话 tel: 可点）
    var b4 = el('div', 'block');
    b4.appendChild(el('div', 'block-title', '🆘 止损方案（提前收官）'));
    var stg = el('div', 'stop-grid');
    for (var o = 0; o < R.stoploss.length; o++) {
      var so = R.stoploss[o];
      var stc = el('div', 'stop-card');
      stc.appendChild(el('div', 'sw-name', so.name));
      var sp = el('p', 'sw-note');
      appendLinkedText(sp, so.note);
      stc.appendChild(sp);
      stg.appendChild(stc);
    }
    b4.appendChild(stg);
    root.appendChild(b4);

    // 台风规则
    var b5 = el('div', 'block');
    b5.appendChild(el('div', 'block-title', '🌀 台风规则（唯一系统性风险）'));
    var ol = el('ol', 'ty-list');
    for (var y = 0; y < R.typhoon.length; y++) ol.appendChild(el('li', null, R.typhoon[y]));
    b5.appendChild(ol);
    root.appendChild(b5);

    // 外链
    var lk = el('div', 'ext-links');
    for (var l = 0; l < PLAN.links.length; l++) {
      var a = el('a', 'ext-link', PLAN.links[l].name + ' ↗');
      a.href = PLAN.links[l].url;
      a.target = '_blank';
      a.rel = 'noopener';
      lk.appendChild(a);
    }
    b5.appendChild(lk);
  }

  /* ================= 5 · 天气 ================= */
  var WX_INTERVAL = 450;      // 串行请求间隔（ms），QPS≈2.2 < 3
  var WX_TTL_HOURS = 3;       // 缓存超过该时长且在线时提示可刷新
  var cityEls = {};           // adcode -> {card, }
  var wxStatus = null;
  var wxBtn = null;
  var wxFetching = false;

  function wxEmoji(s) {
    if (!s) return '🌤️';
    var rules = [
      [/台风/, '🌀'], [/雷阵雨/, '⛈️'], [/大暴雨/, '⛈️'], [/暴雨/, '⛈️'],
      [/大雨/, '🌧️'], [/中雨/, '🌧️'], [/小雨/, '🌦️'], [/阵雨/, '🌦️'], [/雨/, '🌧️'],
      [/雾/, '🌫️'], [/多云/, '⛅'], [/阴/, '☁️'], [/晴/, '☀️']
    ];
    for (var i = 0; i < rules.length; i++) if (rules[i][0].test(s)) return rules[i][1];
    return '🌤️';
  }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function readWxCache(adcode) {
    var raw = lsGet('hnbike_wx_' + adcode);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (o && o.data && o.t) return o;
    } catch (e) {}
    return null;
  }

  function renderWeatherShell() {
    var root = $('weather-body');
    var bar = el('div', 'wx-bar');
    wxBtn = el('button', 'btn', '🔄 刷新天气');
    wxBtn.type = 'button';
    wxStatus = el('span', 'wx-status', '…');
    bar.appendChild(wxBtn);
    bar.appendChild(wxStatus);
    root.appendChild(bar);

    var grid = el('div', 'wx-grid');
    for (var i = 0; i < PLAN.weather_cities.length; i++) {
      (function (c) {
        var card = el('div', 'wx-card');
        var top = el('div', 'wx-top');
        top.appendChild(el('span', 'wx-city', c.name));
        var em = el('span', 'wx-emoji', '…');
        top.appendChild(em);
        card.appendChild(top);
        card.appendChild(el('div', 'wx-temp', '—'));
        card.appendChild(el('div', 'wx-wind', ''));
        card.appendChild(el('div', 'wx-time', '未获取'));
        card.appendChild(el('div', 'wx-detail'));
        card.onclick = function () { card.classList.toggle('wx-open'); };
        grid.appendChild(card);
        cityEls[c.adcode] = card;
      })(PLAN.weather_cities[i]);
    }
    root.appendChild(grid);
    root.appendChild(el('p', 'wx-note', 'ℹ️ ' + PLAN.weather_note));

    wxBtn.onclick = function () {
      if (wxFetching) return;
      if (!navigator.onLine) { toast('当前离线，显示最近缓存'); return; }
      fetchAllWeather();
    };
  }

  function renderCity(adcode, resp, cacheTs) {
    var card = cityEls[adcode];
    if (!card || !resp || !resp.forecasts || !resp.forecasts.length) return;
    var f = resp.forecasts[0];
    var casts = f.casts || [];
    var t0 = casts[0] || {};
    card.querySelector('.wx-emoji').textContent = wxEmoji(t0.dayweather);
    card.querySelector('.wx-temp').textContent =
      (t0.daytemp || '—') + '° / ' + (t0.nighttemp || '—') + '°';
    card.querySelector('.wx-wind').textContent =
      (t0.daywind || '') + '风 ' + (t0.daypower || '') + ' 级';
    var timeNote;
    if (cacheTs) {
      timeNote = '缓存于 ' + fmtTs(cacheTs);
      var ageH = (Date.now() - cacheTs) / 3600000;
      if (ageH > WX_TTL_HOURS) timeNote += '（较旧）';
    } else {
      var rt = String(f.reportime || '');
      timeNote = '发布 ' + (rt.length >= 16 ? rt.slice(5, 16) : rt);
    }
    card.querySelector('.wx-time').textContent = timeNote;

    // 展开区：4 日预报（日期 / 白天 / 夜间 / 温度范围）
    var det = card.querySelector('.wx-detail');
    det.innerHTML = '';
    var wkNames = ['一', '二', '三', '四', '五', '六', '日'];
    for (var i = 0; i < casts.length && i < 4; i++) {
      var cs = casts[i];
      var row = el('div', 'wx-cast');
      var dt = String(cs.date || '');
      var wk = parseInt(cs.week, 10);
      var wkTxt = (wk >= 1 && wk <= 7) ? ' 周' + wkNames[wk - 1] : '';
      row.appendChild(el('span', 'wx-cast-d', (dt.length >= 10 ? dt.slice(5) : dt) + wkTxt));
      row.appendChild(el('span', 'wx-cast-w', wxEmoji(cs.dayweather) + ' ' + (cs.dayweather || '') + ' / ' + (cs.nightweather || '')));
      row.appendChild(el('span', 'wx-cast-t', (cs.nighttemp || '—') + '~' + (cs.daytemp || '—') + '°'));
      det.appendChild(row);
    }
  }

  function fetchOneWeather(city, cb) {
    var url = 'https://restapi.amap.com/v3/weather/weatherInfo?key=' +
      encodeURIComponent(PLAN.meta.amap_key) + '&city=' + city.adcode + '&extensions=all';
    if (typeof fetch !== 'function') { cb(); return; }
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.forecasts && j.forecasts.length) {
          lsSet('hnbike_wx_' + city.adcode, JSON.stringify({ t: Date.now(), data: j }));
          renderCity(city.adcode, j, null);
        }
      })
      .catch(function () { /* 静默降级 */ })
      .then(cb);  // 无论成败都继续串行
  }

  function fetchAllWeather() {
    if (wxFetching) return;
    wxFetching = true;
    if (wxBtn) wxBtn.disabled = true;
    var queue = PLAN.weather_cities.slice(0);
    if (wxStatus) wxStatus.textContent = '更新中（串行请求，约 ' + Math.ceil(queue.length * 0.45 + 1) + ' 秒）…';
    (function next() {
      if (!queue.length) {
        wxFetching = false;
        if (wxBtn) wxBtn.disabled = false;
        if (wxStatus) wxStatus.textContent = '更新于 ' + fmtTs(Date.now());
        return;
      }
      var city = queue.shift();
      fetchOneWeather(city, function () { setTimeout(next, WX_INTERVAL); });
    })();
  }

  function initWeather() {
    renderWeatherShell();
    var any = false;
    for (var i = 0; i < PLAN.weather_cities.length; i++) {
      var c = PLAN.weather_cities[i];
      var o = readWxCache(c.adcode);
      if (o) { renderCity(c.adcode, o.data, o.t); any = true; }
    }
    if (wxStatus) {
      wxStatus.textContent = any
        ? (navigator.onLine ? '显示本机缓存 · 联网自动更新中…' : '离线 · 显示本机缓存')
        : (navigator.onLine ? '联网后将自动获取…' : '离线且暂无缓存');
    }
    if (navigator.onLine) {
      setTimeout(function () { if (navigator.onLine) fetchAllWeather(); }, 700);
      window.addEventListener('online', function () {
        setTimeout(function () { if (navigator.onLine) fetchAllWeather(); }, 400);
      });
    }
  }

  /* ================= 6 · 装备与贴士 ================= */
  function renderGear() {
    var g = PLAN.gear;
    var root = $('gear-body');

    var b1 = el('div', 'block');
    b1.appendChild(el('div', 'block-title', '🎒 装备清单'));
    var grid = el('div', 'gear-grid');
    function gearCardStr(icon, name, text) {
      var c = el('div', 'gear-card');
      c.appendChild(el('div', 'sw-name', icon + ' ' + name));
      c.appendChild(el('p', null, text));
      return c;
    }
    function gearCardList(icon, name, arr) {
      var c = el('div', 'gear-card');
      c.appendChild(el('div', 'sw-name', icon + ' ' + name));
      var chips = el('div', 'gear-chips');
      for (var i = 0; i < arr.length; i++) chips.appendChild(el('span', 'chip', arr[i]));
      c.appendChild(chips);
      return c;
    }
    grid.appendChild(gearCardStr('🚲', '车辆与租车', g.bike));
    grid.appendChild(gearCardList('🎒', '必备装备', g.must));
    grid.appendChild(gearCardList('🧴', '途中补给', g.supply));
    grid.appendChild(gearCardList('💊', '医疗包', g.medical));
    grid.appendChild(gearCardStr('👕', '衣物与着装', g.cloth));
    b1.appendChild(grid);
    root.appendChild(b1);

    var b2 = el('div', 'block');
    b2.appendChild(el('div', 'block-title', '🗓 季节与窗口期'));
    var sgrid = el('div', 'season-grid');
    var seasons = [
      ['☀️ 气候', PLAN.season.climate, ''],
      ['🌀 台风季', PLAN.season.typhoon, ''],
      ['🎉 国庆黄金周', PLAN.season.holiday, ''],
      ['🌬 风向', PLAN.season.wind, 's-blue']
    ];
    for (var s = 0; s < seasons.length; s++) {
      var sc = el('div', 'season-card' + (seasons[s][2] ? ' ' + seasons[s][2] : ''));
      sc.appendChild(el('div', 'season-t', seasons[s][0]));
      sc.appendChild(el('p', null, seasons[s][1]));
      sgrid.appendChild(sc);
    }
    b2.appendChild(sgrid);
    root.appendChild(b2);

    var b3 = el('div', 'block');
    b3.appendChild(el('div', 'block-title', '📱 离线使用说明（iPhone）'));
    var u1 = el('div', 'usage-card');
    u1.appendChild(el('div', 'usage-t', '📱 存到 iPhone'));
    u1.appendChild(el('p', null, PLAN.usage.iphone));
    b3.appendChild(u1);
    var u2 = el('div', 'usage-card');
    u2.appendChild(el('div', 'usage-t', '🔌 断网时'));
    u2.appendChild(el('p', null, PLAN.usage.offline));
    b3.appendChild(u2);
    root.appendChild(b3);

    var b4 = el('div', 'block');
    b4.appendChild(el('div', 'block-title', '📞 重要电话'));
    var plist = el('div', 'phone-list');
    for (var p = 0; p < PLAN.phones.length; p++) {
      var ph = PLAN.phones[p];
      var a = el('a', 'phone-item');
      a.href = 'tel:' + ph.num;
      a.appendChild(el('span', 'ph-name', ph.name));
      a.appendChild(el('span', 'ph-num', ph.num));
      plist.appendChild(a);
    }
    b4.appendChild(plist);
    root.appendChild(b4);
  }

  /* ================= 7 · 页脚 ================= */
  function renderFooter() {
    var f = $('footer-body');
    f.appendChild(el('p', null, '轨迹与地图数据 © 高德地图 · 实时天气来自高德天气 API（GCJ-02 坐标系）'));
    f.appendChild(el('p', 'f-key', '🔑 ' + PLAN.meta.key_note));
    f.appendChild(el('p', null, '构建时间：' + (typeof BUILD !== 'undefined' ? BUILD : '—') + ' · 单文件离线版'));
  }

  /* ================= 启动 ================= */
  function init() {
    renderHero();
    initMap();
    renderLegend();
    renderDays();
    renderRobust();
    initWeather();
    renderGear();
    renderFooter();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
