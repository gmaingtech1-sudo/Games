#!/usr/bin/env python3
"""Draws the original Life Simulator app icon (a little skyline + house + sun)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def draw(size):
    s = size / 512.0
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Rounded background with a vertical sky gradient
    bg = Image.new("RGBA", (size, size))
    for y in range(size):
        t = y / size
        r = int(255 * (0.98 - 0.45 * t))
        g = int(255 * (0.62 - 0.25 * t))
        b = int(255 * (0.35 + 0.35 * t))
        ImageDraw.Draw(bg).line([(0, y), (size, y)], fill=(r, g, b, 255))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(110 * s), fill=255)
    im.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(im)
    # Sun
    d.ellipse([330 * s, 70 * s, 440 * s, 180 * s], fill=(255, 236, 150, 255))
    # Skyline
    for x, w, h, c in [(40, 70, 230, (52, 73, 110)), (115, 60, 300, (44, 62, 96)), (180, 80, 200, (60, 84, 126)),
                       (265, 55, 270, (40, 56, 88)), (325, 90, 180, (58, 80, 120)), (420, 55, 240, (46, 66, 100))]:
        d.rectangle([x * s, (440 - h) * s, (x + w) * s, 440 * s], fill=c + (255,))
        for wy in range(int(440 - h + 18), 425, 26):
            for wx in range(x + 10, x + w - 12, 18):
                d.rectangle([wx * s, wy * s, (wx + 8) * s, (wy + 12) * s], fill=(255, 222, 120, 230))
    # Ground
    d.rounded_rectangle([0, 430 * s, size - 1, size - 1], radius=int(110 * s), fill=(76, 175, 80, 255))
    d.rectangle([0, 430 * s, size - 1, 470 * s], fill=(76, 175, 80, 255))
    # House
    d.polygon([(150 * s, 330 * s), (256 * s, 240 * s), (362 * s, 330 * s)], fill=(214, 64, 52, 255))
    d.rectangle([172 * s, 328 * s, 340 * s, 450 * s], fill=(250, 244, 230, 255))
    d.rectangle([236 * s, 372 * s, 276 * s, 450 * s], fill=(120, 72, 40, 255))
    d.rectangle([188 * s, 350 * s, 222 * s, 384 * s], fill=(120, 190, 240, 255))
    d.rectangle([290 * s, 350 * s, 324 * s, 384 * s], fill=(120, 190, 240, 255))
    return im


if __name__ == "__main__":
    draw(512).save(os.path.join(ROOT, "icon.png"))
    os.makedirs(os.path.join(ROOT, "assets", "ui"), exist_ok=True)
    draw(192).save(os.path.join(ROOT, "assets", "ui", "icon_192.png"))
    # Adaptive icon layers for Android (foreground on transparent, plain background)
    fg = draw(432).resize((432, 432))
    canvas = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    canvas.paste(fg.resize((300, 300)), (66, 66))
    canvas.save(os.path.join(ROOT, "assets", "ui", "icon_foreground.png"))
    Image.new("RGBA", (432, 432), (250, 150, 90, 255)).save(os.path.join(ROOT, "assets", "ui", "icon_background.png"))
    print("icons written")
