"""Writes the app icons (36/72 px PNG) of all apps: medical cross on a rounded tile.

    python3 tools/make_icons.py
"""

import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TARGETS = {
    os.path.join(ROOT, "TA-kis-datagen", "static"): ((14, 23, 46), (52, 226, 160)),
    os.path.join(ROOT, "kis_studio", "package", "app", "static"): ((10, 18, 36), (34, 211, 238)),
    os.path.join(ROOT, "kis_studio", "package", "klinik", "static"): ((11, 127, 171), (255, 255, 255)),
}


def png(size, bg, fg):
    rows = []
    r = size * 0.22
    arm = size * 0.16
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            cx, cy = min(x, size - 1 - x), min(y, size - 1 - y)
            inside = not (cx < r and cy < r and (r - cx) ** 2 + (r - cy) ** 2 > r * r)
            cross = (abs(x - size / 2 + 0.5) < arm and size * 0.2 < y < size * 0.8) or \
                    (abs(y - size / 2 + 0.5) < arm and size * 0.2 < x < size * 0.8)
            if not inside:
                row += bytes((0, 0, 0, 0))
            elif cross:
                row += bytes(fg) + b"\xff"
            else:
                row += bytes(bg) + b"\xff"
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + \
        chunk(b"IDAT", raw) + chunk(b"IEND", b"")


for folder, (bg, fg) in TARGETS.items():
    os.makedirs(folder, exist_ok=True)
    for name, size in (("appIcon.png", 36), ("appIconAlt.png", 36), ("appIcon_2x.png", 72), ("appIconAlt_2x.png", 72)):
        with open(os.path.join(folder, name), "wb") as fh:
            fh.write(png(size, bg, fg))
    print("icons written to", folder)
