#!/usr/bin/env python3
"""Trace the existing OCLR S11 pink brush silhouette, without redrawing it.

Requires Python 3, Pillow, NumPy and Potrace. Run from any directory.
The source is an existing repository asset, never a downloaded font substitute.
"""

from pathlib import Path
import hashlib
import subprocess
import tempfile
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SOURCE = ROOT / "public/oclr-s11-classic-wordmark-soft.png"
OUTPUT = HERE.parent / "s11-brush.svg"
PADDING = 4
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def main():
    rgba = np.asarray(Image.open(SOURCE).convert("RGBA"), dtype=np.int16)
    red, green, blue, alpha = (rgba[:, :, i] for i in range(4))

    # Separate the pink brush core from the purple outline and cream lettering.
    # Thresholds sit between the pink/purple colours, retaining edge coverage.
    mask = (red > 150) & (red - green > 75) & (red - blue > 15) & (alpha > 180)
    y, x = np.where(mask)
    box = (int(x.min()), int(y.min()), int(x.max() + 1), int(y.max() + 1))
    cropped = np.pad(mask[box[1]:box[3], box[0]:box[2]], PADDING)
    height, width = cropped.shape

    with tempfile.TemporaryDirectory(prefix="oclr-s11-trace-") as temp:
        bitmap = Path(temp) / "s11.pbm"
        traced = Path(temp) / "s11.svg"
        Image.fromarray(np.where(cropped, 0, 255).astype("uint8")).convert("1").save(bitmap)
        subprocess.run([
            "potrace", str(bitmap), "--svg", "--output", str(traced),
            "--turdsize", "2", "--alphamax", "0.7", "--opttolerance", "0.15",
            "--unit", "10",
        ], check=True)
        paths = ET.parse(traced).getroot()

    svg = ET.Element(f"{{{SVG_NS}}}svg", {
        "viewBox": f"0 0 {width} {height}", "width": str(width), "height": str(height),
        "role": "img", "aria-labelledby": "s11-brush-title s11-brush-desc",
    })
    ET.SubElement(svg, f"{{{SVG_NS}}}title", {"id": "s11-brush-title"}).text = "S11 — original brush silhouette"
    ET.SubElement(svg, f"{{{SVG_NS}}}desc", {"id": "s11-brush-desc"}).text = (
        "Native vector paths traced from the pink S11 in the existing OCLR classic "
        "soft wordmark. Original brush proportions, spacing, tapered ends and "
        "incisions are retained; the purple outline and background are excluded."
    )
    for child in paths:
        if child.tag == f"{{{SVG_NS}}}g":
            child.set("fill", "currentColor")
            child.set("stroke", "none")
            svg.append(child)
    ET.indent(svg, space="  ")
    OUTPUT.write_text(ET.tostring(svg, encoding="unicode") + "\n", encoding="utf-8")
    print(f"Source SHA256: {hashlib.sha256(SOURCE.read_bytes()).hexdigest()}")
    print(f"Source crop (left, top, right, bottom; exclusive): {box}")
    print(f"Output viewBox: 0 0 {width} {height}; {PADDING}px inset")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
