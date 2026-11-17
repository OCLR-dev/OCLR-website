"""Sync current S11 slider geometry before exporting artwork; --check is read-only.

The homepage SVG is authoritative. Embedded copies retain their viewports and
placement. Header palettes remain surface adaptations; slider shading uses alpha only.
"""
from pathlib import Path
from copy import deepcopy
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
SOURCE = ROOT / 'public/branding/home-s11/oclr-layer.svg'
source = ET.parse(SOURCE).getroot()
by_id = {e.get('id'): e for e in source.iter() if e.get('id')}
SHARED = ('r-fill-centerline', 'r-fill-soften', 'r-fill-mask', 'r-fill-shading', 'star-glow')
TARGETS = (
    'public/branding/oclr-s11-logo.svg',
    'public/branding/oclr-s11-layout-b.svg',
    'public/branding/oclr-s11-winter-banner.svg',
    'design/home-visual/layer-studio/assets/logo.svg',
    'design/home-visual/layer-studio/assets/oclr-layer.svg',
    'design/home-visual/layer-studio/assets/oclr-cropped.svg',
    'design/home-visual/layer-studio/index.html',
    'design/home-visual/layer-studio/centered/index.html',
)


def svg_end(text, start):
    depth = 0
    for tag in re.finditer(r'</?svg\b[^>]*>', text[start:]):
        depth += -1 if tag.group().startswith('</') else 1
        if depth == 0:
            return start + tag.end()
    raise ValueError('Unclosed SVG')


def slider_inner(source_id, namespace):
    slider = deepcopy(by_id[source_id])
    defs = slider.find(f'{{{NS}}}defs')
    for key in SHARED:
        defs.append(deepcopy(by_id[key]))
    ids = {e.get('id'): namespace + e.get('id') for e in slider.iter() if e.get('id')}
    for e in slider.iter():
        for key, value in list(e.attrib.items()):
            if key == 'id':
                e.set(key, ids[value])
            elif value.startswith('#') and value[1:] in ids:
                e.set(key, '#' + ids[value[1:]])
            else:
                e.set(key, re.sub(r'url\(#([^)]*)\)', lambda m: 'url(#' + ids.get(m[1], m[1]) + ')', value))
    # Keep the destination wrapper, including its surface color and placement.
    content = '\n'.join(ET.tostring(e, encoding='unicode').replace(f' xmlns="{NS}"', '') for e in slider)
    return '\n' + '\n'.join(line.rstrip() for line in content.splitlines()) + '\n'


def sync(text):
    matches = list(re.finditer(r'<svg\b[^>]*\bid="([^"]*(?:R-reference-slider|rookie-r))"[^>]*>', text))
    if not matches:
        raise ValueError('No slider artwork found')
    for m in reversed(matches):
        source_id = 'rookie-r' if m[1].endswith('rookie-r') else 'R-reference-slider'
        end = svg_end(text, m.start())
        text = text[:m.end()] + slider_inner(source_id, m[1] + '-synced-') + '</svg>' + text[end:]
    return text


def header(text):
    # Preserve the developer's OCL palette and R outline color per surface.
    # Use that same R color at varying alpha for the translucent slider body.
    text = sync(text)
    text = text.replace('fill="#ded3ff" fill-opacity=', 'fill="currentColor" fill-opacity=')
    text = text.replace('stroke="#ded3ff" stroke-opacity=', 'stroke="currentColor" stroke-opacity=')
    return text


def main():
    check = '--check' in sys.argv
    stale = []
    targets = [(p, sync) for p in TARGETS] + [
        (f'public/branding/home-s11/header-wordmark-{theme}.svg', header)
        for theme in ('light', 'dark')
    ]
    for name, transform in targets:
        path = ROOT / name
        before = path.read_text()
        after = transform(before)
        if before != after:
            stale.append(name)
            if not check:
                path.write_text(after)
    if check and stale:
        raise SystemExit('Stale logo copies:\n' + '\n'.join(stale))
    print(f'{len(targets)} logo copies checked; {len(stale)} updated.' if not check else f'{len(targets)} logo copies synchronized.')


if __name__ == '__main__':
    main()
