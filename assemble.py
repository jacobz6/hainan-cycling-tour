#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""组装 data.js：行程表 + 节点 + 下采样骑行轨迹 + 景区(含图片 prompt)。"""
import json, os, math

D = "/workspace/hainan-cycling/data"
geo = json.load(open(f"{D}/geo.json", encoding="utf-8"))
routes = json.load(open(f"{D}/routes.json", encoding="utf-8"))
weather = json.load(open(f"{D}/weather.json", encoding="utf-8"))
scenic = json.load(open(f"{D}/scenic.json", encoding="utf-8"))

def topo(nm):
    g = geo.get(nm) or {}
    loc = g.get("location") or ""
    if not loc:
        return None
    lng,lat = loc.split(",")
    return [float(lng), float(lat)]

# 过夜节点（逆时针顺序），含所属骑行日日期
nodes = [
    {"date":"9.26","city":"海口","lnglat":topo("海口市"),"tag":"起点·落地","type":"start","km":0,"day":"D1"},
    {"date":"9.27","city":"临高","lnglat":topo("临高县"),"tag":"过夜","type":"stop","km":76,"day":"D2"},
    {"date":"9.28","city":"儋州","lnglat":topo("儋州市"),"tag":"过夜","type":"stop","km":56,"day":"D3"},
    {"date":"9.29","city":"东方","lnglat":topo("东方市"),"tag":"过夜","type":"stop","km":124,"day":"D4"},
    {"date":"9.30","city":"莺歌海","lnglat":topo("乐东黎族自治县莺歌海镇") or topo("莺歌海镇"),"tag":"过夜","type":"stop","km":75,"day":"D5"},
    {"date":"10.01","city":"三亚","lnglat":topo("三亚市"),"tag":"到达·休整","type":"stop","km":102,"day":"D6"},
    {"date":"10.02","city":"三亚","lnglat":topo("三亚市"),"tag":"休整","type":"rest","km":0,"day":"D7"},
    {"date":"10.03","city":"陵水","lnglat":topo("陵水黎族自治县"),"tag":"过夜","type":"stop","km":75,"day":"D8"},
    {"date":"10.04","city":"万宁·兴隆","lnglat":topo("万宁市"),"tag":"过夜","type":"stop","km":61,"day":"D9"},
    {"date":"10.05","city":"文昌","lnglat":topo("文昌市"),"tag":"过夜","type":"stop","km":121,"day":"D10"},
    {"date":"10.06","city":"海口站","lnglat":topo("海口火车站") or [110.1621,20.0273],"tag":"终点·离岛","type":"end","km":107,"day":"D11"},
]

# 下采样轨迹
def downsample(pts, target=300):
    if len(pts) <= target:
        return pts
    stride = int(math.ceil(len(pts)/target))
    return pts[::stride]

route_segments = []
for r in routes:
    route_segments.append({
        "from": r["from"], "to": r["to"],
        "distance_km": r["distance_km"], "duration_min": r["duration_min"],
        "points": downsample(r["points"]),
    })

# 景区：简介 + 图片 prompt
DESC = {
"海口骑楼老街":"南洋风情骑楼建筑群，百年商埠老街，美食天堂。",
"假日海滩":"海口西海岸滨海浴场，椰风海韵，适合看日落。",
"临高角":"琼州海峡夹角岬角，百年灯塔，解放海南登陆点。",
"东坡书院":"苏东坡贬谪儋州所建教学之地，海南人文渊薮。",
"洋浦千年古盐田":"唐代沿用至今的晒盐场，石槽盐田奇观。",
"鱼鳞洲":"东方海角黑礁石与黄色沙滩，西线经典落日点。",
"莺歌海盐场":"海南四大盐场之一，盐田如镜，日落绝美。",
"龙沐湾":"乐东西端海湾，椰林滨海，人少景美。",
"天涯海角":"三亚地标，天涯石海角石，海天一色。",
"三亚湾":"三亚市区最长海滨走廊，椰梦长廊看日落。",
"亚龙湾":"沙白水清的度假海湾，潜水与沙滩天堂。",
"南山文化旅游区":"南山108米观音像与佛教文化景区，面朝南海。",
"分界洲岛":"陵水海域离岛，海岛潜水与海上游乐胜地。",
"清水湾":"陵水海湾，海沙细腻海水清，冲浪与度假胜地。",
"石梅湾":"万宁青皮林环抱海湾，椰林海岸公路美。",
"日月湾":"冲浪者天堂，浪点稳定，环岛东线网红湾。",
"兴隆热带植物园":"兴隆华侨农场热带植物科普园，雨后下南洋风情。",
"博鳌亚洲论坛会址":"博鳌国际会议中心，亚洲论坛永久会址。",
"玉带滩":"博鳌万泉河入海口的沙洲滩，面朝南海。",
"铜鼓岭":"文昌最高观海点，晴日俯瞰月亮湾与碧海。",
"东郊椰林":"海南最大椰林，十万椰树沿东海岸连绵。",
"石头公园":"文昌龙楼海蚀礁石，海水击礁，壮阔海岸。",
"文昌航天发射场":"中国最新航天发射场，可远眺火箭发射塔。",
}
PROMPT = {
"海口骑楼老街":"海南海口骑楼老街，南洋风格百年骑楼建筑群，暖黄色晚霞下热闹夜市，斑驳外墙与木质窗户，摄影写实",
"假日海滩":"海南海口假日海滩，阳光椰林海水的城市海滨，金色的沙滩与碧蓝大海，夏日度假氛围，写实摄影",
"临高角":"海南临高角岬角海岸，海角塔与灯塔，碧海椰林，波涛拍岸，天朗气清，旅行摄影",
"东坡书院":"海南儋州东坡书院，古色古香庭院，绿树成荫，青瓦白墙，田园氛围，中国古典园林",
"洋浦千年古盐田":"海南洋浦千年古盐田，成排盐石槽中盛着白色盐晶，枯木棕榈，阳光下的晒盐场景，纪实摄影",
"鱼鳞洲":"海南东方鱼鳞洲海岸，黑色礁石与金黄色沙滩，海面碧蓝，落日余晖，风光摄影",
"莺歌海盐场":"海南乐东莺歌海盐场，盐田方格映着天空与落日，镜面倒影，晒盐工人，金色黄昏，风光摄影",
"龙沐湾":"海南乐东龙沐湾，人少的椰林沙滩，海浪与椰影，清澈海水，安静度假感，写实",
"天涯海角":"海南三亚天涯海角，海边巨型礁石，碧海蓝天，椰林与沙滩，标志性景区，旅游摄影",
"三亚湾":"海南三亚湾椰梦长廊，成排椰树沿滨海大道，金色海岸线，日落时分，城市海滨",
"亚龙湾":"海南三亚亚龙湾，月牙形白色沙滩，清澈海水层次分明，高档度假酒店群，航拍感",
"南山文化旅游区":"海南三亚南山，108米海上观音像立于碧海之巅，祥云缭绕，庄严肃穆",
"分界洲岛":"海南陵水分界洲岛，澄澈海水的离岛，码头栈桥与潜水点，热带海岛，清新明快",
"清水湾":"海南陵水清水湾，透蓝海水与细沙浅滩，椰树点缀，休闲度假海湾，写实",
"石梅湾":"海南万宁石梅湾，青皮林环绕的月牙海湾，白色沙滩与碧海，椰树成排，热带海岸",
"日月湾":"海南万宁日月湾，冲浪者踏浪，蔚蓝浪花与沙滩，青年冲浪文化，动感，写实",
"兴隆热带植物园":"海南万宁兴隆热带植物园，热带花木葱郁，芭蕉棕榈，清新雨林步道，生态",
"博鳌亚洲论坛会址":"海南琼海博鳌亚洲论坛国际会议中心，白色现代建筑面朝碧海，玉带滩沙洲，国际化地标",
"玉带滩":"海南博鳌玉带滩，狭长沙洲延伸入海，万泉河入海口，碧海波涛，沙洲分明，航拍感",
"铜鼓岭":"海南文昌铜鼓岭，登顶俯瞰月亮湾与碧蓝大海，山岭植被，壮阔海岸线，风光摄影",
"东郊椰林":"海南文昌东郊椰林，绵延数十万棵椰树沿海岸，阳光透过椰影，绿意盎然",
"石头公园":"海南文昌龙楼石头公园，海蚀花岗岩礁石群，白色浪花拍打黑色礁石，壮丽海岸，风光",
"文昌航天发射场":"海南文昌航天发射场，火箭发射塔架矗立海边，发射台与碧海，未来感，纪实摄影",
}
IMGBASE = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?image_size=landscape_4_3&prompt="
import urllib.parse
scenic_out = []
for s in scenic:
    loc = s.get("location") or ""
    lnglat = [float(v) for v in loc.split(",")] if loc else None
    name = s["name"]
    scenic_out.append({
        "name": name, "city": s["city"], "lnglat": lnglat,
        "desc": DESC.get(name,""),
        "img": IMGBASE + urllib.parse.quote(PROMPT.get(name,"")),
    })

def city_climate():
    cl = {
      "海口":"9-10月平均27-32℃，多阵雨，需防湿热",
      "儋州":"西线偏内陆，午后易闷热，夜间转凉",
      "东方":"半干旱气候，晴天多、日照强，风沙偶见",
      "乐东":"较干热，莺歌海日落时分风大",
      "三亚":"温暖少雨，平均28-32℃，海滨防晒重点",
      "陵水":"东线湿热，午后对流雨较常见",
      "万宁":"雨量偏多，兴隆一带湿度高",
      "琼海":"偏湿热，博鳌临海多风",
      "文昌":"季风明显，偶有台风雨影响",
    }
    return cl

data = {
  "title": "环海南岛骑行 · 逆时针环线（西进东出）",
  "period": "2026.9.26 – 10.06",
  "start": {"name":"海口美兰机场","lnglat":[110.461273,19.942045]},
  "end": {"name":"海口火车站","lnglat":[110.162116,20.027324]},
  "total_km": 797,
  "ride_days": 9,
  "nodes": nodes,
  "routes": route_segments,
  "scenic": scenic_out,
  "weather": {k:{"now":weather.get(k,{}),"season": city_climate().get(k,"")} for k in weather},
}

js = "window.RIDE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",",":")) + ";"
with open("/workspace/hainan-cycling/data.js","w",encoding="utf-8") as f:
    f.write(js)
# 校验
n = sum(len(s["points"]) for s in route_segments)
print("nodes", len(nodes), "segments", len(route_segments), "downsampled_route_pts", n, "scenic", len(scenic_out))
print("total_km", data["total_km"])

# 打印每段 km 用于表中展示
for r in route_segments:
    print(f"  {r['from']} -> {r['to']}: {r['distance_km']}km")