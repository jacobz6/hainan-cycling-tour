#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""采集高德 amap 数据（经沙箱代理），生成 data/ 原始 JSON。"""
import json, os, subprocess, time, urllib.parse

KEY = os.environ.get("AMAP_KEY", "")
ROOT = "/workspace/hainan-cycling/data"
os.makedirs(ROOT, exist_ok=True)

def curl(url):
    time.sleep(0.2)
    p = subprocess.run(["curl", "-s", "-m", "30", url], capture_output=True, text=True)
    try:
        return json.loads(p.stdout)
    except Exception:
        return {"_raw": p.stdout[:400]}

def gw(path, params):
    q = f"key={KEY}&source=ts_mcp&" + urllib.parse.urlencode(params)
    return curl(f"https://restapi.amap.com/v3/{path}?{q}")

def gw_v4(path, params):
    q = f"key={KEY}&" + urllib.parse.urlencode(params)
    return curl(f"https://restapi.amap.com/v4/{path}?{q}")

# 1) 过夜城镇
cities = ["海口市","临高县","儋州市","东方市","乐东黎族自治县莺歌海镇","三亚市",
          "陵水黎族自治县","万宁市","琼海市博鳌镇","文昌市"]
geo = {}
for c in cities:
    r = gw("geocode/geo", {"address": c})
    gc = (r.get("geocodes") or [{}])[0]
    loc = gc.get("location")
    geo[c] = {
        "name": c,
        "location": loc,
        "adcode": gc.get("adcode"),
        "address": gc.get("formatted_address")
    }
    print("GEO", c, loc, gc.get("adcode"))
with open(os.path.join(ROOT, "geo.json"), "w", encoding="utf-8") as f:
    json.dump(geo, f, ensure_ascii=False, indent=2)

# 海口火车站 / 海口美兰机场
r = gw("geocode/geo", {"address": "海口火车站"})
geo["海口火车站"] = {"name":"海口火车站","location":(r.get("geocodes") or [{}])[0].get("location")}
r = gw("geocode/geo", {"address":"海口美兰国际机场"})
geo["海口美兰机场"] = {"name":"海口美兰机场","location":(r.get("geocodes") or [{}])[0].get("location")}
with open(os.path.join(ROOT, "geo.json"), "w", encoding="utf-8") as f:
    json.dump(geo, f, ensure_ascii=False, indent=2)
print("extra:", geo["海口火车站"]["location"], geo["海口美兰机场"]["location"])