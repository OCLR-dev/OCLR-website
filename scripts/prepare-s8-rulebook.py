"""Preserve the organizer's S8 Google Docs text/HTML exports as local content.

Usage: python3 scripts/prepare-s8-rulebook.py export.txt export.html
Only decodes embedded PNGs. Does not fetch URLs or execute source HTML.
"""
import argparse
import base64
import json
import struct
from html.parser import HTMLParser
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("text")
parser.add_argument("html")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
raw = Path(args.text).read_text(encoding="utf-8-sig")
raw = "\n".join(line.rstrip() for line in raw.splitlines())+"\n"
headings = ["比赛信息：", "教练（Coach）相关：", "奖品：", "时间：", "选秀规则：", "比赛规则：", "EX模式："]
sections = []
for i, heading in enumerate(headings):
    start = raw.index(heading)+len(heading)
    end = raw.index(headings[i+1], start) if i+1 < len(headings) else len(raw)
    sections.append({"heading": heading, "body": raw[start:end].strip()})


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        src = dict(attrs).get("src", "")
        assert src.startswith("data:image/png;base64,"), "Unexpected external rulebook image"
        image = base64.b64decode(src.split(",", 1)[1], validate=True)
        assert image.startswith(b"\x89PNG\r\n\x1a\n")
        self.images.append(image)


images = Images()
images.feed(Path(args.html).read_text())
assert len(images.images) == 4
folder = root / "public/archive/s8"
folder.mkdir(parents=True, exist_ok=True)
figures = []
for i, (image, alt) in enumerate(zip(images.images, ["原始规则书页首横幅", "选秀次序原始示意图", "比赛选图与禁图顺序原始示意图", "错误选图方法原始示例"]), 1):
    width, height = struct.unpack(">II", image[16:24])
    (folder / f"rules-{i}.png").write_bytes(image)
    figures.append({"src": f"/archive/s8/rules-{i}.webp", "alt": alt, "width": width, "height": height})
for section, figure, anchor in [(4, figures[1], "第二轮，第四轮及第六轮的选人次序同第一轮。"), (5, figures[2], "此时顺序如下："), (5, figures[3], "如果超时，裁判会进行一个roll图来代替队伍pick。")]:
    assert anchor in sections[section]["body"]
    sections[section].setdefault("figures", []).append({"after": anchor, **figure})
content = {"title": raw[:raw.index(headings[0])].strip(), "version": None, "documentUrl": "https://docs.google.com/document/d/1Bcwl0HD9QVjl8P-Iq5nBqzPPlT-Oag-_IZjzNIfbjpI/edit", "cover": figures[0], "sections": sections}
(root / "docs/imports/s8-rulebook.txt").write_text(raw)
(root / "src/content/s8-rulebook.json").write_text(json.dumps(content, ensure_ascii=False, indent=2)+"\n")
print(json.dumps({"chapters": len(sections), "images": [{"width": f["width"], "height": f["height"]} for f in figures]}))
