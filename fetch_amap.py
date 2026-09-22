#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2: 环岛旅游公路途经点 POI 定位（逆时针链），落盘 data/geo_v2.json。

用法:
    python3 fetch_amap.py            # 读取 .env 或环境变量 AMAP_KEY
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


# (id, 名称, POI检索词, 城市约束) —— 逆时针（西进东出）顺序
POINTS = [
    ("start",      "CDF免税城·环岛旅游公路零点", "cdf海口国际免税城", "海口"),
    ("yingbin",    "盈滨半岛",     "盈滨半岛",   "澄迈县"),
    ("laocheng",   "老城镇",       "老城镇",     "澄迈县"),
    ("qiaotou",    "桥头镇",       "桥头镇",     "澄迈县"),
    ("linggaojiao","临高角",       "临高角",     "临高县"),
    ("lincheng",   "临高县城·临城镇", "临城镇",   "临高县"),
    ("xinying",    "新盈镇",       "新盈镇",     "临高县"),
    ("eman",       "峨蔓镇",       "峨蔓镇",     "儋州市"),
    ("yantian",    "洋浦千年古盐田", "千年古盐田", "儋州市"),
    ("baimajing",  "白马井镇",     "白马井镇",   "儋州市"),
    ("haitou",     "海头镇",       "海头镇",     "儋州市"),
    ("haiwei",     "海尾镇",       "海尾镇",     "昌江黎族自治县"),
    ("qiziwan",    "棋子湾",       "棋子湾",     "昌江黎族自治县"),
    ("basuo",      "东方市区·八所镇", "八所镇",   "东方市"),
    ("yulinzhou",  "鱼鳞洲",       "鱼鳞洲",     "东方市"),
    ("banqiao",    "板桥镇",       "板桥镇",     "东方市"),
    ("ganen",      "感城镇",       "感城镇",     "东方市"),
    ("yingehai",   "莺歌海盐场",   "莺歌海盐场", "乐东黎族自治县"),
    ("yazhou",     "崖州古城·崖城镇", "崖城镇",   "三亚市"),
    ("nanshan",    "南山文化旅游区", "南山文化旅游区", "三亚市"),
    ("tianya",     "天涯海角",     "天涯海角",   "三亚市"),
    ("sanyawan",   "三亚湾",       "三亚湾",     "三亚市"),
    ("haitang",    "海棠湾",       "海棠湾",     "三亚市"),
    ("lushui",     "陵水县城·椰林镇", "椰林镇",   "陵水黎族自治县"),
    ("riyuewan",   "日月湾",       "日月湾",     "万宁市"),
    ("shimeiwan",  "石梅湾",       "石梅湾",     "万宁市"),
    ("xinglong",   "兴隆镇",       "兴隆镇",     "万宁市"),
    ("shenzhou",   "神州半岛",     "神州半岛",   "万宁市"),
    ("boao",       "博鳌镇",       "博鳌镇",     "琼海市"),
    ("tanmen",     "潭门镇",       "潭门镇",     "琼海市"),
    ("huiwen",     "会文镇",       "会文镇",     "文昌市"),
    ("wencheng",   "文昌文城",     "文城镇",     "文昌市"),
    ("qinglan",    "清澜大桥",     "清澜大桥",   "文昌市"),
    ("dongjiao",   "东郊镇·椰林",  "东郊镇",     "文昌市"),
    ("longlou",    "龙楼镇·铜鼓岭", "龙楼镇",    "文昌市"),
    ("puqian",     "铺前镇",       "铺前镇",     "文昌市"),
    ("haiwenq",   "海文大桥",      "海文大桥",   "海口市"),
    ("yanfeng",    "演丰镇·东寨港", "演丰镇",    "海口市"),
    ("return517",  "517驿站·新埠岛西湾别墅（还车点）", "517户外自行车俱乐部", "海口市"),
    ("airport",    "海口美兰国际机场", "美兰国际机场", "海口市"),
]


def curl_get(path_v3, params, key):
    q = f"key={key}&" + urllib.parse.urlencode(params)
    p = subprocess.run(
        ["curl", "-s", "-m", "40", f"https://restapi.amap.com/v3/{path_v3}?{q}"],
        capture_output=True, text=True,
    )
    try:
        return json.loads(p.stdout)
    except Exception:
        return {"_raw": p.stdout[:300]}


def main():
    os.makedirs(ROOT, exist_ok=True)
    key = load_key()
    out = {}
    for pid, name, kw, city in POINTS:
        r = curl_get("place/text", {
            "keywords": kw, "city": city, "citylimit": "true",
            "offset": 5, "page": 1, "extensions": "base",
        }, key)
        pois = r.get("pois") or []
        rec = {"id": pid, "name": name, "query": kw, "city": city,
               "location": None, "address": None, "poiid": None, "pname": None,
               "candidates": []}
        for p in pois[:3]:
            rec["candidates"].append({
                "name": p.get("name"), "location": p.get("location"),
                "address": (p.get("pname") or "") + (p.get("cityname") or "") + (p.get("adname") or "") + " " + (p.get("address") or ""),
                "id": p.get("id"),
            })
        if pois:
            p0 = pois[0]
            rec.update({
                "location": p0.get("location"),
                "address": (p0.get("pname") or "") + (p0.get("cityname") or "") + (p0.get("adname") or "") + " " + (p0.get("address") or ""),
                "poiid": p0.get("id"),
                "pname": p0.get("pname"),
            })
        out[pid] = rec
        print(f"{pid:12s} {name:28s} -> {rec['location']}  {rec['candidates'][0]['name'] if rec['candidates'] else 'MISS'}")
        time.sleep(0.22)

    with open(os.path.join(ROOT, "geo_v2.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    missing = [pid for pid, r in out.items() if not r["location"]]
    in_hn = [pid for pid, r in out.items()
             if r["location"] and not r["location"].startswith(("108", "109", "110", "111"))]
    print("\nDONE. missing:", missing or "无", " 非海南经度告警:", in_hn or "无")


if __name__ == "__main__":
    main()
