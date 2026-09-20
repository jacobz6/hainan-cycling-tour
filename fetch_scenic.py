#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""景区 POI 检索（经沙箱代理调用高德 text/places）。"""
import json, os, subprocess, time, urllib.parse

KEY = os.environ.get("AMAP_KEY", "")
ROOT = "/workspace/hainan-cycling/data"

def curl_get(params):
    q = f"key={KEY}&source=ts_mcp&" + urllib.parse.urlencode(params)
    time.sleep(0.25)
    p = subprocess.run(["curl","-s","-m","30",f"https://restapi.amap.com/v3/place/text?{q}"],
                       capture_output=True, text=True)
    try: return json.loads(p.stdout)
    except Exception: return {}

# 城市 adcode 用于检索
CITY = {"海口":["海口","460100"],"临高":["临高","469024"],"儋州":["儋州","460400"],
        "东方":["东方","469007"],"乐东":["乐东","469027"],"三亚":["三亚","460200"],
        "陵水":["陵水","469028"],"万宁":["万宁","469006"],"琼海":["琼海","469002"],
        "文昌":["文昌","469005"]}

spots = [
 # 西线
 ("海口骑楼老街","海口"),("假日海滩","海口"),
 ("临高角","临高"),("东坡书院","儋州"),("洋浦千年古盐田","儋州"),
 ("鱼鳞洲","东方"),("莺歌海盐场","乐东"),("龙沐湾","乐东"),
 # 三亚
 ("天涯海角","三亚"),("三亚湾","三亚"),("亚龙湾","三亚"),("南山文化旅游区","三亚"),
 # 东线
 ("分界洲岛","陵水"),("清水湾","陵水"),("石梅湾","万宁"),("日月湾","万宁"),
 ("兴隆热带植物园","万宁"),("博鳌亚洲论坛会址","琼海"),("玉带滩","琼海"),
 ("铜鼓岭","文昌"),("东郊椰林","文昌"),("石头公园","文昌"),("文昌航天发射场","文昌"),
]

out = []
for name,city in spots:
    r = curl_get({"keywords":name,"city":CITY[city][1],"offset":"1"})
    pois = r.get("pois") or []
    if pois:
        p0 = pois[0]
        out.append({"name":name,"city":city,
                    "location":p0.get("location"),# lng,lat
                    "address":p0.get("address"),
                    "type":p0.get("type")})
        print(f"SPOT {name}: {p0.get('location')} | {p0.get('type','')[:30]}")
    else:
        print(f"SPOT {name}: MISS")
with open(os.path.join(ROOT,"scenic.json"),"w",encoding="utf-8") as f:
    json.dump(out,f,ensure_ascii=False,indent=2)
print("total",len(out))