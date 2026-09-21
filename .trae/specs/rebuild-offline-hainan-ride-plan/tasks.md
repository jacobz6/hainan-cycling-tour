# Tasks

- [ ] Task 1: 数据管线 v2 —— Key 与途经点 POI 采集
  - [ ] SubTask 1.1: 建立 `.env`（写入用户高德 key），确认 `.gitignore` 覆盖 `.env`，更新 `.env.example` 说明
  - [ ] SubTask 1.2: 重写 `fetch_amap.py`：POI 检索并落盘 `data/geo_v2.json`，途经链 = CDF免税城零点 → 盈滨/老城 → 桥头 → 临高角 → 临高县城 → 新盈 → 洋浦古盐田 → 白马井 → 海头 → 峨蔓 → 海尾/棋子湾 → 东方八所(鱼鳞洲) → 板桥/感恩 → 莺歌海盐场 → 崖州古城 → 南山 → 天涯海角 → 三亚湾 → 海棠湾 → 陵水 → 日月湾 → 石梅湾 → 兴隆 → 神州半岛 → 博鳌 → 潭门 → 文昌文城 → 清澜/东郊椰林 → 铜鼓岭 → 铺前 → 海文大桥 → 演丰/东寨港 → 新埠岛西湾别墅517驿站 → 美兰机场
  - [ ] SubTask 1.3: 校验每个 POI 坐标（省份=海南、坐标在岛缘范围内），缺失项人工补坐标
- [ ] Task 2: 骑行路径 v2 采集
  - [ ] SubTask 2.1: 重写 `fetch_routes.py`（修复 ROOT 为相对路径 `./data`）：按 Task 1 途经链分段链式调用 v4 bicycling，落盘 `data/routes_v2.json`（每段 from/to/distance/duration/polyline）
  - [ ] SubTask 2.2: 按日聚合成 D1-D11 里程表，总里程与逐日 km 校验（总里程 800-1000km 区间、单日 30-120km；偏离则调换过夜点重采）
- [ ] Task 3: 行程编排数据 v2（依赖 Task 2 的真实里程）
  - [ ] SubTask 3.1: 编写 `data/plan_v2.json`：D1-D11 逐日（日期/星期/路段/里程/预计时长/配速/地形提示/补给/食宿/必达目标/可选彩蛋支线含节省 km/当日 Plan B），含三亚 10.1 完整休整日、D11 硬时限时间线（07:00 出发 → 10:30 前还车 → 打车 → 17:40 航班）
  - [ ] SubTask 3.2: 编写健壮性数据：进度闸门表（每晚最晚位置）、省里程开关清单、追赶合并方案（落后半天/一天）、止损方案（环岛高铁/拼车/517驿站救援电话 0898-66217315）、台风规则
  - [ ] SubTask 3.3: 融入个性化说明：31岁/178cm/87kg/健身篮球基础 → 配速与日里程设定依据
- [ ] Task 4: 单文件离线 HTML（依赖 Task 1-3）
  - [ ] SubTask 4.1: 获取海南海岸线 GeoJSON（构建期一次性下载并抽稀），落盘 `data/coastline.json`
  - [ ] SubTask 4.2: 编写 `template.html` + `style.css` + `app.js`：Hero（关键数字/硬时限卡）、SVG 地图（海岸线 + GCJ02→WGS84 纠偏 + 抽稀后的逐日分段轨迹 + 关键点标记 + 图例 + 点日高亮联动）、每日行程时间线卡片、健壮性模块（闸门/开关/追赶/止损/台风）、装备贴士、季节气候与国庆提示、iPhone 离线使用说明、页脚（高德数据署名、无 key）
  - [ ] SubTask 4.3: 重写 `assemble.py`：将 style/app/plan/routes/coastline 全部内联进模板，坐标纠偏与 Douglas-Peucker 抽稀在构建期完成，产出单文件 `index.html`
- [ ] Task 5: 验证与收尾（依赖 Task 4）
  - [ ] SubTask 5.1: 按 `checklist.md` 逐项验证（零外链、key 零泄漏、离线渲染、地图形状/途经校验、里程一致、闸门时间算术、文件大小 < 1.5MB）
  - [ ] SubTask 5.2: 更新 `README.md`：项目说明改为离线单文件版 + iPhone 传输/打开步骤 + 重新采集数据流程

# Task Dependencies
- Task 1 → Task 2 → Task 3 → Task 4 → Task 5
- SubTask 3.1 可在 Task 2 期间用预估里程先行起草，Task 2 完成后校准定稿
