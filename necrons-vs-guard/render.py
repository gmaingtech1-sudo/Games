#!/usr/bin/env python3
"""The Silent Harvest: Necrons vs Imperial Guard.

A short procedural fan animation. Every frame and every sound is generated
by this script (Pillow + NumPy), then encoded with ffmpeg.

    python3 render.py [output.mp4]
"""
import math
import os
import random
import subprocess
import sys
import tempfile
import wave

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 720
FPS = 30
DUR = 44.0
NF = int(DUR * FPS)
DT = 1.0 / FPS
HZ = 410            # horizon line (world y)
BAR = 54            # letterbox bar height
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "necrons-vs-guard.mp4")

R = random.Random(41)
EVENTS = []         # (time, kind, params) for the soundtrack


def ev(t, kind, **kw):
    EVENTS.append((t, kind, kw))


FD = "/usr/share/fonts/truetype/"
F_TITLE = ImageFont.truetype(FD + "dejavu/DejaVuSerif-Bold.ttf", 76)
F_SUB = ImageFont.truetype(FD + "dejavu/DejaVuSans-Bold.ttf", 28)
F_SMALL = ImageFont.truetype(FD + "dejavu/DejaVuSans.ttf", 18)
F_CAP = ImageFont.truetype(FD + "liberation/LiberationSerif-Italic.ttf", 30)
F_LOC = ImageFont.truetype(FD + "dejavu/DejaVuSansMono-Bold.ttf", 18)
F_SHOUT = ImageFont.truetype(FD + "dejavu/DejaVuSerif-Bold.ttf", 70)
F_END = ImageFont.truetype(FD + "liberation/LiberationSerif-Italic.ttf", 38)


def clamp(v, a=0.0, b=1.0):
    return a if v < a else b if v > b else v


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def lerp(a, b, k):
    return a + (b - a) * k


def mix(c1, c2, k):
    return tuple(int(lerp(a, b, k)) for a, b in zip(c1, c2))


def depth_scale(y):
    return 0.42 + (y - HZ) / (H - HZ) * 0.78


# ---------------------------------------------------------------- camera
class Cam:
    cx, cy, z = 640.0, 360.0, 1.0
    shake = 0.0

    def T(self, x, y):
        return ((x - self.cx) * self.z + W / 2, (y - self.cy) * self.z + H / 2)


cam = Cam()
OX, OY = 60, 40            # background margin around the world
BW, BH = W + 2 * OX, H + 2 * OY

CAM_SEGS = [
    (5, 11, (470, 430, 1.45), (860, 415, 1.45)),
    (11, 22, (640, 360, 1.0), (650, 372, 1.07)),
    (22, 28, (520, 420, 1.18), (640, 368, 1.02)),
    (28, 35, (640, 348, 1.0), (655, 352, 1.03)),
]


def set_cam(t):
    for t0, t1, a, b in CAM_SEGS:
        if t0 <= t < t1:
            k = smooth((t - t0) / (t1 - t0))
            cx, cy, z = (lerp(a[i], b[i], k) for i in range(3))
            break
    hw, hh = W / 2 / z, H / 2 / z
    sh = cam.shake
    cx += (math.sin(t * 91.0) + math.sin(t * 57.3)) * sh * 0.5 / z
    cy += (math.sin(t * 77.7) + math.cos(t * 43.1)) * sh * 0.5 / z
    cam.cx = clamp(cx, -OX + hw, W + OX - hw)
    cam.cy = clamp(cy, -OY + hh, H + OY - hh)
    cam.z = z


# ---------------------------------------------------------------- glow layer
class Glow:
    """Half-resolution layer that is blurred and added on top (light)."""

    def __init__(self):
        self.im = Image.new("RGB", (W // 2, H // 2))
        self.d = ImageDraw.Draw(self.im)

    def line(self, pts, col, width):
        self.d.line([(x / 2, y / 2) for x, y in pts], fill=col, width=max(1, int(width / 2)))

    def circle(self, x, y, r, col):
        r = max(0.5, r / 2)
        self.d.ellipse([x / 2 - r, y / 2 - r, x / 2 + r, y / 2 + r], fill=col)

    def ellipse(self, x, y, rx, ry, col):
        self.d.ellipse([x / 2 - rx / 2, y / 2 - ry / 2, x / 2 + rx / 2, y / 2 + ry / 2], fill=col)

    def apply(self, img):
        a = self.im.filter(ImageFilter.GaussianBlur(2.5))
        b = self.im.resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3)).resize((W // 2, H // 2), Image.BILINEAR)
        g = ImageChops.add(a, b).resize((W, H), Image.BILINEAR)
        return ImageChops.add(img, g)


# ---------------------------------------------------------------- background
TOMB_GLYPHS = []
CRATERS_DYN = []


def build_bg():
    rr = np.random.default_rng(7)
    hz = HZ + OY
    ys = np.arange(BH, dtype=np.float32)[:, None]
    img = np.zeros((BH, BW, 3), np.float32)
    k = np.clip(ys / hz, 0, 1) ** 1.7
    img[:] = (np.array([4, 7, 11]) + (np.array([40, 54, 46]) - np.array([4, 7, 11])) * k[..., None])
    g = np.clip((ys - hz) / (BH - hz), 0, 1)
    ground = np.array([50, 47, 40]) + (np.array([20, 18, 16]) - np.array([50, 47, 40])) * g[..., None]
    img = np.where((ys >= hz)[..., None], np.broadcast_to(ground, img.shape), img)
    n = rr.normal(0, 1, (BH // 6, BW // 6))
    n = np.asarray(Image.fromarray(np.clip(n * 40 + 128, 0, 255).astype(np.uint8)).resize((BW, BH), Image.BICUBIC), np.float32) / 255.0
    fine = rr.normal(0, 1, (BH, BW)).astype(np.float32)
    tex = (0.8 + 0.4 * n + 0.05 * fine)[..., None]
    img = np.where((ys >= hz)[..., None], img * tex, img)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im, "RGBA")

    def B(x, y):
        return (x + OX, y + OY)

    # stars
    for _ in range(420):
        x, y = rr.uniform(-OX, W + OX), rr.uniform(-OY, HZ - 40)
        b = int(rr.uniform(60, 230) * (1 - y / HZ * 0.6))
        r = 1.3 if rr.random() < 0.08 else 0.6
        d.ellipse([*B(x - r, y - r), *B(x + r, y + r)], fill=(b, b, min(255, b + 15)))
    # moon + halo
    halo = Image.new("RGB", (BW, BH))
    hd = ImageDraw.Draw(halo)
    mx, my, mr = 250, 105, 52
    hd.ellipse([*B(mx - 110, my - 110), *B(mx + 110, my + 110)], fill=(40, 50, 44))
    im = ImageChops.add(im, halo.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(im, "RGBA")
    d.ellipse([*B(mx - mr, my - mr), *B(mx + mr, my + mr)], fill=(196, 204, 188))
    for _ in range(9):
        cx, cy, cr = mx + rr.uniform(-35, 35), my + rr.uniform(-35, 35), rr.uniform(4, 11)
        if (cx - mx) ** 2 + (cy - my) ** 2 < (mr - cr) ** 2:
            d.ellipse([*B(cx - cr, cy - cr), *B(cx + cr, cy + cr)], fill=(170, 178, 164))
    moon_m = Image.new("L", (BW, BH))
    ImageDraw.Draw(moon_m).ellipse([*B(mx - mr, my - mr), *B(mx + mr, my + mr)], fill=255)
    shad_m = Image.new("L", (BW, BH))
    ImageDraw.Draw(shad_m).ellipse([*B(mx - mr + 18, my - mr - 8), *B(mx + mr + 26, my + mr - 4)], fill=170)
    im.paste((14, 18, 20), (0, 0, BW, BH), ImageChops.multiply(moon_m, shad_m))
    d = ImageDraw.Draw(im, "RGBA")
    # mountains
    pts = [B(-OX, HZ)]
    x = -OX
    while x < W + OX:
        pts.append(B(x, HZ - rr.uniform(8, 40)))
        x += rr.uniform(30, 70)
    pts += [B(W + OX, HZ), B(-OX, HZ)]
    d.polygon(pts, fill=(26, 33, 32))
    # ruined hive city, left
    x = -OX
    while x < 520:
        w = rr.uniform(14, 34)
        h = rr.uniform(30, 160) * (1 - max(0, x) / 620)
        d.rectangle([*B(x, HZ - h), *B(x + w, HZ)], fill=(15, 19, 21))
        if rr.random() < 0.4:
            d.polygon([B(x, HZ - h), B(x + w, HZ - h), B(x + w / 2, HZ - h - rr.uniform(20, 70))], fill=(15, 19, 21))
        if rr.random() < 0.3:   # broken top
            d.polygon([B(x + w * 0.3, HZ - h), B(x + w, HZ - h - 1), B(x + w, HZ - h + 14)], fill=(30, 40, 38))
        for _ in range(int(h / 12)):
            if rr.random() < 0.35:
                wx, wy = x + rr.uniform(3, w - 3), HZ - rr.uniform(5, h - 4)
                d.rectangle([*B(wx, wy), *B(wx + 1.5, wy + 2)], fill=(200, 120, 50, int(rr.uniform(70, 200))))
        x += w + rr.uniform(-4, 8)
    # tomb pyramids, right (stepped)
    for px, hw, ph, tiers in ((1010, 150, 150, 6), (1205, 95, 98, 4)):
        for i in range(tiers):
            y0 = HZ - ph * i / tiers
            y1 = HZ - ph * (i + 1) / tiers + 3
            w0 = hw * (1 - i / tiers)
            w1 = hw * (1 - (i + 0.85) / tiers)
            d.polygon([B(px - w0, y0), B(px + w0, y0), B(px + w1, y1), B(px - w1, y1)], fill=(19, 25, 25))
            d.polygon([B(px, y0), B(px + w0, y0), B(px + w1, y1), B(px, y1)], fill=(27, 35, 34))
            TOMB_GLYPHS.append(((px - w1, y1), (px + w1, y1)))
        TOMB_GLYPHS.append(((px, HZ - 4), (px, HZ - ph + 6)))
        TOMB_GLYPHS.append(((px - hw * 0.55, HZ - 2), (px - hw * 0.15, HZ - ph * 0.55)))
        TOMB_GLYPHS.append(((px + hw * 0.55, HZ - 2), (px + hw * 0.15, HZ - ph * 0.55)))
    # craters & rocks
    for _ in range(28):
        y = rr.uniform(HZ + 15, H + 30)
        s = depth_scale(y)
        x = rr.uniform(-OX, W + OX)
        rx, ry = rr.uniform(20, 55) * s, rr.uniform(5, 12) * s
        d.ellipse([*B(x - rx, y - ry), *B(x + rx, y + ry)], fill=(70, 64, 54, 120))
        d.ellipse([*B(x - rx * 0.85, y - ry * 0.6), *B(x + rx * 0.85, y + ry)], fill=(16, 15, 13, 170))
    for _ in range(90):
        y = rr.uniform(HZ + 4, H + 30)
        s = depth_scale(y)
        x = rr.uniform(-OX, W + OX)
        r = rr.uniform(1, 4) * s
        d.ellipse([*B(x - r, y - r * 0.6), *B(x + r, y + r * 0.6)], fill=(28, 26, 22))
    # ruined walls in no man's land
    for wx, wy, ww, wh in ((560, 468, 70, 42), (690, 560, 60, 30), (470, 640, 90, 36)):
        s = depth_scale(wy)
        pts = [B(wx, wy)]
        for i in range(7):
            pts.append(B(wx + ww * s * i / 6, wy - wh * s * rr.uniform(0.3, 1.0)))
        pts.append(B(wx + ww * s, wy))
        d.polygon(pts, fill=(34, 34, 31))
        d.line([B(wx, wy - 1), B(wx + ww * s, wy - 1)], fill=(20, 19, 17), width=2)
    # barbed wire
    for wy in (480, 575, 670):
        s = depth_scale(wy)
        x0 = 380 + (wy - 480) * 0.15
        for i in range(5):
            px = x0 + i * 22 * s
            d.line([B(px, wy), B(px - 3 * s, wy - 22 * s)], fill=(22, 20, 18), width=max(1, int(2 * s)))
        zz = [B(x0 + j * 5 * s, wy - (16 if j % 2 else 8) * s) for j in range(int(88 / 5) + 1)]
        d.line(zz, fill=(70, 66, 60), width=1)
    # horizon haze
    haze = Image.new("RGBA", (BW, BH), (0, 0, 0, 0))
    hzd = ImageDraw.Draw(haze)
    hzd.rectangle([0, hz - 18, BW, hz + 22], fill=(70, 90, 80, 70))
    haze = haze.filter(ImageFilter.GaussianBlur(14))
    im = Image.alpha_composite(im.convert("RGBA"), haze).convert("RGB")
    return im


# ---------------------------------------------------------------- figures
def mapper(x, y, s, ang=0.0, flip=1):
    ca, sa = math.cos(ang), math.sin(ang)

    def M(lx, ly):
        lx *= flip
        return cam.T(x + (lx * ca - ly * sa) * s, y + (lx * sa + ly * ca) * s)

    return M, s * cam.z


def W_(w, k):
    return max(1, int(round(w * k)))


def draw_guard(d, gl, g):
    M, k = mapper(g.x, g.y, g.s)
    f = g.fk
    coat = mix((80, 86, 58), (170, 255, 190), f)
    coat_d = mix((56, 60, 42), (120, 230, 150), f)
    helm = mix((64, 72, 48), (190, 255, 200), f)
    skin = mix((190, 146, 118), (220, 255, 225), f)
    gun = mix((38, 36, 34), (140, 240, 170), f)
    leg = mix((44, 46, 34), (120, 230, 150), f)
    b = g.recoil
    d.line([M(-5, 0), M(-4, -23)], fill=leg, width=W_(6, k))
    d.line([M(5, 0), M(6, -23)], fill=leg, width=W_(6, k))
    d.polygon([M(-16 - b, -49), M(-9 - b, -49), M(-9 - b, -30), M(-16 - b, -30)], fill=coat_d)   # pack
    d.polygon([M(-12 - b, -12), M(12 - b, -12), M(11 - b, -50), M(-9 - b, -52)], fill=coat)
    d.line([M(-9 - b, -50), M(10 - b, -26)], fill=mix((112, 96, 60), (200, 255, 210), f), width=W_(2, k))
    d.line([M(8 - b, -47), M(22 - b, -41)], fill=coat_d, width=W_(5, k))
    d.line([M(-1 - b, -38), M(38 - b, -44)], fill=gun, width=W_(4, k))
    d.line([M(-4 - b, -36), M(6 - b, -40)], fill=mix((70, 50, 34), (160, 240, 170), f), width=W_(5, k))
    hx, hy = M(3 - b, -58)
    r = 6 * k
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=skin)
    dome = [M(3 - b + math.cos(a) * 8.5, -60 + math.sin(a) * 8.5) for a in np.linspace(math.pi, 2 * math.pi, 9)]
    d.polygon(dome + [M(12 - b, -59), M(-7 - b, -59)], fill=helm)
    d.line([M(-7 - b, -59), M(13 - b, -59)], fill=coat_d, width=W_(2, k))
    if g.flash > 0:
        mx, my = M(39 - b, -44)
        gl.circle(mx, my, 14 * k * g.flash, (255, 90, 40))
        d.ellipse([mx - 3 * k, my - 3 * k, mx + 3 * k, my + 3 * k], fill=(255, 230, 200))
    if f > 0:
        cx, cy = M(0, -35)
        gl.circle(cx, cy, 40 * k * f, (40, 200, 90))


def draw_necron(d, gl, n, t):
    M, k = mapper(n.x, n.y, n.s, n.ang, -1)
    c = n.tint
    metal = mix((150, 158, 150), (140, 255, 170), c)
    dark = mix((40, 46, 44), (60, 200, 110), c)
    hi = mix((212, 220, 210), (220, 255, 230), c)
    sw = math.sin(n.phase) * 0.5 if n.state == "walk" else 0.0
    hip = (0, -40)
    for sg, col in ((-1, dark), (1, metal)):
        a = sg * sw
        knee = (hip[0] + math.sin(a) * 20, hip[1] + math.cos(a) * 20)
        foot = (knee[0] + math.sin(a * 0.5) * 20, knee[1] + math.cos(a * 0.5) * 20)
        d.line([M(*hip), M(*knee), M(*foot)], fill=col, width=W_(3.2, k))
        d.line([M(foot[0] - 2, foot[1]), M(foot[0] + 6, foot[1])], fill=col, width=W_(2.5, k))
    d.polygon([M(-6, -44), M(6, -44), M(4, -37), M(-4, -37)], fill=dark)
    d.line([M(0, -42), M(0, -69)], fill=dark, width=W_(3, k))
    for i in range(4):
        y = -50 - i * 4.5
        d.line([M(-7 + i * 0.5, y), M(8 - i * 0.3, y)], fill=metal, width=W_(1.8, k))
    d.polygon([M(-9, -64), M(10, -64), M(8, -70), M(-8, -70)], fill=metal)
    d.polygon([M(-9, -70), M(-2, -86), M(4, -84), M(-6, -66)], fill=dark)            # hood
    d.line([M(-6, -66), M(4, -56), M(14, -58)], fill=dark, width=W_(2.5, k))           # back arm
    # gauss flayer
    d.polygon([M(-6, -55), M(30, -59), M(43, -61), M(43, -64), M(28, -64), M(-4, -61)], fill=(34, 40, 40))
    d.polygon([M(22, -58), M(38, -57), M(30, -54)], fill=metal)
    tube = [M(2, -63.5), M(30, -65)]
    gcol = mix((70, 230, 120), (200, 255, 210), n.flash)
    d.line(tube, fill=gcol, width=W_(2.2, k))
    if n.state not in ("down", "gone"):
        gl.line(tube, (30, 200, 80), 6 * k)
    d.line([M(8, -66), M(14, -56), M(24, -61)], fill=metal, width=W_(2.6, k))         # front arm
    sx, sy = M(8, -66)
    d.ellipse([sx - 4.5 * k, sy - 4.5 * k, sx + 4.5 * k, sy + 4.5 * k], fill=hi)
    hx, hy = M(3, -76)
    d.ellipse([hx - 6.5 * k, hy - 7.5 * k, hx + 6.5 * k, hy + 7.5 * k], fill=metal)
    d.polygon([M(-1, -71), M(8, -71), M(7, -66), M(0, -66)], fill=metal)
    d.line([M(4, -77), M(9, -77)], fill=(10, 14, 12), width=W_(2.4, k))
    eye = 0.25 if n.state == "down" else 1.0
    ex, ey = M(7, -77)
    d.ellipse([ex - 1.6 * k, ey - 1.2 * k, ex + 1.6 * k, ey + 1.2 * k], fill=mix((40, 120, 60), (190, 255, 200), eye))
    gl.circle(ex, ey, 6 * k * eye, (40, 255, 110))
    if n.flash > 0:
        mx, my = M(44, -62)
        gl.circle(mx, my, 22 * k * n.flash, (60, 255, 120))
    if c > 0.05:
        cx, cy = M(0, -45)
        gl.circle(cx, cy, 34 * k * c, (30, 190, 80))


def draw_tank(d, gl, tk, t):
    M, k = mapper(tk.x, tk.y, tk.s, tk.tilt)
    f = tk.melt
    hull = mix((80, 87, 62), (170, 255, 190), f)
    hull_hi = mix((98, 105, 76), (200, 255, 215), f)
    trk = mix((36, 36, 32), (90, 200, 120), f)
    if tk.state == "wreck":
        hull, hull_hi, trk = (34, 30, 26), (44, 38, 32), (22, 20, 18)
    d.polygon([M(-112, 0), M(102, 0), M(120, -22), M(106, -40), M(-116, -40), M(-126, -20)], fill=trk)
    for i in range(16):
        x = -112 + ((i * 14 + tk.tread) % 224)
        d.line([M(x, -1), M(x + 5, -1)], fill=(60, 60, 54), width=W_(2, k))
    for i in range(8):
        wx, wy = M(-92 + i * 26, -18)
        r = 10 * k
        d.ellipse([wx - r, wy - r, wx + r, wy + r], fill=(50, 50, 46))
        d.ellipse([wx - r * 0.4, wy - r * 0.4, wx + r * 0.4, wy + r * 0.4], fill=(80, 80, 72))
    d.polygon([M(-114, -38), M(108, -38), M(122, -60), M(-98, -72), M(-120, -56)], fill=hull)
    d.polygon([M(70, -42), M(108, -42), M(118, -58), M(78, -62)], fill=hull_hi)
    d.line([M(-110, -50), M(100, -50)], fill=mix((150, 140, 100), (220, 255, 230), f), width=W_(2, k))
    d.polygon([M(-20, -48), M(10, -48), M(8, -36), M(-18, -36)], fill=mix((66, 72, 52), (160, 250, 180), f))   # sponson
    d.line([M(8, -42), M(28, -42)], fill=(30, 30, 28), width=W_(4, k))
    d.line([M(110, -52), M(140, -52)], fill=(30, 30, 28), width=W_(4, k))                   # hull gun
    d.line([M(-96, -70), M(-94, -88)], fill=(36, 34, 30), width=W_(5, k))                   # exhaust
    if tk.state != "wreck":
        rc = tk.recoil
        d.polygon([M(-42, -72), M(46, -72), M(38, -101), M(-32, -105)], fill=hull_hi)
        d.polygon([M(-10, -105), M(14, -104), M(12, -110), M(-8, -111)], fill=hull)          # hatch
        d.line([M(40 - rc, -89), M(150 - rc, -91)], fill=mix((44, 46, 38), (150, 250, 180), f), width=W_(9, k))
        d.polygon([M(146 - rc, -96), M(160 - rc, -96), M(160 - rc, -85), M(146 - rc, -85)], fill=(36, 36, 32))
    else:
        d.polygon([M(-42, -72), M(30, -72), M(20, -84), M(-30, -88)], fill=(30, 27, 24))
    if tk.flash > 0:
        mx, my = M(165 - tk.recoil, -91)
        gl.circle(mx, my, 70 * k * tk.flash, (255, 160, 60))
        d.ellipse([mx - 10 * k * tk.flash, my - 8 * k * tk.flash, mx + 18 * k * tk.flash, my + 8 * k * tk.flash], fill=(255, 240, 200))
    if f > 0:
        cx, cy = M(0, -55)
        gl.ellipse(cx, cy, 260 * k * f, 110 * k * f, (30, 170, 80))


def tank_muzzle(tk):
    return (tk.x + (165 - tk.recoil) * tk.s, tk.y - 91 * tk.s)


# ---------------------------------------------------------------- simulation entities
class Guard:
    def __init__(self, x, y, delay):
        self.x, self.y, self.s = x, y, depth_scale(y)
        self.state = "alive"
        self.cd = delay
        self.flash = 0.0
        self.recoil = 0.0
        self.fk = 0.0
        self.ft = 0.0

    def alive(self):
        return self.state == "alive"


class Necron:
    def __init__(self, x, y, ts):
        self.x, self.y, self.s = x, y, depth_scale(y)
        self.ts = ts
        self.state = "hidden"
        self.timer = 0.0
        self.phase = R.random() * 6.28
        self.cd = R.uniform(1.5, 4.0)
        self.ang = 0.0
        self.tint = 1.0
        self.flash = 0.0
        self.falls = 0
        self.stop_x = R.uniform(560, 650) + (y - HZ) * 0.25

    def standing(self):
        return self.state == "walk"


class Tank:
    def __init__(self):
        self.x, self.y, self.s = -300.0, 508.0, 0.78
        self.state = "off"
        self.tread = 0.0
        self.recoil = 0.0
        self.flash = 0.0
        self.melt = 0.0
        self.tilt = 0.0
        self.shots = [25.0, 26.7]


class P:
    __slots__ = ("x", "y", "vx", "vy", "life", "max", "col", "size", "kind", "grav", "drag", "grow")

    def __init__(self, x, y, vx, vy, life, col, size, kind, grav=0.0, drag=1.0, grow=0.0):
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.life = self.max = life
        self.col, self.size, self.kind = col, size, kind
        self.grav, self.drag, self.grow = grav, drag, grow


class Sim:
    def __init__(self):
        self.guards = []
        rows = [(468, 150, 330, 5), (560, 110, 312, 6), (656, 60, 292, 7)]
        self.walls = []
        for y, x0, x1, n in rows:
            for i in range(n):
                gx = lerp(x0, x1, i / (n - 1)) + R.uniform(-8, 8)
                self.guards.append(Guard(gx, y - 3 + R.uniform(-2, 2), 11.3 + R.uniform(0, 1.2)))
            s = depth_scale(y)
            bags = []
            x = x0 - 30
            while x < x1 + 46 * s:
                for layer in (0, 1):
                    bx = x + (8 * s if layer else 0)
                    by = y + 4 - layer * 10 * s
                    bags.append((bx, by, 12 * s, 6 * s))
                x += 20 * s
            self.walls.append((y + 4, bags))
        self.necrons = []
        spawn = []
        for i in range(12):
            spawn.append((R.uniform(760, 1120), R.uniform(445, 700), 5.6 + i * 0.38 + R.uniform(0, 0.2)))
        for i in range(7):
            spawn.append((R.uniform(900, 1220), R.uniform(445, 700), 14.0 + i * 0.9))
        for i in range(8):
            spawn.append((R.uniform(820, 1200), R.uniform(445, 700), 23.5 + i * 0.7))
        for x, y, ts in spawn:
            self.necrons.append(Necron(x, y, ts))
        self.tank = Tank()
        self.bolts = []      # [x, y, tx, ty, target, speed]
        self.beams = []      # [x0, y0, x1, y1, age, dur, col_core, col_glow, width]
        self.shells = []
        self.parts = []
        self.shocks = []     # [x, y, age, max_r]
        self.flashes = []    # [x, y, r, age, life, col]
        self.ship_y = -320.0
        self.ship_charge = 0.0
        self.ship_beam = 0.0
        self.green_light = 0.0
        self.white = 0.0
        self.flags = set()

    # --- effects
    def sparks(self, x, y, n, col, speed=260, kind="spark", life=0.35, grav=500):
        for _ in range(n):
            a = R.uniform(0, 2 * math.pi)
            v = R.uniform(0.3, 1) * speed
            self.parts.append(P(x, y, math.cos(a) * v, math.sin(a) * v - speed * 0.3, R.uniform(0.5, 1) * life, col, R.uniform(1, 2.2), kind, grav, 0.96))

    def smoke(self, x, y, n, size=20, life=3.0, col=(60, 58, 54), spread=30):
        for _ in range(n):
            self.parts.append(P(x + R.uniform(-spread, spread), y + R.uniform(-spread / 2, spread / 3), R.uniform(-20, 20), R.uniform(-40, -10),
                                R.uniform(0.6, 1) * life, col, R.uniform(0.6, 1.2) * size, "smoke", -6, 0.98, size * 0.45))

    def explosion(self, t, x, y, size=1.0):
        ev(t, "boom", size=size, x=x)
        cam.shake = max(cam.shake, 16 * size)
        self.flashes.append([x, y - 20 * size, 70 * size, 0.0, 0.3, (200, 120, 50)])
        self.shocks.append([x, y, 0.0, 170 * size])
        for _ in range(int(30 * size)):
            a = R.uniform(math.pi, 2 * math.pi)
            v = R.uniform(60, 330) * size
            self.parts.append(P(x, y - 10, math.cos(a) * v, math.sin(a) * v, R.uniform(0.35, 0.9), (230, R.randint(80, 150), 30), R.uniform(5, 11) * size ** 0.6, "fire", 120, 0.93, -8))
        self.sparks(x, y - 10, int(40 * size), (255, 200, 120), 520 * size, life=0.8)
        for _ in range(int(18 * size)):
            a = R.uniform(math.pi * 1.1, math.pi * 1.9)
            v = R.uniform(150, 420) * size
            self.parts.append(P(x, y - 6, math.cos(a) * v, math.sin(a) * v, R.uniform(0.8, 1.5), (30, 26, 22), R.uniform(1.5, 3) * size ** 0.5, "debris", 700, 0.99))
        self.smoke(x, y - 20, int(22 * size), 16 * size ** 0.6, 4.0, spread=45 * size)
        CRATERS_DYN.append((x, y, 70 * size * depth_scale(y), 14 * size * depth_scale(y)))

    def gauss(self, t, x0, y0, x1, y1, dur=0.2, big=False):
        self.beams.append([x0, y0, x1, y1, 0.0, dur, (225, 255, 225), (40, 255, 100), 2.4 if not big else 12])

    def flay(self, t, g):
        g.state = "flay"
        g.ft = 0.0
        ev(t, "flay", x=g.x)

    # --- update
    def step(self, t):
        dt = DT
        battle = t >= 11.3
        alive_guards = [g for g in self.guards if g.alive()]
        # guards
        for g in self.guards:
            g.flash = max(0.0, g.flash - dt * 8)
            g.recoil = max(0.0, g.recoil - dt * 20)
            if g.state == "alive" and battle and t < 34.6:
                g.cd -= dt
                if g.cd <= 0:
                    targets = [n for n in self.necrons if n.state in ("walk", "rise_up")]
                    if targets:
                        n = R.choice(targets)
                        mx, my = g.x + 39 * g.s, g.y - 44 * g.s
                        tx, ty = n.x + R.uniform(-10, 10) * n.s, n.y - R.uniform(30, 75) * n.s
                        self.bolts.append([mx, my, tx, ty, n, 1500.0])
                        g.flash = 1.0
                        g.recoil = 3.0
                        ev(t, "las", x=g.x)
                    g.cd = R.uniform(0.7, 1.7)
            elif g.state == "flay":
                g.ft += dt
                g.fk = clamp(g.ft / 0.35)
                for _ in range(5):
                    lx, ly = R.uniform(-12, 12), R.uniform(-60, 0)
                    self.parts.append(P(g.x + lx * g.s, g.y + ly * g.s, R.uniform(10, 90), R.uniform(-70, 10), R.uniform(0.5, 1.2),
                                        (R.randint(120, 220), 255, R.randint(150, 220)), R.uniform(1, 2.4), "mote", -30, 0.97))
                if g.ft > 0.75:
                    g.state = "gone"
                    self.smoke(g.x, g.y - 30 * g.s, 3, 10, 1.5, (60, 90, 70), 10)
        # lasbolts
        for b in self.bolts[:]:
            dx, dy = b[2] - b[0], b[3] - b[1]
            dist = math.hypot(dx, dy)
            step = b[5] * dt
            if dist <= step:
                self.bolts.remove(b)
                n = b[4]
                if n.state == "walk" and R.random() < 0.13:
                    n.state = "fall"
                    n.timer = 0.0
                    self.sparks(b[2], b[3], 14, (255, 220, 160), 220)
                    ev(t, "clang", x=b[2])
                else:
                    self.sparks(b[2] + R.uniform(-10, 10), b[3] + R.uniform(0, 30), 5, (255, 160, 110), 140, life=0.25)
            else:
                b[0] += dx / dist * step
                b[1] += dy / dist * step
        # necrons
        for n in self.necrons:
            n.flash = max(0.0, n.flash - dt * 5)
            if n.state == "hidden" and t >= n.ts:
                n.state = "rising"
                n.timer = 0.0
                ev(t, "rise", x=n.x)
            elif n.state == "rising":
                n.timer += dt
                n.tint = 1 - smooth(n.timer / 1.4)
                if R.random() < 0.6:
                    self.parts.append(P(n.x + R.uniform(-14, 14) * n.s, n.y, 0, R.uniform(-90, -40), R.uniform(0.4, 0.9), (90, 255, 140), R.uniform(1, 2), "mote", -20, 0.98))
                if n.timer >= 1.4:
                    n.state = "walk"
                    n.tint = 0.0
            elif n.state == "walk":
                if n.x > n.stop_x:
                    n.x -= 11 * n.s * dt
                    n.phase += dt * 3.4
                if battle and t < 34.6:
                    n.cd -= dt
                    if n.cd <= 0:
                        n.cd = R.uniform(2.6, 4.6)
                        live = [g for g in self.guards if g.alive()]
                        if live:
                            g = R.choice(live)
                            M, _ = mapper(n.x, n.y, n.s, 0, -1)
                            x0, y0 = n.x - 44 * n.s, n.y - 62 * n.s
                            hit = R.random() < 0.10
                            tx, ty = g.x + R.uniform(-4, 4) * g.s, g.y - (38 if hit else R.uniform(0, 12)) * g.s
                            if not hit:
                                tx += R.uniform(20, 60) * g.s
                            self.gauss(t, x0, y0, tx, ty)
                            n.flash = 1.0
                            ev(t, "gauss", x=n.x)
                            if hit:
                                self.flay(t, g)
                            else:
                                self.sparks(tx, ty, 10, (120, 255, 160), 180, life=0.3)
            elif n.state == "fall":
                n.timer += dt
                n.ang = 1.45 * smooth(n.timer / 0.35)
                if n.timer >= 0.35:
                    n.state = "down"
                    n.timer = R.uniform(1.4, 2.6)
                    n.falls += 1
                    self.smoke(n.x + 20 * n.s, n.y - 4, 2, 8, 1.2, (70, 66, 60), 8)
            elif n.state == "down":
                n.timer -= dt
                if n.timer <= 0:
                    if R.random() < (0.75 if n.falls == 1 else 0.5):
                        n.state = "rise_up"
                        n.timer = 0.0
                        ev(t, "reanimate", x=n.x)
                        if "reanim_cap" not in self.flags:
                            self.flags.add("reanim_cap")
                            self.reanim_t = t
                    else:
                        n.state = "phase"
                        n.timer = 0.0
                        ev(t, "phase", x=n.x)
            elif n.state == "rise_up":
                n.timer += dt
                k = smooth(n.timer / 0.9)
                n.ang = 1.45 * (1 - k)
                n.tint = 0.7 * math.sin(k * math.pi)
                for _ in range(3):
                    a = R.uniform(0, 2 * math.pi)
                    rad = R.uniform(30, 60) * n.s
                    cx, cy = n.x, n.y - 30 * n.s
                    self.parts.append(P(cx + math.cos(a) * rad, cy + math.sin(a) * rad * 0.6, -math.cos(a) * rad * 2.4, -math.sin(a) * rad * 1.4, 0.4,
                                        (110, 255, 160), 1.6, "mote", 0, 1.0))
                if n.timer >= 0.9:
                    n.state = "walk"
                    n.ang = 0.0
                    n.tint = 0.0
                    n.cd = R.uniform(0.5, 2.0)
            elif n.state == "phase":
                n.timer += dt
                n.tint = smooth(n.timer / 0.4)
                for _ in range(3):
                    self.parts.append(P(n.x + R.uniform(-40, 10) * n.s, n.y - R.uniform(0, 14) * n.s, R.uniform(-10, 10), R.uniform(-120, -50), R.uniform(0.4, 0.8),
                                        (120, 255, 170), R.uniform(1, 2), "mote", 0, 0.98))
                if n.timer >= 0.6:
                    n.state = "gone"
                    self.flashes.append([n.x, n.y - 10 * n.s, 40 * n.s, 0.0, 0.25, (60, 255, 120)])
            elif n.state == "blown":
                n.state = "gone"
        # tank
        tk = self.tank
        tk.flash = max(0.0, tk.flash - dt * 6)
        tk.recoil = max(0.0, tk.recoil - dt * 30)
        if tk.state == "off" and t >= 22.0:
            tk.state = "drive"
            ev(t, "engine")
        if tk.state == "drive":
            k = smooth((t - 22.0) / 2.6)
            nx = lerp(-300, 330, k)
            tk.tread += (nx - tk.x) / tk.s
            tk.x = nx
            if R.random() < 0.5:
                self.smoke(tk.x - 94 * tk.s, tk.y - 90 * tk.s, 1, 8, 1.5, (50, 48, 46), 2)
            if R.random() < 0.6:
                self.smoke(tk.x - 100 * tk.s, tk.y, 1, 12, 1.2, (80, 72, 60), 6)
            if k >= 1:
                tk.state = "idle"
        if tk.state in ("drive", "idle"):
            for st in tk.shots[:]:
                if t >= st:
                    tk.shots.remove(st)
                    standing = [n for n in self.necrons if n.state in ("walk", "rising", "rise_up", "down", "fall")]
                    if standing:
                        best = max(standing, key=lambda n: sum(1 for m in standing if abs(m.x - n.x) < 90 and abs(m.y - n.y) < 50))
                        tx, ty = best.x + 10, best.y + 4
                    else:
                        tx, ty = 900, 560
                    mx, my = tank_muzzle(tk)
                    self.shells.append([mx, my, tx, ty])
                    tk.flash = 1.0
                    tk.recoil = 14
                    cam.shake = max(cam.shake, 8)
                    ev(t, "cannon")
                    self.smoke(mx, my, 5, 16, 2.0, (90, 86, 80), 8)
        if tk.state == "melt":
            tk.melt = clamp(tk.melt + dt / 0.75)
        # shells
        for s in self.shells[:]:
            dx, dy = s[2] - s[0], s[3] - s[1]
            dist = math.hypot(dx, dy)
            stp = 2800 * dt
            if dist <= stp:
                self.shells.remove(s)
                self.explosion(t, s[2], s[3], 1.15)
                for n in self.necrons:
                    if n.state in ("walk", "rising", "rise_up", "down", "fall") and ((n.x - s[2]) / 110) ** 2 + ((n.y - s[3]) / 55) ** 2 < 1:
                        n.state = "blown"
                        for _ in range(10):
                            a = R.uniform(math.pi * 1.05, math.pi * 1.95)
                            v = R.uniform(150, 380)
                            self.parts.append(P(n.x, n.y - 40 * n.s, math.cos(a) * v, math.sin(a) * v, R.uniform(0.9, 1.5), (150, 158, 150), R.uniform(1.5, 3.5) * n.s, "debris", 700, 0.99))
                        self.sparks(n.x, n.y - 40 * n.s, 8, (110, 255, 160), 200, life=0.5, kind="mote")
            else:
                s[0] += dx / dist * stp
                s[1] += dy / dist * stp
        # the pyramid ship
        if t >= 28.0:
            k = smooth((t - 28.0) / 3.6)
            self.ship_y = lerp(-320, 62, k)
            self.green_light = 0.5 * k
            if "ship" not in self.flags:
                self.flags.add("ship")
                ev(t, "ship")
            if 29.2 < t < 32.4 and R.random() < 0.10:
                self.ship_arc(t)
        if 31.6 <= t < 32.7:
            self.ship_charge = smooth((t - 31.6) / 1.1)
            if "charge" not in self.flags:
                self.flags.add("charge")
                ev(t, "charge")
        if 32.7 <= t < 33.8:
            if "beam" not in self.flags:
                self.flags.add("beam")
                ev(t, "beam")
                tk.state = "melt"
            self.ship_beam = 1.0 if t < 33.5 else 1 - (t - 33.5) / 0.3
            self.ship_charge = 1.0 - smooth((t - 32.7) / 1.0) * 0.7
            cam.shake = max(cam.shake, 6)
            self.green_light = 0.5 + 0.5 * self.ship_beam
            if R.random() < 0.7:
                self.smoke(tk.x, tk.y - 40 * tk.s, 1, 18, 1.5, (60, 120, 80), 50)
        elif t >= 33.8:
            self.ship_beam = 0.0
            self.green_light = max(0.5, self.green_light - dt)
        if t >= 33.45 and "tankboom" not in self.flags:
            self.flags.add("tankboom")
            tk.state = "wreck"
            tk.melt = 0.0
            tk.tilt = -0.04
            self.explosion(t, tk.x + 10, tk.y - 5, 2.4)
            self.white = 1.0
            ev(t, "bigboom")
            for g in self.guards:
                if g.alive() and abs(g.x - tk.x) < 120 and abs(g.y - tk.y) < 60:
                    self.flay(t, g)
        if tk.state == "wreck" and R.random() < 0.8:
            self.parts.append(P(tk.x + R.uniform(-60, 60) * tk.s, tk.y - R.uniform(30, 80) * tk.s, R.uniform(-10, 10), R.uniform(-90, -40), R.uniform(0.3, 0.7),
                                (255, R.randint(100, 170), 40), R.uniform(5, 12), "fire", -30, 0.97, -8))
            if R.random() < 0.4:
                self.smoke(tk.x, tk.y - 80 * tk.s, 1, 26, 3.5, (40, 38, 36), 30)
        self.white = max(0.0, self.white - dt * 1.6)
        # beams, flashes, shocks, particles
        for b in self.beams[:]:
            b[4] += dt
            if b[4] > b[5]:
                self.beams.remove(b)
        for f in self.flashes[:]:
            f[3] += dt
            if f[3] > f[4]:
                self.flashes.remove(f)
        for s in self.shocks[:]:
            s[2] += dt
            if s[2] > 0.5:
                self.shocks.remove(s)
        for p in self.parts[:]:
            p.life -= dt
            if p.life <= 0:
                self.parts.remove(p)
                continue
            p.vx *= p.drag
            p.vy = p.vy * p.drag + p.grav * dt
            p.x += p.vx * dt
            p.y += p.vy * dt
            p.size = max(0.3, p.size + p.grow * dt)
            if p.kind == "debris" and p.y > HZ + 30 and p.vy > 0 and R.random() < 0.15:
                p.vy *= -0.3
        cam.shake *= 0.88

    def ship_pts(self):
        cx, ay = 1010.0, self.ship_y
        return (cx, ay), (cx - 175, ay + 230), (cx + 20, ay + 255), (cx + 175, ay + 228)

    def ship_arc(self, t):
        A, BL, F, BR = self.ship_pts()
        live = [g for g in self.guards if g.alive()]
        if R.random() < 0.35 and live and "arckill" not in self.flags:
            g = R.choice(live)
            tx, ty = g.x, g.y - 30 * g.s
            self.flags.add("arckill")
            self.flay(t, g)
        else:
            tx, ty = R.uniform(500, 1200), R.uniform(450, 690)
            self.sparks(tx, ty, 10, (120, 255, 170), 200, life=0.4)
        k = R.random()
        sx, sy = lerp(BL[0], F[0], k), lerp(BL[1], F[1], k)
        self.beams.append([sx, sy, tx, ty, 0.0, 0.22, (230, 255, 235), (50, 255, 120), 3])
        ev(t, "arc")


# ---------------------------------------------------------------- render: battle
def jag(x0, y0, x1, y1, n, amp):
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    px, py = -dy / L, dx / L
    pts = []
    for i in range(n + 1):
        k = i / n
        o = 0 if i in (0, n) else R.uniform(-amp, amp)
        pts.append((x0 + dx * k + px * o, y0 + dy * k + py * o))
    return pts


def draw_ship(d, gl, sim, t):
    if sim.ship_y < -300:
        return
    A, BL, F, BR = (cam.T(*p) for p in sim.ship_pts())
    z = cam.z
    gl.ellipse(F[0], F[1] + 6 * z, 260 * z, 50 * z, (8, 60, 28))
    d.polygon([A, BL, F], fill=(16, 21, 22))
    d.polygon([A, F, BR], fill=(30, 38, 38))
    pulse = 0.6 + 0.4 * math.sin(t * 4)
    for kk in (0.32, 0.52, 0.72, 0.9):
        p1 = (lerp(A[0], BL[0], kk), lerp(A[1], BL[1], kk))
        p2 = (lerp(A[0], F[0], kk), lerp(A[1], F[1], kk))
        p3 = (lerp(A[0], BR[0], kk), lerp(A[1], BR[1], kk))
        d.line([p1, p2, p3], fill=(36, 70, 52), width=max(1, int(2 * z)))
    for kk in (0.25, 0.5, 0.75):
        top = (lerp(A[0], F[0], 0.18), lerp(A[1], F[1], 0.18))
        b1 = (lerp(BL[0], F[0], kk), lerp(BL[1], F[1], kk))
        b2 = (lerp(F[0], BR[0], kk), lerp(F[1], BR[1], kk))
        for b in (b1, b2):
            mid = (lerp(top[0], b[0], 0.55), lerp(top[1], b[1], 0.55))
            col = mix((30, 120, 70), (90, 255, 150), pulse)
            d.line([mid, b], fill=col, width=max(1, int(2 * z)))
            gl.line([mid, b], (20, int(170 * pulse), 70), 6 * z)
    for e in ((A, BL), (A, F), (A, BR)):
        d.line(e, fill=(70, 90, 84), width=max(1, int(2 * z)))
    if R.random() < 0.35:
        e = R.choice(((A, BL), (A, BR), (BL, F), (F, BR)))
        k0 = R.random()
        k1 = clamp(k0 + R.uniform(0.1, 0.3))
        p0 = (lerp(e[0][0], e[1][0], k0), lerp(e[0][1], e[1][1], k0))
        p1 = (lerp(e[0][0], e[1][0], k1), lerp(e[0][1], e[1][1], k1))
        pts = jag(*p0, *p1, 6, 9 * z)
        d.line(pts, fill=(210, 255, 220), width=max(1, int(1.5 * z)))
        gl.line(pts, (50, 255, 120), 8 * z)
    orb = 14 + 30 * sim.ship_charge
    ox, oy = A[0], A[1] + 36 * z
    gl.circle(ox, oy, (orb * 1.8 + 6 * math.sin(t * 30)) * z, (30, 200, 90))
    d.ellipse([ox - orb * 0.45 * z, oy - orb * 0.45 * z, ox + orb * 0.45 * z, oy + orb * 0.45 * z], fill=(220, 255, 230))
    if sim.ship_beam > 0:
        tk = sim.tank
        tx, ty = cam.T(tk.x, tk.y - 50 * tk.s)
        bw = sim.ship_beam
        for i in range(2):
            pts = jag(ox, oy, tx, ty, 10, 10 * z)
            gl.line(pts, (30, 170, 80), 40 * z * bw)
        d.line([(ox, oy), (tx, ty)], fill=(150, 255, 180), width=max(1, int(18 * z * bw)))
        d.line([(ox, oy), (tx, ty)], fill=(240, 255, 245), width=max(1, int(7 * z * bw)))
        gl.circle(tx, ty, 90 * z * bw, (40, 200, 90))


def render_battle(sim, t, bg):
    set_cam(t)
    z = cam.z
    hw, hh = W / 2 / z, H / 2 / z
    box = (cam.cx - hw + OX, cam.cy - hh + OY, cam.cx + hw + OX, cam.cy + hh + OY)
    img = bg.resize((W, H), Image.BILINEAR, box=box)
    d = ImageDraw.Draw(img, "RGBA")
    gl = Glow()
    # tombs waking
    wake = smooth((t - 5.6) / 3.0)
    if wake > 0:
        pulse = 0.75 + 0.25 * math.sin(t * 2.2)
        for i, (p0, p1) in enumerate(TOMB_GLYPHS):
            a, b = cam.T(*p0), cam.T(*p1)
            fl = pulse * wake * (0.7 + 0.3 * math.sin(t * 5 + i))
            d.line([a, b], fill=mix((26, 34, 33), (120, 255, 160), fl), width=max(1, int(1.5 * z)))
            gl.line([a, b], (int(20 * fl), int(200 * fl), int(80 * fl)), 7 * z)
        px, py = cam.T(1010, HZ - 150)
        gl.circle(px, py, 30 * z * wake * pulse, (40, 230, 100))
    draw_ship(d, gl, sim, t)
    for x, y, rx, ry in CRATERS_DYN:
        cx, cy = cam.T(x, y)
        d.ellipse([cx - rx * z, cy - ry * z, cx + rx * z, cy + ry * z], fill=(14, 12, 10, 200))
    # ground units, painter's order
    items = []
    for g in sim.guards:
        if g.state != "gone":
            items.append((g.y, 0, g))
    for n in sim.necrons:
        if n.state not in ("hidden", "gone", "blown"):
            items.append((n.y, 1, n))
    if sim.tank.state != "off":
        items.append((sim.tank.y, 2, sim.tank))
    for wy, bags in sim.walls:
        items.append((wy, 3, bags))
    items.sort(key=lambda it: (it[0], it[1]))
    for _, kind, o in items:
        if kind == 0:
            draw_guard(d, gl, o)
        elif kind == 1:
            if o.state == "rising":
                fx, fy = cam.T(o.x, o.y)
                k = o.s * z
                a = 1 - o.timer / 1.4
                gl.ellipse(fx, fy, 70 * k, 18 * k, (int(30 * a), int(200 * a), int(80 * a)))
                gl.line([(fx, fy), (fx, fy - 140 * k)], (int(14 * a), int(170 * a), int(60 * a)), 22 * k)
                d.ellipse([fx - 22 * k, fy - 5 * k, fx + 22 * k, fy + 5 * k], fill=(120, 255, 170, int(160 * a)))
                if R.random() < 0.15 * a:
                    continue
            if o.state == "phase" and R.random() < o.tint * 0.6:
                continue
            draw_necron(d, gl, o, t)
        elif kind == 2:
            draw_tank(d, gl, o, t)
        else:
            for bx, by, rx, ry in o:
                cx, cy = cam.T(bx, by)
                d.ellipse([cx - rx * z, cy - ry * z, cx + rx * z, cy + ry * z], fill=(94, 84, 62), outline=(56, 50, 38))
    # projectiles
    for b in sim.bolts:
        dx, dy = b[2] - b[0], b[3] - b[1]
        L = math.hypot(dx, dy) or 1
        p0 = cam.T(b[0], b[1])
        p1 = cam.T(b[0] - dx / L * 28, b[1] - dy / L * 28)
        d.line([p0, p1], fill=(255, 210, 190), width=max(1, int(2 * z)))
        gl.line([p0, p1], (255, 40, 30), 9 * z)
    for s in sim.shells:
        dx, dy = s[2] - s[0], s[3] - s[1]
        L = math.hypot(dx, dy) or 1
        p0 = cam.T(s[0], s[1])
        p1 = cam.T(s[0] - dx / L * 60, s[1] - dy / L * 60)
        d.line([p0, p1], fill=(255, 240, 200), width=max(1, int(3 * z)))
        gl.line([p0, p1], (255, 150, 50), 14 * z)
    for b in sim.beams:
        k = 1 - b[4] / b[5]
        pts = [cam.T(x, y) for x, y in jag(b[0], b[1], b[2], b[3], 9, 5 + b[8])]
        gl.line(pts, tuple(int(c * k) for c in b[7]), (8 + b[8] * 3) * z)
        d.line(pts, fill=b[6], width=max(1, int(b[8] * z * (0.5 + 0.5 * k))))
        ex, ey = cam.T(b[2], b[3])
        gl.circle(ex, ey, 18 * z * k, b[7])
    # particles
    for p in sim.parts:
        x, y = cam.T(p.x, p.y)
        k = p.life / p.max
        r = p.size * z
        if p.kind == "smoke":
            a = int(80 * k * min(1, (1 - k) * 6))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(*p.col, a))
        elif p.kind == "fire":
            gl.circle(x, y, r * 1.8, tuple(int(c * k) for c in p.col))
            d.ellipse([x - r * 0.5, y - r * 0.5, x + r * 0.5, y + r * 0.5], fill=(255, 230, 170, int(220 * k)))
        elif p.kind == "spark":
            x2, y2 = cam.T(p.x - p.vx * 0.025, p.y - p.vy * 0.025)
            d.line([(x, y), (x2, y2)], fill=(*p.col, int(255 * k)), width=max(1, int(r * 0.8)))
            gl.line([(x, y), (x2, y2)], tuple(int(c * k * 0.6) for c in p.col), 4 * z)
        elif p.kind == "mote":
            d.ellipse([x - r * 0.6, y - r * 0.6, x + r * 0.6, y + r * 0.6], fill=(*p.col, int(255 * k)))
            gl.circle(x, y, r * 3, tuple(int(c * k * 0.7) for c in p.col))
        elif p.kind == "debris":
            d.rectangle([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=p.col)
    for f in sim.flashes:
        k = 1 - f[3] / f[4]
        x, y = cam.T(f[0], f[1])
        gl.circle(x, y, f[2] * z * (0.6 + 0.4 * k), tuple(int(c * k) for c in f[5]))
    for s in sim.shocks:
        k = s[2] / 0.5
        x, y = cam.T(s[0], s[1])
        rx, ry = s[3] * z * k, s[3] * z * k * 0.28
        d.ellipse([x - rx, y - ry, x + rx, y + ry], outline=(255, 230, 190, int(200 * (1 - k))), width=max(1, int(4 * z)))
    img = gl.apply(img)
    if sim.green_light > 0:
        img = ImageChops.add(img, Image.new("RGB", (W, H), (0, int(26 * sim.green_light), int(12 * sim.green_light))))
    if sim.white > 0:
        img = Image.blend(img, Image.new("RGB", (W, H), (235, 255, 240)), clamp(sim.white) * 0.9)
    return img


# ---------------------------------------------------------------- render: title
STARS = [(R.uniform(0, W), R.uniform(0, H), R.uniform(0.3, 1), R.uniform(0, 6.28)) for _ in range(500)]
LIGHTS = [(R.uniform(-0.7, 0.3), R.uniform(0.02, 0.2), R.uniform(0, 6.28)) for _ in range(60)]


def text_c(d, xy, s, font, col, alpha=255, shadow=True):
    if shadow:
        d.text((xy[0] + 3, xy[1] + 3), s, font=font, fill=(0, 0, 0, int(alpha * 0.8)), anchor="mm")
    d.text(xy, s, font=font, fill=(*col, int(alpha)), anchor="mm")


def render_title(t):
    img = Image.new("RGB", (W, H), (2, 4, 6))
    d = ImageDraw.Draw(img, "RGBA")
    gl = Glow()
    for x, y, b, ph in STARS:
        x = (x - t * 6 * b) % W
        v = int(200 * b * (0.7 + 0.3 * math.sin(t * 3 + ph)))
        d.point((x, y), fill=(v, v, min(255, v + 20)))
    pcx, pcy, pr = 640, 1480 - t * 18, 1000
    d.ellipse([pcx - pr, pcy - pr, pcx + pr, pcy + pr], fill=(10, 14, 14))
    gl.d.arc([(pcx - pr) / 2, (pcy - pr) / 2, (pcx + pr) / 2, (pcy + pr) / 2], 200, 340, fill=(140, 90, 40), width=3)
    for ax, ay, ph in LIGHTS:
        ang = -math.pi / 2 + ax
        rr = pr * (1 - ay * 0.4)
        x, y = pcx + math.cos(ang) * rr, pcy + math.sin(ang) * rr
        on = smooth((t - 0.8 - ph * 0.3) / 0.6)
        if on > 0 and y < H:
            fl = on * (0.6 + 0.4 * math.sin(t * 6 + ph * 3))
            gl.circle(x, y, 6 * fl, (30, int(255 * fl), 100))
            d.point((x, y), fill=(160, 255, 190))
    img = gl.apply(img)
    d = ImageDraw.Draw(img, "RGBA")
    a = smooth((t - 1.0) / 1.2) * (1 - smooth((t - 4.4) / 0.5))
    text_c(d, (W / 2, 300 - (1 - a) * 10), "THE SILENT HARVEST", F_TITLE, (225, 228, 218), 255 * a)
    b = smooth((t - 2.0) / 1.0) * (1 - smooth((t - 4.4) / 0.5))
    text_c(d, (W / 2, 380), "NECRONS   vs   IMPERIAL GUARD", F_SUB, (110, 240, 150), 255 * b)
    d.line([(W / 2 - 260 * b, 345), (W / 2 + 260 * b, 345)], fill=(120, 110, 80, int(200 * b)), width=1)
    return img


# ---------------------------------------------------------------- render: close-up
def build_closeup_bg():
    img = np.zeros((H, W, 3), np.float32)
    ys = np.arange(H, dtype=np.float32)[:, None]
    xs = np.arange(W, dtype=np.float32)[None, :]
    k = np.clip(ys / 540, 0, 1)
    img[:] = (np.array([3, 6, 6]) + (np.array([18, 52, 34]) - np.array([3, 6, 6])) * (k ** 1.5)[..., None])
    glow = np.exp(-(((xs - 1050) / 380) ** 2 + ((ys - 170) / 260) ** 2))
    img += glow[..., None] * np.array([20, 110, 60])
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    rr = random.Random(3)
    pts = [(0, 540)]
    for x in range(0, W + 40, 40):
        pts.append((x, 540 - rr.uniform(0, 18)))
    pts += [(W, H), (0, H)]
    d.polygon(pts, fill=(20, 28, 24))
    x = 0
    while x < 420:
        w, h = rr.uniform(16, 36), rr.uniform(30, 120) * (1 - x / 500)
        d.rectangle([x, 540 - h, x + w, 545], fill=(10, 14, 13))
        x += w + rr.uniform(0, 10)
    d.polygon([(0, 610), (260, 640), (700, 668), (1000, 650), (1280, 625), (1280, 720), (0, 720)], fill=(9, 11, 10))
    return im


def silhouette_guard(d, x, y, s, ph, rim):
    def M(lx, ly):
        return (x + lx * s, y + ly * s)
    a = math.sin(ph) * 0.7
    dark = (12, 14, 13)
    for sg in (-1, 1):
        aa = sg * a
        knee = (math.sin(aa) * 20, -40 + math.cos(aa) * 20)
        foot = (knee[0] + math.sin(aa - 0.5) * 20, knee[1] + math.cos(aa - 0.5) * 20)
        d.line([M(0, -40), M(*knee), M(*foot)], fill=dark, width=max(1, int(7 * s)))
    body = [M(-11, -38), M(12, -38), M(16, -76), M(-6, -80)]
    d.polygon([(px + 2 * s, py) for px, py in body], fill=rim)
    d.polygon(body, fill=dark)
    d.ellipse([*M(4, -94), *M(20, -78)], fill=dark)
    d.polygon([M(2, -88), M(22, -88), M(14, -98), M(4, -97)], fill=dark)
    d.line([M(-2, -62), M(48, -74)], fill=dark, width=max(1, int(4 * s)))
    d.line([M(48, -74), M(58, -76)], fill=(150, 160, 160), width=max(1, int(2 * s)))


def render_closeup(t, cbg, state):
    lt = t - 35.0
    img = cbg.copy()
    d = ImageDraw.Draw(img, "RGBA")
    gl = Glow()
    # ship in the sky
    sx, sy = 1050, 70 + math.sin(lt) * 4
    d.polygon([(sx, sy), (sx - 150, sy + 190), (sx + 15, sy + 205)], fill=(12, 18, 18))
    d.polygon([(sx, sy), (sx + 15, sy + 205), (sx + 150, sy + 188)], fill=(22, 30, 30))
    gl.circle(sx, sy + 30, 44 + 8 * math.sin(t * 20), (30, 200, 90))
    gl.ellipse(sx + 10, sy + 205, 260, 40, (10, 80, 40))
    # distant necron host
    for i, (nx, ny, nph) in enumerate(state["host"]):
        x = nx - lt * 14
        s = 0.45 + (ny - 520) / 120 * 0.3
        d.line([(x, ny), (x, ny - 34 * s)], fill=(8, 12, 10), width=max(1, int(4 * s)))
        d.ellipse([x - 4 * s, ny - 44 * s, x + 4 * s, ny - 34 * s], fill=(8, 12, 10))
        d.line([(x - 4 * s, ny - 26 * s), (x - 24 * s, ny - 28 * s)], fill=(8, 12, 10), width=max(1, int(3 * s)))
        gl.circle(x - 2 * s, ny - 40 * s, 5 * s + 2, (40, 255, 110))
        d.point((x - 2 * s, ny - 40 * s), fill=(200, 255, 210))
    if R.random() < 0.25:
        hx, hy, _ = R.choice(state["host"])
        x0 = hx - lt * 14
        pts = jag(x0 - 20, hy - 20, R.uniform(100, 600), R.uniform(560, 690), 8, 6)
        gl.line(pts, (40, 255, 110), 8)
        d.line(pts, fill=(220, 255, 230), width=2)
    # charging guardsmen
    for gx0, gy, gs, gt0, spd in state["chargers"]:
        if lt < gt0:
            continue
        x = gx0 + (lt - gt0) * spd
        if x > W + 200:
            continue
        silhouette_guard(d, x, gy, gs, (lt - gt0) * 11, (70, 200, 120))
        if R.random() < 0.06:
            mx, my = x + 58 * gs, gy - 76 * gs
            gl.circle(mx, my, 18 * gs, (255, 80, 40))
            p1 = (mx + 300, my - 30 + R.uniform(-20, 20))
            gl.line([(mx, my), p1], (255, 40, 30), 8)
            d.line([(mx, my), p1], fill=(255, 200, 180), width=2)
    # the commissar
    zoom = 1.0 + lt * 0.018
    cx, cy = 400, 712

    def M(lx, ly):
        return (cx + lx * zoom, cy + ly * zoom)
    f1 = math.sin(lt * 7) * 12
    f2 = math.sin(lt * 7 + 1.3) * 10
    sword_up = smooth((lt - 0.8) / 0.6)
    elbow = (lerp(70, 85, sword_up), lerp(-250, -400, sword_up))
    hand = (lerp(80, 95, sword_up), lerp(-190, -478, sword_up))
    tip = (lerp(230, 160, sword_up), lerp(-170, -660, sword_up))
    dark = (10, 12, 11)
    rim = (80, 220, 130)
    shapes = [
        ("p", [(-40, 0), (-14, 0), (-8, -175), (-38, -175)]),
        ("p", [(10, 0), (40, 0), (34, -175), (4, -175)]),
        ("p", [(-56, -338), (56, -338), (72, -205), (92 + f1, -112), (40, -96 + f2 * 0.3), (0, -118), (-48, -98), (-108 - f1, -118 + f2), (-78, -210)]),
        ("p", [(-26, -350), (26, -350), (22, -328), (-22, -328)]),
        ("e", (0, -368, 25, 28)),
        ("p", [(-32, -386), (36, -386), (46, -412), (-26, -424)]),
        ("p", [(-6, -386), (50, -383), (46, -377), (-4, -379)]),
        ("w", [(-50, -326), (-74, -245), (-62, -172)], 30),
        ("w", [(48, -326), elbow, hand], 30),
    ]
    for kind, *a in shapes:
        if kind == "p":
            pts = [M(*p) for p in a[0]]
            d.polygon([(x + 4, y - 1) for x, y in pts], fill=rim)
        elif kind == "e":
            ex, ey, rx, ry = a[0]
            px, py = M(ex, ey)
            d.ellipse([px - rx * zoom + 4, py - ry * zoom - 1, px + rx * zoom + 4, py + ry * zoom - 1], fill=rim)
        else:
            d.line([M(*p) for p in a[0]], fill=rim, width=int(a[1] * zoom) + 4, joint="curve")
    for kind, *a in shapes:
        if kind == "p":
            d.polygon([M(*p) for p in a[0]], fill=dark)
        elif kind == "e":
            ex, ey, rx, ry = a[0]
            px, py = M(ex, ey)
            d.ellipse([px - rx * zoom, py - ry * zoom, px + rx * zoom, py + ry * zoom], fill=dark)
        else:
            d.line([M(*p) for p in a[0]], fill=dark, width=int(a[1] * zoom), joint="curve")
    d.polygon([M(-50, -300), M(-30, -300), M(52, -205), M(36, -196)], fill=(110, 18, 16))         # sash
    d.polygon([M(-50, -232), M(60, -232), M(62, -218), M(-52, -218)], fill=(30, 22, 16))          # belt
    bx, by = M(10, -402)
    gl.circle(bx, by, 10, (255, 200, 90))
    d.ellipse([bx - 4, by - 4, bx + 4, by + 4], fill=(230, 190, 90))
    pts = [M(*hand), M(*tip)]
    d.line([M(hand[0] - 14, hand[1] + 6), M(hand[0] + 14, hand[1] - 6)], fill=(60, 54, 40), width=int(8 * zoom))
    gl.line(pts, (90, 160, 255), 34)
    d.line(pts, fill=(190, 220, 255), width=int(9 * zoom))
    d.line(pts, fill=(250, 252, 255), width=int(3 * zoom))
    if R.random() < 0.5:
        k0 = R.random()
        p = (lerp(pts[0][0], pts[1][0], k0), lerp(pts[0][1], pts[1][1], k0))
        arc = jag(p[0], p[1], p[0] + R.uniform(-40, 40), p[1] + R.uniform(-40, 40), 4, 6)
        d.line(arc, fill=(220, 235, 255), width=1)
        gl.line(arc, (80, 140, 255), 6)
    hx, hy = M(-62, -172)
    d.polygon([(hx - 6, hy - 8), (hx + 40, hy - 12), (hx + 40, hy - 2), (hx + 2, hy + 12)], fill=dark)
    img = gl.apply(img)
    d = ImageDraw.Draw(img, "RGBA")
    a = smooth((lt - 1.7) / 0.35)
    if a > 0:
        sc = 1 + (1 - a) * 0.3
        f = ImageFont.truetype(FD + "dejavu/DejaVuSerif-Bold.ttf", int(56 * sc))
        text_c(d, (880, 440), "FOR THE EMPEROR!", f, (240, 236, 222), 255 * a)
    w = smooth((lt - 4.0) / 0.9)
    if w > 0:
        img = Image.blend(img, Image.new("RGB", (W, H), (240, 255, 245)), w)
    return img


def render_end(t):
    lt = t - 40.0
    img = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    out = 1 - smooth((lt - 3.3) / 0.7)
    a = smooth((lt - 0.6) / 1.0) * out
    b = smooth((lt - 1.6) / 1.0) * out
    text_c(d, (W / 2, 330), "The dead do not tire.", F_END, (200, 210, 200), 255 * a)
    text_c(d, (W / 2, 385), "The living do not yield.", F_END, (230, 200, 170), 255 * b)
    text_c(d, (W / 2, 480), "an unofficial fan animation", F_SMALL, (120, 130, 120), 200 * b, shadow=False)
    wf = 1 - smooth(lt / 0.6)
    if wf > 0:
        img = Image.blend(img, Image.new("RGB", (W, H), (240, 255, 245)), wf)
    return img


# ---------------------------------------------------------------- captions & post
CAPTIONS = [
    (5.8, 10.2, "loc", "VARN IX  //  THE ASH WASTES  //  0300 HOURS"),
    (11.6, 14.4, "cap", "“Here they come. Lasguns — fire at will!”"),
    (17.2, 20.4, "cap", "“Throne above... they're getting back up!”"),
    (22.3, 24.6, "cap", "“Armour's here! Give them the battle cannon!”"),
    (28.6, 31.2, "cap", "“What in the Emperor's name is THAT?”"),
]

ys_ = np.linspace(-1, 1, H)[:, None]
xs_ = np.linspace(-1, 1, W)[None, :]
VIG = (1 - 0.45 * np.clip((xs_ ** 2 * 0.7 + ys_ ** 2) - 0.25, 0, 1))[..., None].astype(np.float32)
GRAIN = [np.random.default_rng(i).normal(0, 4.0, (H, W, 1)).astype(np.float32) for i in range(6)]


def post(img, t, fi):
    if 5 <= t < 40:
        d = ImageDraw.Draw(img, "RGBA")
        for t0, t1, kind, s in CAPTIONS:
            if t0 <= t < t1:
                a = 255 * min(1, (t - t0) / 0.3, (t1 - t) / 0.3)
                if kind == "loc":
                    n = int(len(s) * clamp((t - t0) / 1.6))
                    d.text((60, BAR + 30), s[:n] + ("_" if (fi // 8) % 2 else ""), font=F_LOC, fill=(120, 255, 160, int(a)))
                else:
                    text_c(d, (W / 2, H - BAR - 34), s, F_CAP, (236, 232, 220), a)
    arr = np.asarray(img, np.float32) * VIG + GRAIN[fi % 6]
    fade = 1.0
    if 5 <= t < 5.7:
        fade = smooth((t - 5) / 0.7)
    if t >= 43.8:
        fade = 0
    arr *= fade
    if 5 <= t < 40:
        arr[:BAR] = 0
        arr[H - BAR:] = 0
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


# ---------------------------------------------------------------- soundtrack
SR = 44100


def synth_audio(path):
    n = int(DUR * SR)
    L = np.zeros(n, np.float32)
    Rr = np.zeros(n, np.float32)
    rng = np.random.default_rng(5)

    def put(t, sig, vol=1.0, pan=0.0):
        i = int(t * SR)
        if i >= n:
            return
        sig = sig[: n - i] * vol
        L[i:i + len(sig)] += sig * math.sqrt(0.5 * (1 - pan))
        Rr[i:i + len(sig)] += sig * math.sqrt(0.5 * (1 + pan))

    def tt(d):
        return np.arange(int(d * SR)) / SR

    def lp(x, fc, order=2):
        X = np.fft.rfft(x)
        f = np.fft.rfftfreq(len(x), 1 / SR)
        X /= np.sqrt(1 + (f / fc) ** (2 * order))
        return np.fft.irfft(X, len(x)).astype(np.float32)

    def hp(x, fc):
        X = np.fft.rfft(x)
        f = np.fft.rfftfreq(len(x), 1 / SR)
        X *= 1 - 1 / np.sqrt(1 + (f / fc) ** 4)
        return np.fft.irfft(X, len(x)).astype(np.float32)

    def osc(freq, d, shape="sin"):
        f = np.broadcast_to(freq, (int(d * SR),)) if np.ndim(freq) == 0 else freq
        ph = np.cumsum(2 * np.pi * f / SR)
        if shape == "saw":
            return (((ph / (2 * np.pi)) % 1.0) * 2 - 1).astype(np.float32)
        if shape == "sq":
            return np.sign(np.sin(ph)).astype(np.float32)
        return np.sin(ph).astype(np.float32)

    def pan_x(x):
        return clamp((x - 640) / 700, -0.9, 0.9)

    # ambient drone + wind over the whole piece
    T = tt(DUR)
    drone = (osc(55, DUR, "saw") * 0.5 + osc(55.4, DUR, "saw") * 0.5 + osc(27.5, DUR) * 0.8)
    drone = lp(drone, 180) * (0.5 + 0.5 * np.sin(T * 0.4)) ** 2
    env = np.clip(T / 3, 0, 1) * np.where(T < 40, 1, np.clip(1 - (T - 40) / 4, 0, 1))
    put(0, drone * env, 0.22)
    wind = lp(rng.normal(0, 1, n).astype(np.float32), 400) * (0.6 + 0.4 * np.sin(T * 0.7 + 1))
    put(0, wind * env, 0.05)
    # title: deep pulses
    for i, t0 in enumerate([0.6, 1.9, 3.2]):
        d = tt(2.2)
        put(t0, osc(41 - 8 * d, 2.2) * np.exp(-d * 2.2), 0.5)
    # war drums 11 -> 35
    bpm = 100
    beat = 60 / bpm
    b = 0
    while 11.0 + b * beat < 34.8:
        t0 = 11.0 + b * beat
        d = tt(0.6)
        acc = 1.0 if b % 4 == 0 else 0.6
        kick = osc(90 * np.exp(-d * 18) + 45, 0.6) * np.exp(-d * 9)
        put(t0, kick, 0.55 * acc)
        if b % 2 == 1:
            sn = hp(rng.normal(0, 1, len(d)).astype(np.float32), 1500) * np.exp(-d * 22)
            put(t0, sn, 0.12)
        b += 1
    for b2 in range(int((34.8 - 22) / (beat / 2))):     # faster snare once the tank rolls in
        t0 = 22 + b2 * beat / 2
        d = tt(0.12)
        put(t0, hp(rng.normal(0, 1, len(d)).astype(np.float32), 2500) * np.exp(-d * 40), 0.05)
    # close-up: swelling choir-like chord, then cut to silence on the white flash
    d = tt(5.0)
    chord = sum(osc(f * (1 + 0.003 * np.sin(d * 5 + i)), 5.0, "saw") for i, f in enumerate([110, 220, 261.6, 329.6, 440, 523.3]))
    chord = lp(chord, 1400) * np.clip(d / 3.5, 0, 1) ** 1.5 * np.clip((5.0 - d) / 0.15, 0, 1)
    put(35.0, chord, 0.07)
    for k2 in range(8):
        t0 = 35.0 + k2 * 0.5
        dd = tt(0.8)
        put(t0, osc(70 * np.exp(-dd * 10) + 38, 0.8) * np.exp(-dd * 6), 0.7 if k2 % 2 == 0 else 0.45)
    d = tt(3.5)
    put(40.0, osc(36, 3.5) * np.exp(-d * 1.2), 0.6)
    put(40.0, lp(rng.normal(0, 1, len(d)).astype(np.float32), 300) * np.exp(-d * 1.5), 0.4)
    # charging shouts, impressionistic (filtered noise bursts)
    for k2 in range(10):
        t0 = 35.6 + rng.uniform(0, 3.3)
        dd = tt(0.6)
        put(t0, lp(hp(rng.normal(0, 1, len(dd)).astype(np.float32), 300), 900) * np.sin(np.pi * dd / 0.6), 0.08, rng.uniform(-0.6, 0.6))
    for k2 in range(14):   # close-up las + gauss
        t0 = 35.3 + rng.uniform(0, 4.2)
        dd = tt(0.12)
        put(t0, osc(2200 * np.exp(-dd * 30) + 500, 0.12, "sq") * np.exp(-dd * 25), 0.05, rng.uniform(-0.8, 0.8))

    # sim events
    for t0, kind, kw in EVENTS:
        p = pan_x(kw.get("x", 640))
        if kind == "las":
            d = tt(0.13)
            s = osc(2400 * np.exp(-d * 28) + 480, 0.13, "sq") * 0.5 + osc(1800 * np.exp(-d * 20) + 300, 0.13)
            put(t0, s * np.exp(-d * 24), 0.06, p)
        elif kind == "gauss":
            d = tt(0.4)
            buzz = osc(95 + 30 * np.sin(d * 200), 0.4, "saw") + 0.6 * osc(300 + 1600 * d, 0.4)
            nz = hp(rng.normal(0, 1, len(d)).astype(np.float32), 2000)
            s = (buzz * 0.6 + nz * 0.4) * np.exp(-d * 8) * (0.7 + 0.3 * np.sin(d * 190))
            put(t0, s, 0.13, p)
        elif kind == "clang":
            d = tt(0.3)
            s = (osc(1320, 0.3) + osc(1870, 0.3) * 0.6 + osc(2730, 0.3) * 0.4) * np.exp(-d * 14)
            put(t0, s, 0.06, p)
        elif kind == "rise":
            d = tt(1.4)
            s = osc(60 + 40 * d, 1.4, "saw") * 0.3 + osc(880 + 300 * d, 1.4) * 0.15
            put(t0, lp(s, 1500) * np.sin(np.pi * d / 1.4), 0.12, p)
        elif kind == "reanimate":
            d = tt(0.9)
            s = sum(osc(f * (1 + 0.5 * d), 0.9) for f in (660, 990, 1320)) / 3
            put(t0, s * np.sin(np.pi * d / 0.9) * (0.6 + 0.4 * np.sin(d * 60)), 0.07, p)
        elif kind == "phase":
            d = tt(0.6)
            put(t0, osc(1200 * np.exp(-d * 4) + 100, 0.6) * np.exp(-d * 4), 0.07, p)
        elif kind == "flay":
            d = tt(0.75)
            s = hp(rng.normal(0, 1, len(d)).astype(np.float32), 3000) * np.sin(np.pi * d / 0.75)
            put(t0, s, 0.08, p)
        elif kind in ("boom", "bigboom"):
            size = kw.get("size", 3.0) if kind == "boom" else 3.0
            dur = 1.6 + size * 0.6
            d = tt(dur)
            nz = lp(rng.normal(0, 1, len(d)).astype(np.float32), 250 + 150 * size)
            s = nz * np.exp(-d * (2.6 / size ** 0.5)) * 1.4 + osc(55 * np.exp(-d * 3) + 25, dur) * np.exp(-d * 3)
            put(t0, s, 0.35 + 0.12 * size, p)
        elif kind == "cannon":
            d = tt(1.2)
            s = hp(rng.normal(0, 1, len(d)).astype(np.float32), 200) * np.exp(-d * 18) + osc(70 * np.exp(-d * 6) + 30, 1.2) * np.exp(-d * 4)
            put(t0, s, 0.7, -0.5)
        elif kind == "engine":
            d = tt(5.0)
            s = lp(osc(38 + 4 * np.sin(d * 9), 5.0, "saw") + 0.3 * rng.normal(0, 1, len(d)).astype(np.float32), 300)
            e2 = np.clip(d / 1.5, 0, 1) * np.clip((5 - d) / 2.0, 0.3, 1)
            put(t0, s * e2, 0.3, -0.6)
        elif kind == "ship":
            d = tt(5.6)
            s = lp(osc(32 + 6 * d, 5.6, "saw") + osc(48 + 9 * d, 5.6, "saw"), 260) * np.clip(d / 3, 0, 1)
            put(t0, s, 0.35, 0.4)
        elif kind == "arc":
            d = tt(0.25)
            crack = rng.normal(0, 1, len(d)).astype(np.float32) * (rng.random(len(d)) < 0.2)
            put(t0, hp(crack, 1200) * np.exp(-d * 12), 0.3, p)
        elif kind == "charge":
            d = tt(1.1)
            s = osc(120 + 1300 * (d / 1.1) ** 2, 1.1, "saw") * 0.4 + osc(60 + 600 * (d / 1.1) ** 2, 1.1)
            put(t0, lp(s, 3000) * (d / 1.1) ** 1.5, 0.22, 0.3)
        elif kind == "beam":
            d = tt(1.1)
            s = osc(55, 1.1, "saw") + osc(110.5, 1.1, "saw") * 0.6 + hp(rng.normal(0, 1, len(d)).astype(np.float32), 800) * 0.7
            s *= (0.8 + 0.2 * np.sin(d * 140)) * np.clip((1.1 - d) / 0.2, 0, 1)
            put(t0, lp(s, 2500), 0.35, 0)
    mix_ = np.stack([L, Rr], 1)
    mix_ = np.tanh(mix_ * 1.3) / np.tanh(1.3)
    mix_ *= 0.95 / max(1e-6, np.abs(mix_).max())
    pcm = (mix_ * 32767).astype("<i2")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- main
def main():
    bg = build_bg()
    cbg = build_closeup_bg()
    sim = Sim()
    cstate = {
        "host": [(R.uniform(780, 1500), R.uniform(525, 600), R.random()) for _ in range(34)],
        "chargers": [(-120, 720, 2.4, 0.6, 520), (-160, 650, 1.6, 1.3, 380), (-100, 700, 2.1, 2.1, 480),
                     (-140, 630, 1.3, 2.6, 330), (-150, 735, 2.7, 3.0, 600), (-110, 660, 1.7, 3.4, 400), (-90, 610, 1.2, 1.0, 300)],
    }
    tmp = tempfile.mkdtemp()
    vpath = os.path.join(tmp, "video.mp4")
    apath = os.path.join(tmp, "audio.wav")
    proc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                             "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", vpath], stdin=subprocess.PIPE)
    for fi in range(NF):
        t = fi / FPS
        if t < 5:
            img = render_title(t)
        elif t < 35:
            sim.step(t)
            img = render_battle(sim, t, bg)
        elif t < 40:
            img = render_closeup(t, cbg, cstate)
        else:
            img = render_end(t)
        img = post(img, t, fi)
        proc.stdin.write(img.tobytes())
        if fi % 150 == 0:
            alive = sum(g.alive() for g in sim.guards)
            nec = sum(n.state not in ("hidden", "gone", "blown") for n in sim.necrons)
            print(f"frame {fi}/{NF}  t={t:5.1f}  guards={alive}  necrons={nec}  particles={len(sim.parts)}", flush=True)
    proc.stdin.close()
    proc.wait()
    synth_audio(apath)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", vpath, "-i", apath, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", OUT], check=True)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
