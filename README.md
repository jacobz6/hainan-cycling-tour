# 环海南岛骑行攻略 · 逆时针环线（西进东出）

一个简约美观的环海南岛自行车骑行攻略单页网站，包含：
- 基于高德地图真实骑行路径的**环岛地图**（Leaflet + OpenStreetMap，GCJ-02→WGS-84 纠偏）
- **逐日行程表**（9.26 落地海口 → 10.6 海口站离岛，含三亚休整）
- 沿线**天气与季节提示**（台风/雨季/防晒）
- **景区图片卡片**（23 个沿线景区）
- 骑行**装备贴士**

## 快速开始

```bash
# 直接用浏览器打开 index.html，或启动本地服务器
python3 -m http.server 8000
# 访问 http://localhost:8000
```

## 目录结构

```
.
├── index.html          # 页面骨架
├── style.css           # 样式（简约海岸风）
├── app.js              # 渲染逻辑 + 地图
├── data.js             # 内联数据（行程/轨迹/景区/天气）
├── data/               # 原始采集数据 JSON（geo/routes/scenic/weather）
├── fetch_amap.py       # 采集过夜城镇坐标
├── fetch_routes.py     # 采集骑行路径 + 天气
├── fetch_scenic.py     # 采集景区 POI
├── assemble.py         # 组装 data.js
└── .env.example        # 高德 API Key 模板
```

## 重新采集数据

```bash
cp .env.example .env   # 填入你的 AMAP_KEY
export AMAP_KEY=你的key
python3 fetch_amap.py
python3 fetch_routes.py
python3 fetch_scenic.py
python3 assemble.py
```

## 数据说明

- 主环线约 **800km**（海口→临高→儋州→东方→莺歌海→三亚→陵水→万宁→博鳌→文昌→海口）
- 含沿海景区支线后全程约 **950–1000km**
- 坐标来源：高德地图开放平台（GCJ-02），前端已转换为 WGS-84 渲染
