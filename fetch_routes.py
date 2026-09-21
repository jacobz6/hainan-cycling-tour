#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2: 沿环岛旅游公路走廊，分段链式采集骑行路径（高德 v4 bicycling）。

依赖: data/geo_v2.json（fetch_amap.py 产物）
输出: data/routes_v2.json —— 按日分组，每段含 distance/duration/polyline
用法: python3 fetch_routes.py
"""
import json
import os
import subprocess
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "data")


def load_key():
    key = os.environ.get("AMAP_KEY", "")
    if key:
        return key
    env_path = os.path.join(HERE, ".env")
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if line.startswith("AMAP_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("缺少 AMAP_KEY：请设置环境变量或在 .env 中配置")


# 日程链（逆时针·西进东出；D6 为三亚休整日）
# 注1: 海文大桥禁行非机动车，收官段绕铺前湾(罗豆/三江)→演丰→东寨港→江东大道→新埠岛
# 注2: D10 必须抵达演丰（距还车点仅 29.5km），保证 D11 10:30 前还车硬时限可达成
DAYS = [
    ("D1",  "9.26 六", ["start", "yingbin", "laocheng", "qiaotou", "linggaojiao", "lincheng"]),
    ("D2",  "9.27 日", ["lincheng", "xinying", "eman", "yantian", "baimajing"]),
    ("D3",  "9.28 一", ["baimajing", "haitou", "haiwei", "qiziwan", "basuo"]),
    ("D4",  "9.29 二", ["basuo", "yulinzhou", "ganen", "banqiao", "yingehai"]),
    ("D5",  "9.30 三", ["yingehai", "yazhou", "nanshan", "tianya", "sanyawan"]),
    ("D6",  "10.1 四", None),   # 三亚休整
    ("D7",  "10.2 五", ["sanyawan", "haitang", "lushui", "riyuewan"]),
    ("D8",  "10.3 六", ["riyuewan", "shimeiwan", "shenzhou", "boao"]),
    ("D9",  "10.4 日", ["boao", "tanmen", "huiwen", "wencheng", "qinglan", "dongjiao", "longlou"]),
    ("D10", "10.5 一", ["longlou", "puqian", "yanfeng"]),
    ("D11", "10.6 二", ["yanfeng", "return517"]),
]

# 额外备选段（Plan B / 赶路用，不属主日程）
EXTRAS = [
    ("pb_d10_direct", ["qinglan", "yanfeng"]),     # D9 落后至清澜: 跳过东郊椰林+铜鼓岭直奔演丰(~115km)
    ("pb_d11_direct", ["puqian", "return517"]),    # D10 落后至铺前: 应急直奔还车点(~70km, 需05:45出发)
]


def curl_bike(params, key, retries=2):
    q = f"key={key}&" + urllib.parse.urlencode(params)
    for i in range(retries + 1):
        p = subprocess.run(
            ["curl", "-s", "-m", "40", f"https://restapi.amap.com/v4/direction/bicycling?{q}"],
            capture_output=True, text=True,
        )
        try:
            r = json.loads(p.stdout)
            paths = ((r.get("data") or {}).get("paths")) or []
            if paths:
                return paths[0]
        except Exception:
            pass
        time.sleep(1.2)
    return None


def seg_points(path):
    pts = []
    for step in path.get("steps") or []:
        pl = step.get("polyline") or ""
        for chunk in pl.split(";"):
            if chunk:
                lng, lat = chunk.split(",")
                pts.append([round(float(lng), 6), round(float(lat), 6)])
    return pts


def main():
    key = load_key()
    with open(os.path.join(ROOT, "geo_v2.json"), encoding="utf-8") as f:
        geo = json.load(f)

    def loc(pid):
        return geo[pid]["location"]

    def name(pid):
        return geo[pid]["name"]

    out_days = []
    total_m = 0
    problems = []
    for day, date, chain in DAYS:
        if chain is None:
            out_days.append({"day": day, "date": date, "type": "rest",
                             "segments": [], "distance_km": 0})
            print(f"{day} {date} 休整日")
            continue
        segments = []
        day_m = 0
        day_pts = []
        for a, b in zip(chain[:-1], chain[1:]):
            path = curl_bike({"origin": loc(a), "destination": loc(b)}, key)
            if not path:
                problems.append(f"{day}: {a}->{b} 采集失败")
                continue
            dist = int(path.get("distance") or 0)
            dur = int(path.get("duration") or 0)
            pts = seg_points(path)
            if not pts:
                problems.append(f"{day}: {a}->{b} 无轨迹")
                continue
            if day_pts and day_pts[-1] == pts[0]:
                pts = pts[1:]
            day_pts.extend(pts)
            day_m += dist
            segments.append({
                "from": a, "to": b, "from_name": name(a), "to_name": name(b),
                "distance_km": round(dist / 1000, 2),
                "duration_min": round(dur / 60, 1),
                "points": pts,
            })
            print(f"  {day} {a}->{b}: {dist/1000:.1f}km")
            time.sleep(0.22)
        total_m += day_m
        out_days.append({
            "day": day, "date": date, "type": "ride",
            "from": chain[0], "to": chain[-1],
            "overnight": name(chain[-1]),
            "distance_km": round(day_m / 1000, 2),
            "segments": segments, "points": day_pts,
        })
        print(f"{day} {date} {name(chain[0])} -> {name(chain[-1])}: {day_m/1000:.1f}km, pts={len(day_pts)}")

    # 备选段
    extras = {}
    for tag, chain in EXTRAS:
        path = curl_bike({"origin": loc(chain[0]), "destination": loc(chain[-1])}, key)
        if path:
            extras[tag] = {
                "from": chain[0], "to": chain[-1],
                "from_name": name(chain[0]), "to_name": name(chain[-1]),
                "distance_km": round(int(path.get("distance") or 0) / 1000, 2),
                "points": seg_points(path),
            }
            print(f"EXTRA {tag}: {extras[tag]['distance_km']}km")
        else:
            problems.append(f"extra {tag} 采集失败")
        time.sleep(0.22)

    with open(os.path.join(ROOT, "routes_v2.json"), "w", encoding="utf-8") as f:
        json.dump({"days": out_days, "extras": extras}, f, ensure_ascii=False)

    print(f"\nTOTAL: {total_m/1000:.1f}km")
    rides = [d["distance_km"] for d in out_days if d["type"] == "ride"]
    print("逐日:", rides)
    bad = [d["day"] for d in out_days if d["type"] == "ride" and not (25 <= d["distance_km"] <= 125)]
    if bad:
        problems.append(f"单日里程超出 25-125km 区间: {bad}")
    print("PROBLEMS:", problems or "无")


if __name__ == "__main__":
    main()
