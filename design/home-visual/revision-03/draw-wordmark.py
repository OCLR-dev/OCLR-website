"""R03: organizer-directed hit circles, return slider, stream, one-stroke R, hit-error bar.
Legacy Geki: actual official skin outline adapted to paths; see sources/GEKI-SOURCE.md.
"""
from pathlib import Path
import math
import subprocess
import base64
from xml.etree import ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT=Path(__file__).resolve().parent
font=TTFont('/usr/share/fonts/noto-cjk/NotoSerifCJK-Black.ttc',fontNumber=2)
glyphs=font.getGlyphSet(); cmap=font.getBestCmap()
def glyph(c,x,y,size):
    pen=SVGPathPen(glyphs); glyphs[cmap[ord(c)]].draw(pen)
    return f'<path d="{pen.getCommands()}" transform="translate({x} {y}) scale({size/1000} {-size/1000})"/>'
number_font=TTFont('/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',fontNumber=2)
number_glyphs=number_font.getGlyphSet(); number_cmap=number_font.getBestCmap()
def number(value,cx,cy,size=10):
    label=str(value); scale=size/1000
    advances=[number_font['hmtx'].metrics[number_cmap[ord(c)]][0] for c in label]
    x=cx-sum(advances)*scale/2
    result=''
    for c,advance in zip(label,advances):
        pen=SVGPathPen(number_glyphs); number_glyphs[number_cmap[ord(c)]].draw(pen)
        result+=f'<path d="{pen.getCommands()}" transform="translate({x} {cy+size*.37}) scale({scale} {-scale})"/>'
        x+=advance*scale
    return result
def arc(cx,cy,r,a,b):
    p=lambda t:(cx+r*math.cos(math.radians(t)),cy+r*math.sin(math.radians(t)))
    x,y=p(a);xx,yy=p(b)
    return f'M{x:.2f} {y:.2f}A{r} {r} 0 {int(b-a>180)} 1 {xx:.2f} {yy:.2f}'
def ring(cx,cy,outer,inner):
    return f'M{cx+outer} {cy}a{outer} {outer} 0 1 0 {-2*outer} 0a{outer} {outer} 0 1 0 {2*outer} 0ZM{cx+inner} {cy}a{inner} {inner} 0 1 1 {-2*inner} 0a{inner} {inner} 0 1 1 {2*inner} 0Z'

svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 470" role="img" aria-labelledby="title desc">
<title id="title">OCLR S11 — osu! 节奏构成</title>
<desc id="desc">打击圈 O 内使用经典默认皮肤的激；C 是高挑往返滑条，L 内为编号连打串；R 从左下起点向上绕弧再斜向右下，一笔完成。下方为准度条及 S11。</desc>
<defs>
  <linearGradient id="violet" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9f65e8"/><stop offset=".6" stop-color="#7434b7"/><stop offset="1" stop-color="#552588"/></linearGradient>
  <linearGradient id="pink" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f290d1"/><stop offset="1" stop-color="#d93a9c"/></linearGradient>
  <linearGradient id="c-track" gradientUnits="userSpaceOnUse" x1="384" y1="160" x2="448" y2="349"><stop stop-color="#9756db"/><stop offset=".48" stop-color="#773cbd"/><stop offset="1" stop-color="#ec67b4"/></linearGradient>
  <linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="15" y1="389" x2="731" y2="163"><stop stop-color="#f8f2e7" stop-opacity="0"/><stop offset=".3" stop-color="#bd72e6" stop-opacity=".38"/><stop offset=".73" stop-color="#f8f2e7" stop-opacity=".85"/><stop offset="1" stop-color="#fff6ec"/></linearGradient>
  <linearGradient id="sweep" gradientUnits="userSpaceOnUse" x1="124" y1="401" x2="982" y2="22"><stop stop-color="#ad63da" stop-opacity="0"/><stop offset=".5" stop-color="#d958b0" stop-opacity=".75"/><stop offset="1" stop-color="#fdf0f1"/></linearGradient>
  <linearGradient id="plate"><stop stop-color="#2a173d"/><stop offset="1" stop-color="#843a9c"/></linearGradient>
  <clipPath id="o-ring"><path d="ORING" fill-rule="evenodd"/></clipPath>
  <clipPath id="o-inner"><path d="OINNER" fill-rule="evenodd"/></clipPath>
  <clipPath id="r-leg"><path d="M713 155L753 137L892 259L837 276Z"/></clipPath>
  <clipPath id="c-lower"><path d="M340 294L536 265V389H340Z"/></clipPath>
</defs>
'''.replace('ORING',ring(202,279,132,103)).replace('OINNER',ring(202,279,103,68))
# Background accents are geometrically tied to objects, not scattered decoration.
svg+='''<g id="construction-planes" opacity=".75">
  <path d="M885 66L922 52V245L885 256Z" fill="#251636"/>
  <path d="M893 153L916 145M893 165L916 157M893 177L916 169M893 189L916 181M893 201L916 193M893 213L916 205M893 225L916 217" stroke="#ce5eae" stroke-width="2"/>


</g>
<g id="cursor-sweep">

  <path d="M648 105L936 17" stroke="url(#sweep)" stroke-width="1.5" opacity=".65"/>
</g>
'''
# O: hit circle ring and approach circle, segmented as in the reference.
svg+='<g id="O-hitcircle">'
svg+=f'<circle cx="202" cy="279" r="152" fill="none" stroke="#eadce9" stroke-width="2.2"/>'
svg+=f'<path d="{arc(202,279,152,205,293)}" fill="none" stroke="#ac52da" stroke-width="5"/>'
svg+=f'<path d="{arc(202,279,152,1,72)}" fill="none" stroke="#e56ab9" stroke-width="4"/>'
svg+=f'<path d="{ring(202,279,132,68)}" fill="#f6efe3" fill-rule="evenodd"/>'
svg+='<g clip-path="url(#o-ring)"><path d="M197 127L344 172L351 252L199 279Z" fill="url(#pink)"/><path d="M202 279L351 247V426H202Z" fill="url(#pink)"/><path d="M202 279L58 235V326Z" fill="url(#pink)"/></g>'
svg+=f'<path d="{ring(202,279,103,68)}" fill="url(#violet)" fill-rule="evenodd"/>'
svg+='<g clip-path="url(#o-inner)"><path d="M199 279L320 242L318 381L201 395Z" fill="url(#pink)"/><path d="M200 279V400L100 346Z" fill="#f6efe3"/></g>'
svg+='<circle cx="202" cy="279" r="117" fill="none" stroke="#f6efe3" stroke-width="1.3" opacity=".86"/><circle cx="202" cy="279" r="87" fill="none" stroke="#e8c2f1" stroke-width="1.6"/><circle cx="202" cy="279" r="63" fill="#151322" stroke="#f7eede" stroke-width="2.4"/>'
svg+='<path d="M192 127L197 213M204 344L207 429M261 256L345 223" stroke="#f9f1e8" stroke-width="2.2"/>'
geki=ET.parse(ROOT/'geki.svg').getroot()
svg+='<g id="judgement-geki" transform="translate(151 227) scale(.63)">'
svg+=''.join(ET.tostring(e,encoding='unicode') for e in geki if e.tag.rsplit('}',1)[-1] not in ('title','desc','metadata'))
svg+='</g></g>'
# C: one tall curved slider; reverse arrow points back along its tangent.
curve='M496 153C433 151 387 197 385 253C383 304 428 343 499 325'
svg+='<g id="C-return-slider">'
svg+=f'<path id="c-slider-path" d="{curve}" fill="none" stroke="#f7eee2" stroke-width="63" stroke-linecap="round"/>'
svg+=f'<path d="{curve}" fill="none" stroke="url(#c-track)" stroke-width="56" stroke-linecap="round"/>'
svg+=f'<path d="{curve}" fill="none" stroke="#f8ecec" stroke-width="1.3" opacity=".6"/>'
for x,y in [(444,163),(405,198),(385,247),(394,291),(424,320),(461,330)]:
    svg+=f'<circle cx="{x}" cy="{y}" r="2.2" fill="#f7eee2"/>'
svg+='<circle cx="496" cy="153" r="30" fill="#9d4bc5" stroke="#fff4ec" stroke-width="3"/><circle cx="496" cy="153" r="21.5" fill="none" stroke="#e0b4ec" stroke-width="1.5"/>'
svg+='<g fill="#fff3ea">'+number(1,496,153,26)+'</g>'
svg+='<circle cx="499" cy="325" r="30" fill="#dc64b3" stroke="#fff3e7" stroke-width="3"/><circle cx="499" cy="325" r="21.5" fill="none" stroke="#f8c7e4" stroke-width="1.5"/>'
svg+='<path d="M504 313L490 325L504 337M514 313L500 325L514 337" fill="none" stroke="#fff2e4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" transform="rotate(-9 499 325)"/>'
svg+='</g>'
# L: the cream scaffold retains the reference; its interior is a numbered stream.
svg+='''<g id="L-hitcircle-stream">
<path d="M546 57L589 42L591 267L697 231V281L547 334Z" fill="#f5eddf"/>
<path d="M547 286L590 270V318L547 334Z" fill="url(#violet)"/>
<path d="M602 84L631 74V254L602 265Z" fill="url(#violet)"/>
<path d="M616 93V246" stroke="#bb7ddb" stroke-width="1" opacity=".5"/>
'''
stream=[(568,86),(568,120),(568,154),(568,188),(568,222),(568,256),(570,290),(603,286),(636,274),(669,263)]
svg+='<path d="M568 86V256L570 290L603 286L636 274L669 263" fill="none" stroke="#9367b6" stroke-width="1.1" opacity=".6"/>'
for i,(x,y) in enumerate(stream):
    fill='#a76bcf' if i<7 else '#d26ab4'
    svg+=f'<g id="stream-{i+1}"><circle cx="{x}" cy="{y}" r="13" fill="{fill}" stroke="#633f85" stroke-width="1.1"/><circle cx="{x}" cy="{y}" r="10.2" fill="none" stroke="#ead6f1" stroke-width=".8"/><g fill="#fff8f0">'+number(i+1,x,y,10)+'</g></g>'
svg+='</g>'
# R: a single SVG path encodes the complete slider traversal.
r_path='M735 270L735 111C754 101 774 94 795 96C829 98 850 115 850 141C850 168 824 182 791 182L752 182L865 238'
svg+='<g id="R-single-stroke-slider" transform="translate(0 -8)">'
svg+=f'<path id="r-slider-path" d="{r_path}" fill="none" stroke="#f7eee2" stroke-width="49" stroke-linecap="round" stroke-linejoin="round"/>'
svg+=f'<path d="{r_path}" fill="none" stroke="url(#c-track)" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>'
svg+=f'<path d="{r_path}" fill="none" stroke="#eac8eb" stroke-width="1.4" stroke-linejoin="round" opacity=".75"/>'
# Unobtrusive ticks follow the path and reinforce the one-stroke geometry.
for x,y in [(735,232),(735,178),(748,105),(791,96),(831,113),(844,157),(804,181),(779,195),(819,215)]:
    svg+=f'<circle cx="{x}" cy="{y}" r="2" fill="#f7eee2"/>'
svg+='<circle cx="735" cy="270" r="25" fill="#a564ca" stroke="#fff4e9" stroke-width="3"/><circle cx="735" cy="270" r="17.5" fill="none" stroke="#e4c2ec" stroke-width="1.4"/>'
svg+='<g fill="#fff6e9">'+number(1,735,270,23)+'</g>'
svg+='<circle cx="865" cy="238" r="23" fill="#e47abb" stroke="#fff4e9" stroke-width="3"/><circle cx="865" cy="238" r="11" fill="#fff3e8"/>'
svg+='</g>'
svg+='<g id="judgement-katu" transform="rotate(-19 910 103)"><path d="M880 67H940L946 113L925 140H880Z" fill="url(#plate)" stroke="#dc60b9" stroke-width="2.5"/><g fill="#fff2de">'+glyph('喝',883,124,54)+'</g></g>'
# Lower construction rail ties the letters to the season plate.
svg+='''<g id="season-rail">
<g id="hit-error-bar" transform="translate(226 447) rotate(-15.54)">
<rect x="0" y="-8" width="784" height="16" rx="1" fill="#181622" stroke="#d6c9dc" stroke-width="1"/>
<rect x="3" y="-5" width="116" height="10" fill="#d4ab50"/>
<rect x="119" y="-5" width="154" height="10" fill="#79b873"/>
<rect x="273" y="-5" width="238" height="10" fill="#66afe7"/>
<rect x="511" y="-5" width="154" height="10" fill="#79b873"/>
<rect x="665" y="-5" width="116" height="10" fill="#d4ab50"/>
<path d="M392 -15V14" stroke="#fff9ed" stroke-width="2"/>
<path d="M319 -9V6M348 -12V7M366 -10V6M382 -11V8M402 -12V7M417 -10V6M439 -9V6M458 -8V5" stroke="#f1f3f4" stroke-width="1.4" opacity=".7"/>
<path d="M387 -20H397L392 -14Z" fill="#fff5e7"/>
</g>
<g transform="matrix(1 -.295 0 1 0 0)">
<path d="M710 536H959V663H710Z" fill="#171323" stroke="#e9d8e1" stroke-width="1.8"/>
<path d="M721 546H815V652H721Z" fill="#f3eadd"/>
<path d="M806 557H751C740 557 731 566 731 577V607H776V619H731V641H791C803 641 807 634 807 622V589H760V579H806Z" fill="#241832"/>
<path d="M824 568L845 549H873V652H846V580L824 594Z" fill="#f5eddf"/>
<path d="M885 568L907 549H938V652H909V580L885 595Z" fill="url(#pink)"/>


<path d="M708 671H960" stroke="#d867b7" stroke-width="2"/>
</g>
</g>'''
# Follow points connect the C repeat start to the L stream, then L to R's start.
svg+='<g id="follow-points" fill="#e6c5ed">'
for x,y in [(519,132),(533,118),(546,104),(696,265),(712,263)]:
    svg+=f'<circle cx="{x}" cy="{y}" r="2.7" opacity=".6"/>'
svg+='</g>'
# A short taper reaches the R slider end along its final diagonal.
svg+='<g id="cursor-trail" transform="translate(0 -8)"><path d="M822 217L865 235L867 240Z" fill="url(#trail)"/><circle cx="865" cy="238" r="6.5" fill="#fff9ed"/></g>'
svg+='</svg>'

(ROOT/'oclr-s11-rhythm.svg').write_text(svg)
# Standalone art board with no font dependency in the actual logo.
board=f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="850" viewBox="0 0 1600 850"><rect width="1600" height="850" fill="#151320"/><path d="M80 95H1520" stroke="#65556f" stroke-width="1"/><text x="80" y="67" fill="#c9b9d8" font-family="sans-serif" font-size="19" letter-spacing="3">osu! Chinese League Rookie</text><svg x="70" y="127" width="1460" height="660" viewBox="0 0 1040 470">{svg[svg.index('<defs>'):svg.rindex('</svg>')]}</svg></svg>'
(ROOT/'wordmark-board.svg').write_text(board)
subprocess.run(['rsvg-convert',str(ROOT/'wordmark-board.svg'),'-o',str(ROOT/'wordmark-board.png')],check=True)
# Reuse the existing reviewed context and replace only its wordmark.
NS='http://www.w3.org/2000/svg';ET.register_namespace('',NS)
scene=ET.parse(ROOT.parent/'art-a.svg').getroot()
old=next(x for x in scene if x.attrib.get('id')=='layer-wordmark')
position=list(scene).index(old);scene.remove(old)
group=ET.Element('{'+NS+'}g',{'id':'layer-wordmark','transform':'translate(32 192) scale(.91)'})
logo=ET.fromstring(svg)
for child in logo:
    if child.tag not in ['{'+NS+'}title','{'+NS+'}desc']:group.append(child)
scene.insert(position,group)
for img in scene.iter('{'+NS+'}image'):
    source=ROOT.parent/img.get('href')
    img.set('href','data:image/png;base64,'+base64.b64encode(source.read_bytes()).decode())
ET.ElementTree(scene).write(ROOT/'homepage.svg',encoding='unicode')
subprocess.run(['rsvg-convert',str(ROOT/'homepage.svg'),'-o',str(ROOT/'homepage.png')],check=True)
for forbidden in ['image','text','script','filter','foreignObject']:
    assert not list(logo.iter('{'+NS+'}'+forbidden)),forbidden
ids=[n.get('id') for n in logo.iter() if n.get('id')]
assert len(ids)==len(set(ids))
print('Rendered R03 wordmark and homepage. Native-vector and unique-ID checks passed.')
