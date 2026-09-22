#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
assemble.py —— 环海南岛骑行计划 · 单文件离线 HTML 构建脚本

流程：
  1. 读取 template.html / style.css / app.js / vendor/leaflet.{js,css} / data/*.json
  2. 对每日轨迹与备选线做 Douglas-Peucker 抽稀（容差 0.0004 度，纯 Python 迭代实现），
     坐标四舍五入保留 5 位小数
  3. 生成数据注入（const PLAN / ROUTES / COAST / BUILD），把全部资源内联进模板
  4. 产出 index.html，打印输出大小，并校验：
     - 无残留占位符
     - 无外部资源引用（src=/href= 指向 http(s) 的静态引用；
       运行时请求的瓦片 URL / 天气 API / 外链 / tel: 允许出现在 JS 字符串里）
  5. 删除已被取代的 v1 遗留文件 data.js

仅使用 Python 标准库。
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'index.html'
DP_TOL = 0.0004      # Douglas-Peucker 容差（度），约 40 米
NDIGITS = 5          # 坐标四舍五入位数

# Leaflet 默认 attribution 前缀带官网外链（JS 字符串里的 href="https://leafletjs.com"）。
# 页面运行时会用 setPrefix('Leaflet') 覆盖该默认值（见 app.js），
# 这里再把内联副本中的 href 中性化为 "#"，让产物满足“无外部资源引用”的静态检查。
LEAFLET_ATTR_HREF = 'href="https://leafletjs.com"'


def die(msg):
    print('[构建失败] ' + msg)
    sys.exit(1)


def read(p):
    try:
        return Path(p).read_text(encoding='utf-8')
    except OSError as e:
        die('无法读取 %s: %s' % (p, e))


def dp_simplify(points, tol):
    """迭代式 Douglas-Peucker（栈实现，避免 Python 递归深度限制）。

    points: [[lng, lat], ...]，返回抽稀后的新列表。
    """
    n = len(points)
    if n < 3:
        return [list(p) for p in points]
    keep = [False] * n
    keep[0] = keep[n - 1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j - i < 2:
            continue
        ax, ay = points[i]
        bx, by = points[j]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        dmax, kmax = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            if seg2 <= 1e-18:
                dist = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                # 到（端点连线所在直线的）垂距，经典 DP 判据
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                cx, cy = ax + t * dx, ay + t * dy
                dist = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
            if dist > dmax:
                dmax, kmax = dist, k
        if dmax > tol:
            keep[kmax] = True
            stack.append((i, kmax))
            stack.append((kmax, j))
    return [list(points[k]) for k in range(n) if keep[k]]


def round5(points):
    return [[round(p[0], NDIGITS), round(p[1], NDIGITS)] for p in points]


def build_routes(routes):
    """瘦身 ROUTES：只保留 UI 需要的字段（整日轨迹 + 备选线），去掉冗余的 segments.points。

    返回 (新对象, 抽稀前总点数, 抽稀后总点数)。
    """
    n0 = n1 = 0
    days = []
    for d in routes.get('days', []):
        pts = d.get('points') or []
        n0 += len(pts)
        simp = round5(dp_simplify(pts, DP_TOL)) if pts else []
        n1 += len(simp)
        days.append({
            'day': d.get('day'),
            'date': d.get('date'),
            'type': d.get('type'),
            'overnight': d.get('overnight'),
            'distance_km': d.get('distance_km'),
            'points': simp,
        })
    extras = {}
    for key, v in (routes.get('extras') or {}).items():
        pts = v.get('points') or []
        n0 += len(pts)
        simp = round5(dp_simplify(pts, DP_TOL))
        n1 += len(simp)
        extras[key] = {
            'from': v.get('from'),
            'to': v.get('to'),
            'distance_km': v.get('distance_km'),
            'points': simp,
        }
    return {'days': days, 'extras': extras}, n0, n1


def js_const(name, value):
    """序列化为 const 声明；转义 </ 与 U+2028/2029，防止提前闭合 script 标签。"""
    s = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    s = s.replace('</', '<\\/')
    s = s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    return 'const %s = %s;\n' % (name, s)


def main():
    template = read(ROOT / 'template.html')
    style = read(ROOT / 'style.css')
    app = read(ROOT / 'app.js')
    leaf_js = read(ROOT / 'vendor' / 'leaflet.js')
    leaf_css = read(ROOT / 'vendor' / 'leaflet.css')
    plan = json.loads(read(ROOT / 'data' / 'plan_v2.json'))
    routes = json.loads(read(ROOT / 'data' / 'routes_v2.json'))
    coast = json.loads(read(ROOT / 'data' / 'coastline.json'))

    # 轨迹抽稀（每日轨迹 + 备选线）
    routes_slim, n0, n1 = build_routes(routes)

    build_time = datetime.now().strftime('%Y-%m-%d %H:%M')
    data_js = (
        '/* ===== 构建时注入的数据（GCJ-02）===== */\n'
        + js_const('PLAN', plan)
        + js_const('ROUTES', routes_slim)
        + js_const('COAST', coast)
        + js_const('BUILD', build_time)
    )

    # 中和 Leaflet attribution 默认前缀里的官网外链（运行时已被 setPrefix 覆盖）
    if LEAFLET_ATTR_HREF not in leaf_js:
        die('vendor/leaflet.js 中未找到预期的 attribution href（版本变动？）')
    leaf_js = leaf_js.replace(LEAFLET_ATTR_HREF, 'href="#"')

    # 内联全部资源
    html = template
    for ph, content in (
        ('/*__LEAFLET_CSS__*/', leaf_css),
        ('/*__STYLE_CSS__*/', style),
        ('/*__LEAFLET_JS__*/', leaf_js),
        ('/*__DATA__*/', data_js),
        ('/*__APP__*/', app),
    ):
        if ph not in html:
            die('模板中缺少占位符 %s' % ph)
        html = html.replace(ph, content)

    # ---- 校验 1：无残留占位符
    leftover = sorted(set(re.findall(r'__[A-Z][A-Z_]*__', html)))
    if leftover:
        die('存在残留占位符: %s' % leftover)

    # ---- 校验 2：无外部资源引用（允许 JS 字符串里的运行时 URL，此处只查静态属性写法）
    ext_refs = re.findall(r'(?:src|href)\s*=\s*["\']https?://[^"\']*', html)
    if ext_refs:
        die('存在外部资源引用: %s' % ext_refs[:5])

    OUT.write_text(html, encoding='utf-8')
    size = OUT.stat().st_size
    print('[OK] 构建完成: %s' % OUT.name)
    print('     输出大小: %s bytes (%.1f KB)' % (format(size, ','), size / 1024))
    print('     轨迹抽稀: %s -> %s 点 (DP 容差 %s 度, 保留 %d 位小数, 压缩到 %.1f%%)'
          % (format(n0, ','), format(n1, ','), DP_TOL, NDIGITS, n1 * 100.0 / max(n0, 1)))
    if size > 2.5 * 1024 * 1024:
        print('     [警告] 输出超过 2.5MB')
    print('     校验: 无残留占位符 / 无外部资源引用 —— 通过')

    # ---- 删除 v1 遗留 data.js（已被内联数据取代）
    old = ROOT / 'data.js'
    if old.exists():
        old.unlink()
        print('[OK] 已删除旧版遗留文件 data.js')


if __name__ == '__main__':
    main()
