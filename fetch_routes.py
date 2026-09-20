#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""采集骑行路径 / 天气 / 景区 POI（经沙箱代理调用高德 API）。"""
import json, os, subprocess, time, urllib.parse

KEY = os.environ.get("AMAP_KEY", "")
ROOT = "/workspace/hainan-cycling/data"
os.makedirs(ROOT, exist_ok=True)

def curl_get(path_v3, params):
    q = f"key={KEY}&source=ts_mcp&" + urllib.parse.urlencode(params)
    time.sleep(0.25)
    p = subprocess.run(["curl","-s","-m","40",f"https://restapi.amap.com/v3/{path_v3}?{q}"],
                       capture_output=True, text=True)
    try: return json.loads(p.stdout)
    except Exception: return {"_raw": p.stdout[:300]}

def curl_bike(params):
    q = f"key={KEY}&" + urllib.parse.urlencode(params)
    time.sleep(0.25)
    p = subprocess.run(["curl","-s","-m","40",f"https://restapi.amap.com/v4/direction/bicycling?{q}"],
                       capture_output=True, text=True)
    try: return json.loads(p.stdout)
    except Exception: return {"_raw": p.stdout[:300]}

# 路由分段：逆时针，西进东出（海口→临高→儋州→东方→莺歌海→三亚→陵水→万宁→博鳌→文昌→海口站）
segments = [
    ("海口市区","110.200162,20.046316","临高县城","109.690508,19.912025"),
    ("临高县城","109.690508,19.912025","儋州市区","109.580812,19.520948"),
    ("儋州市区","109.580812,19.520948","东方市区","108.651829,19.095187"),
    ("东方市区","108.651829,19.095187","莺歌海镇","108.697398,18.510523"),
    ("莺歌海镇","108.697398,18.510523","三亚市区","109.511709,18.252865"),
    ("三亚市区","109.511709,18.252865","陵水县城","110.037553,18.506045"),
    ("陵水县城","110.037553,18.506045","万宁兴隆","110.392605,18.793697"),
    ("万宁兴隆","110.392605,18.793697","博鳌镇","110.576587,19.159413"),
    ("博鳌镇","110.576587,19.159413","文昌市区","110.797473,19.544234"),
    ("文昌市区","110.797473,19.544234","海口火车站","110.162116,20.027324"),
]

routes = []
for name_o, lnglat_o, name_d, lnglat_d in segments:
    r = curl_bike({"origin":lnglat_o, "destination":lnglat_d})
    pts = []
    dist = dur = None
    paths = ((r.get("data") or {}).get("paths") or [])
    if paths:
        p0 = paths[0]
        dist = p0.get("distance"); dur = p0.get("duration")
        for step in p0.get("steps") or []:
            pl = step.get("polyline") or ""
            for chunk in pl.split(";"):
                if chunk:
                    lng,lat = chunk.split(",")
                    pts.append([float(lng), float(lat)])
    routes.append({"from":name_o,"to":name_d,
                   "distance_km": (int(dist)/1000) if dist else None,
                   "duration_min": (int(dur)/60) if dur else None,
                   "points": pts})
    print(f"ROUTE {name_o}->{name_d}: {dist} m, {dur} s, pts={len(pts)}")
with open(os.path.join(ROOT,"routes.json"),"w",encoding="utf-8") as f:
    json.dump(routes,f,ensure_ascii=False,indent=2)

# 天气（当前）
weather = {}
for name, code in [("海口","460100"),("儋州","460400"),("东方","469007"),
                   ("乐东","469027"),("三亚","460200"),("陵水","469028"),
                   ("万宁","469006"),("琼海","469002"),("文昌","469005")]:
    r = curl_get("weather/weatherInfo", {"city":code})
    info = (r.get("lives") or [{}])[0]
    weather[name] = info
    print("WEATHER", name, info.get("weather"), info.get("temperature"))
with open(os.path.join(ROOT,"weather.json"),"w",encoding="utf-8") as f:
    json.dump(weather,f,ensure_ascii=False,indent=2)