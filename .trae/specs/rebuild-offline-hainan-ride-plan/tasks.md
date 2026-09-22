# Tasks

- [x] Task 1: 数据管线 v2 —— Key 与途经点 POI 采集
  - [x] SubTask 1.1: 建立 `.env`（写入用户高德 key），确认 `.gitignore` 覆盖 `.env`，更新 `.env.example` 说明
  - [x] SubTask 1.2: 重写 `fetch_amap.py`：POI 检索并落盘 `data/geo_v2.json`（40 个途经点全部命中，省份/坐标校验通过）
  - [x] SubTask 1.3: 校验每个 POI 坐标（省份=海南、坐标在岛缘范围内），缺失项人工补坐标
- [x] Task 2: 骑行路径 v2 采集
  - [x] SubTask 2.1: 重写 `fetch_routes.py`（ROOT 相对路径）：分段链式调用 v4 bicycling，落盘 `data/routes_v2.json`（含备选线 pb_d10_direct 61.6km / pb_d11_direct 70.4km）
  - [x] SubTask 2.2: 按日聚合 D1-D11 里程校验：总 995.9km（800-1000 区间内）；逐日 [98.1, 117.9, 119.9, 87.9, 98.9, 0, 120.9, 101.4, 98.3, 123.2, 29.5] 全部落在 25-125km；D10 收官重构为宿演丰（距还车点 29.5km），保证 D11 硬时限
- [x] Task 3: 行程编排数据 v2（依赖 Task 2 的真实里程）
  - [x] SubTask 3.1: `data/plan_v2.json`：D1-D11 逐日（时间线/配速/地形风向/补给食宿/必达+彩蛋/Plan B/闸门），D6 三亚休整、D11 硬时限时间线
  - [x] SubTask 3.2: 健壮性数据：11 档进度闸门表、6 项省里程开关、落后半天/一天追赶方案、止损方案（高铁/拼车/517救援 17789771517）、台风规则
  - [x] SubTask 3.3: 个性化说明：31岁/178cm/87kg/健身篮球基础 → 配速与日里程设定依据（4 条 basis）
- [x] Task 4: 单文件 HTML 构建（离线核心 + 联网增强）
  - [x] SubTask 4.1: `vendor/leaflet.js`+`leaflet.css`（1.9.4，jsdelivr）；`make_coastline.py` → `data/coastline.json`（DataV 460000 省界，主岛 1 环 100 点，DP 0.004°）
  - [x] SubTask 4.2: `template.html`+`style.css`+`app.js`：Hero 硬时限卡/Leaflet 地图（海岸线+逐日轨迹+标记+图例+点日高亮联动+备选线开关）/行程卡片/健壮性/装备/页脚
  - [x] SubTask 4.3: 联网增强：高德实时天气（11 城市，串行 450ms 控 QPS，localStorage 缓存+缓存时间标注，CORS 已实测可行）、"我的位置"（wgs84→gcj02 转换+距今日目标距离）、台风网外链与 tel: 链接；全部失败静默降级
  - [x] SubTask 4.4: `assemble.py`：DP 抽稀 0.0004°+坐标 5 位小数+全资源内联 → `index.html`（277.7KB，无占位符/无外部 script/link）
- [x] Task 5: 验证与收尾（依赖 Task 4）
  - [x] SubTask 5.1: checklist 逐项验证（浏览器实测：零 JS 错误、地图交互联动、行程/健壮性渲染、天气 11/11 城市加载零错误；静态：无外部依赖、277.7KB）
  - [x] SubTask 5.2: `README.md` 更新：单文件说明+iPhone 使用步骤+key 说明与更换+数据重采流程

# Task Dependencies
- Task 1 → Task 2 → Task 3 → Task 4 → Task 5 ✅ 全部完成
