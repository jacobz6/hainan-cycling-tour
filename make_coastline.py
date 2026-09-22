#!/usr/bin/env python3
"""构建管线脚本：生成海南岛海岸线简化 GeoJSON（离线地图底图轮廓）。

数据源（按优先级依次尝试本地缓存，均不存在时按序下载）：
  1. 阿里云 DataV 海南省界（省级轮廓，GCJ-02）
     https://geo.datav.aliyun.com/areas_v3/bound/460000.json
  2. 阿里云 DataV 海南市县级（GCJ-02，主岛各县市多边形，不做 dissolve，
     仅作为回退源筛出主岛范围)
     https://geo.datav.aliyun.com/areas_v3/bound/460000_full.json
  3. Natural Earth 10m land（WGS-84，提取包含主岛内部点的多边形）
     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson

处理流程：
  - 提取所有多边形外环（exterior ring）
  - 仅保留与海南主岛范围 (108.5-111.3E, 18.05-20.15N) 相交、
    且整体落在适度扩大范围内的环（剔除三沙远海岛礁、
    雷州半岛/大陆等大范围相邻陆地）
  - 对每个环做 Douglas-Peucker 抽稀，容差 0.004 度（纯 Python 实现）
  - 输出 MultiPolygon，并带 "crs" 字段标注来源坐标系（GCJ02/WGS84）

用法：
  python3 make_coastline.py [--input SRC.geojson] [--crs GCJ02|WGS84]
                            [--output data/coastline.json] [--tolerance 0.004]
"""

import argparse
import json
import os
import sys
import urllib.request

# 海南主岛范围：minLng, maxLng, minLat, maxLat
TARGET_BBOX = (108.5, 111.3, 18.05, 20.15)
# 环整体必须落在的扩大范围（用于剔除大陆等大范围多边形）
MARGIN = 0.6
# Douglas-Peucker 容差（度）
DP_TOLERANCE = 0.004
# 主岛内部一点（Natural Earth 回退时用于定位主岛多边形）
SEED_POINT = (110.0, 19.3)

# (url, 本地缓存路径, 坐标系)
SOURCES = [
    ("https://geo.datav.aliyun.com/areas_v3/bound/460000.json",
     "/tmp/hainan_460000.json", "GCJ02"),
    ("https://geo.datav.aliyun.com/areas_v3/bound/460000_full.json",
     "/tmp/hainan_460000_full.json", "GCJ02"),
    ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson",
     "/tmp/ne10m.json", "WGS84"),
]

OUTPUT_DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "data", "coastline.json")


def iter_exterior_rings(geojson):
    """遍历 GeoJSON 中所有多边形的外环，ring 形如 [[lng, lat], ...]。"""

    def rings_of_geometry(geom):
        if not geom:
            return
        t = geom.get("type")
        if t == "Polygon":
            polys = [geom["coordinates"]]
        elif t == "MultiPolygon":
            polys = geom["coordinates"]
        else:
            return
        for poly in polys:
            if poly and poly[0] and len(poly[0]) >= 4:
                yield poly[0]

    t = geojson.get("type")
    if t == "FeatureCollection":
        for f in geojson.get("features") or []:
            yield from rings_of_geometry(f.get("geometry"))
    elif t == "Feature":
        yield from rings_of_geometry(geojson.get("geometry"))
    else:
        yield from rings_of_geometry(geojson)


def ring_bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def bboxes_intersect(a, b):
    return (a[0] <= b[2] and b[0] <= a[2]
            and a[1] <= b[3] and b[1] <= a[3])


def bbox_within(bb, outer):
    return (bb[0] >= outer[0] and bb[1] >= outer[1]
            and bb[2] <= outer[2] and bb[3] <= outer[3])


def point_in_ring(pt, ring):
    """射线法点在多边形内判断。"""
    x, y = pt
    inside = False
    n = len(ring)
    for i in range(n - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if (y1 > y) != (y2 > y):
            xint = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xint:
                inside = not inside
    return inside


def ring_area(ring):
    """鞋带公式面积（度^2，仅用于排序，主岛在前）。"""
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def _point_seg_dist_sq(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    qx, qy = ax + t * dx, ay + t * dy
    return (px - qx) ** 2 + (py - qy) ** 2


def douglas_peucker(points, tol):
    """迭代式 Douglas-Peucker，首尾点恒保留。"""
    n = len(points)
    if n < 3:
        return list(points)
    tol_sq = tol * tol
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        ax, ay = points[i]
        bx, by = points[j]
        dmax, idx = -1.0, -1
        for k in range(i + 1, j):
            d = _point_seg_dist_sq(points[k][0], points[k][1], ax, ay, bx, by)
            if d > dmax:
                dmax, idx = d, k
        if dmax > tol_sq:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tol):
    """闭合环 DP 抽稀：去相邻重复点、打开闭合、抽稀、重新闭合。"""
    pts = []
    for x, y in ring:
        p = (float(x), float(y))
        if not pts or p != pts[-1]:
            pts.append(p)
    while len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    if len(pts) < 3:
        return None
    simplified = douglas_peucker(pts, tol)
    if len(simplified) < 3:  # 抽稀过度退化时保留原环
        simplified = list(pts)
    simplified.append(simplified[0])
    return simplified


def download(url, dest):
    print(f"下载 {url} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
    with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)


def infer_crs(path):
    name = os.path.basename(path).lower()
    if "ne10m" in name or "ne_" in name or "natural" in name:
        return "WGS84"
    return "GCJ02"


def select_source(args):
    if args.input:
        if not os.path.exists(args.input):
            sys.exit(f"错误：输入文件不存在 {args.input}")
        return args.input, args.crs or infer_crs(args.input)
    for url, local, crs in SOURCES:
        if os.path.exists(local):
            return local, args.crs or crs
    for url, local, crs in SOURCES:
        try:
            download(url, local)
        except Exception as e:
            print(f"下载失败 {url}: {e}", file=sys.stderr)
            continue
        return local, args.crs or crs
    sys.exit("错误：所有数据源均不可用")


def main():
    ap = argparse.ArgumentParser(description="生成海南岛海岸线简化 GeoJSON")
    ap.add_argument("--input", help="输入 GeoJSON（默认自动选择/下载数据源）")
    ap.add_argument("--output", default=OUTPUT_DEFAULT, help="输出路径")
    ap.add_argument("--crs", choices=["GCJ02", "WGS84"],
                    help="来源坐标系（默认按数据源自动推断）")
    ap.add_argument("--tolerance", type=float, default=DP_TOLERANCE,
                    help="Douglas-Peucker 容差（度）")
    args = ap.parse_args()

    src_path, crs = select_source(args)
    with open(src_path, encoding="utf-8") as f:
        geo = json.load(f)

    target = TARGET_BBOX
    expanded = (target[0] - MARGIN, target[1] + MARGIN,
                target[2] - MARGIN, target[3] + MARGIN)

    rings = list(iter_exterior_rings(geo))
    selected = []
    seed_ring = None
    for r in rings:
        bb = ring_bbox(r)
        if (bboxes_intersect(bb, target) and bbox_within(bb, expanded)):
            selected.append(r)
        if seed_ring is None and point_in_ring(SEED_POINT, r):
            seed_ring = r
    if seed_ring is not None and all(seed_ring is not r for r in selected):
        selected.append(seed_ring)

    if not selected:
        sys.exit("错误：未找到海南主岛多边形（检查数据源与筛选范围）")

    selected.sort(key=ring_area, reverse=True)  # 主岛在前

    out_polys = []
    total_pts = 0
    for r in selected:
        s = simplify_ring(r, args.tolerance)
        if not s:
            continue
        out_polys.append([[[round(x, 4), round(y, 4)] for x, y in s]])
        total_pts += len(s)

    if not out_polys:
        sys.exit("错误：抽稀后无有效环")

    result = {"type": "MultiPolygon", "crs": crs, "coordinates": out_polys}
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    all_pts = [p for poly in out_polys for ring in poly for p in ring]
    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    size = os.path.getsize(args.output)
    print(f"数据源: {src_path} (坐标系 {crs})")
    print(f"源外环总数: {len(rings)}，入选环数: {len(out_polys)}")
    print(f"总点数: {total_pts}")
    print(f"bbox: 经度 {min(xs):.4f}-{max(xs):.4f}, "
          f"纬度 {min(ys):.4f}-{max(ys):.4f}")
    print(f"输出: {args.output} ({size} bytes)")
    if size > 200 * 1024:
        print("警告：输出文件超过 200KB", file=sys.stderr)


if __name__ == "__main__":
    main()
