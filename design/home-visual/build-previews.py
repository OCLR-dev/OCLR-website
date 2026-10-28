"""Build editable SVG compositions and PNG review boards; no raster editing."""
from pathlib import Path
from xml.etree import ElementTree as ET
import subprocess
from html import escape

ROOT = Path(__file__).resolve().parent
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
TITLES = {'a':'斜轴构成', 'b':'留白海报', 'c':'夜景视窗', 'd':'节奏网格'}
SUBTITLES = {'a':'夕景与斜向字标 / 最接近参考', 'b':'奶白留白与几何字形 / 轻盈', 'c':'深紫纯色与独立景窗 / 聚焦', 'd':'淡紫色块与节拍节点 / 清晰'}

def text(x,y,value,size=18,fill='#272238',weight=400,spacing=0):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-family="Noto Sans CJK SC, sans-serif" font-size="{size}" font-weight="{weight}" letter-spacing="{spacing}">{escape(value)}</text>'

def image(href,x,y,w,h,extra='',fit='slice'):
    return f'<image href="{href}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid {fit}" {extra}/>'

def wordmark(key,x,y,width):
    node=ET.parse(ROOT/'assets'/f'wordmark-{key}.svg').getroot()
    contents=''.join(ET.tostring(e,encoding='unicode') for e in node if e.tag!=f'{{{NS}}}title')
    return f'<g id="layer-wordmark" transform="translate({x} {y}) scale({width/900})">{contents}</g>'

def nav(dark=False,mobile=False):
    fg='#f5f0f9' if dark else '#302642'
    bg='#20192f' if dark else '#f5f0fa'
    w=390 if mobile else 1600
    s=f'<g id="navigation"><rect width="{w}" height="80" fill="{bg}"/>'
    s+=text(24 if mobile else 72,51,'OCLR',32,fg,900)
    if mobile:
        s+=text(273,48,'简  /  菜单',16,fg)
    else:
        s+=text(650,48,'首页',16,fg,700)+text(742,48,'比赛主页',16,fg)+text(876,48,'赛事动态',16,fg)+text(1010,48,'OCLR 维基',16,fg)+text(1158,48,'主办方',16,fg)
        s+=text(1330,48,'◐',22,fg)+text(1385,48,'简体中文',16,fg)+text(1516,48,'↗',20,fg)
        s+=f'<path d="M650 63H682" stroke="{fg}" stroke-width="2"/>'
    return s+'</g>'

def actions(x,y,dark=False,mobile=False):
    fg='#f6f0fb' if dark else '#302642'
    secondary='#cec1e4' if dark else '#675c7e'
    fill='#eadff8' if dark else '#332147'
    bfg='#30213f' if dark else '#fff8fc'
    w=342 if mobile else 512
    s='<g id="actions">'
    s+=f'<rect x="{x}" y="{y}" width="{w}" height="60" fill="{fill}" rx="4"/>'
    s+=text(x+24,y+38,'比赛主页',20,bfg,600)+text(x+w-40,y+38,'↗',22,bfg)
    s+=text(x,y+104,'报名入口  →',17,fg,600)+text(x+(184 if mobile else 306),y+104,'Discord  /  QQ群',16,secondary)
    return s+'</g>'

def desktop(key):
    dark=key in ('a','c')
    fg='#f6f0fb' if dark else '#302642'
    muted='#cfc3de' if dark else '#756680'
    s=f'<svg xmlns="{NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="scene-title"><title id="scene-title">{TITLES[key]} — OCLR S11 首页主视觉方案</title>'
    s+='''<defs><linearGradient id="shade"><stop stop-color="#141323"/><stop offset=".35" stop-color="#141323" stop-opacity=".98"/><stop offset=".62" stop-color="#1d1835" stop-opacity=".64"/><stop offset="1" stop-color="#1d1835" stop-opacity=".24"/></linearGradient><linearGradient id="fade" x1="0" x2="0" y2="1"><stop stop-color="#eee7f5" stop-opacity="0"/><stop offset="1" stop-color="#eee7f5"/></linearGradient><clipPath id="scene-window"><rect x="933" y="158" width="553" height="584" rx="276"/></clipPath></defs>'''
    s+=f'<rect y="80" width="1600" height="820" fill="{chr(35)+ ("191524" if dark else "f5f1e9")}"/>'
    s+='<g id="layer-background">'
    if key=='a':
        s+='<rect y="80" width="1600" height="820" fill="#18152a"/>'+image('assets/sunset-clean.png',0,80,1600,820)
        s+='<rect y="80" width="1600" height="820" fill="url(#shade)"/><path d="M920 165L1490 98M955 750L1530 680" stroke="#e1c3ed" stroke-width="1" opacity=".32"/>'
    elif key=='b':
        s+='<rect y="80" width="1600" height="820" fill="#f5f1e9"/><rect x="1035" y="130" width="480" height="690" fill="#e6ddf1"/><circle cx="1275" cy="320" r="164" fill="#eee7f5"/>'
        s+='<path d="M1035 690L1150 603L1212 646L1283 579L1395 676L1450 624L1515 684V820H1035Z" fill="#cbbde1"/><path d="M1035 754L1140 690L1234 735L1345 669L1515 731V820H1035Z" fill="#b4a4d0"/>'
        s+='<path d="M960 142V808M73 799H880" stroke="#cec1d5"/>'
    elif key=='c':
        s+='<rect y="80" width="1600" height="820" fill="#191524"/><rect x="921" y="146" width="577" height="608" rx="288" fill="none" stroke="#6f587f"/>'
        s+=image('assets/sunset-clean.png',933,158,553,584,'clip-path="url(#scene-window)"')
        s+='<rect x="933" y="158" width="553" height="584" rx="276" fill="#2f214d" opacity=".20"/><circle cx="1499" cy="754" r="9" fill="#e2b4de"/>'
        s+=text(955,813,'LIRU  /  OCLR S11',14,'#9f8db3',400,3)
    else:
        s+='<rect y="80" width="1600" height="820" fill="#ece7f6"/><rect x="920" y="80" width="680" height="820" fill="#d7c8ec"/><rect x="920" y="80" width="340" height="340" fill="#b9a0e4"/><circle cx="1255" cy="420" r="250" fill="#e4d9f2"/>'
        s+='<path d="M920 590H1600M1090 80V900M1430 80V900" stroke="#c8b5e1"/><rect x="1480" y="688" width="120" height="132" fill="#ae95d8"/><path d="M920 740H1520" stroke="#765896" stroke-width="2"/>'
        for i,c in enumerate(['#e8556a','#efdeff','#efdeff','#efdeff','#efdeff','#4c7be5']):
            s+=f'<circle cx="{945+i*110}" cy="740" r="13" fill="{c}" stroke="#72568c" stroke-width="2"/>'
    s+='</g>'+nav(dark)
    s+=text(86,161,'osu! Chinese League Rookie',19,muted,500,2)
    s+=text(86,201,'SEASON 11',12,muted,500,4)
    s+=wordmark(key,64,242 if key in ('b','d') else 232,805)
    s+='<g id="layer-mascot">'+image('assets/liru-clean.png',938,124,540,714,fit='meet')+'</g>'
    s+=actions(88,665,dark)
    s+=f'<path d="M0 860H1600" stroke="{muted}" opacity=".22"/>'+text(88,888,'过往赛事',15,muted)+text(1390,888,'向下探索  ↓',14,muted)
    s+='</svg>'
    return s

def mobile(key):
    dark=key in ('a','c'); fg='#f5effb' if dark else '#302642'; muted='#c3b5d8' if dark else '#756680'
    bg={'a':'#191629','b':'#f5f1e9','c':'#191524','d':'#ece7f6'}[key]
    s=f'<svg xmlns="{NS}" width="390" height="844" viewBox="0 0 390 844" role="img"><title>OCLR S11 — {TITLES[key]} 手机构图</title>'
    s+=f'<rect width="390" height="844" fill="{bg}"/><g id="layer-background">'
    if key=='a':
        s+=image('assets/sunset-clean.png',0,336,390,356)+f'<rect x="0" y="336" width="390" height="356" fill="{bg}" opacity=".25"/>'
    elif key=='c':
        s+='<defs><clipPath id="mobile-window"><rect x="66" y="359" width="258" height="302" rx="129"/></clipPath></defs><rect x="60" y="353" width="270" height="314" rx="135" fill="none" stroke="#6f587f"/>'
        s+=image('assets/sunset-clean.png',66,359,258,302,'clip-path="url(#mobile-window)"')
    elif key=='d':
        s+='<rect x="24" y="350" width="342" height="333" fill="#d7c8ec"/><rect x="24" y="350" width="171" height="170" fill="#b9a0e4"/><circle cx="195" cy="510" r="124" fill="#e4d9f2"/><path d="M24 520H366M24 650H366M110 350V683M280 350V683" stroke="#c8b5e1"/>'
        for i,c in enumerate(['#e8556a','#efdeff','#efdeff','#efdeff','#efdeff','#4c7be5']):
            s+=f'<circle cx="{48+i*59}" cy="650" r="6" fill="{c}" stroke="#72568c"/>'
    else:
        s+='<rect x="24" y="350" width="342" height="333" fill="#ddd1ee"/><circle cx="198" cy="490" r="122" fill="#eee5f7"/><path d="M24 620L120 550L192 611L276 561L366 622V683H24Z" fill="#bdacd7"/>'
    s+='</g>'+nav(dark,True)+text(24,121,'osu! Chinese League Rookie',13,muted,500,1)
    s+=wordmark(key,16,145,358)
    # Full figure retained in the mobile proposal; key letters never overlap face.
    s+='<g id="layer-mascot">'+image('assets/liru-clean.png',72,331,246,364,fit='meet')+'</g>'
    s+=actions(24,708,dark,True)+'</svg>'
    return s

for key in TITLES:
    for suffix,source in [('',desktop(key)),('-mobile',mobile(key))]:
        target=ROOT/f'art-{key}{suffix}.svg'; target.write_text(source)
        ET.parse(target)
        subprocess.run(['rsvg-convert',str(target),'-o',str(ROOT/'previews'/f'{key}{suffix}.png')],check=True)

# Contact sheet rendered with SVG, without modifying any source bitmap.
s=f'<svg xmlns="{NS}" width="1680" height="1156" viewBox="0 0 1680 1156"><rect width="1680" height="1156" fill="#f3f0f5"/>'
s+=text(40,49,'OCLR S11 / 首页主视觉方向',27,'#32263f',700)+text(1638,46,'',14)
s+=text(40,78,'同一人物 · 四种构图 · 独立 SVG 字标',15,'#776780')
for i,key in enumerate(TITLES):
    x=40+(i%2)*820;y=110+(i//2)*510
    s+=image(f'previews/{key}.png',x,y,780,439)
    s+=text(x,y+473,f'{key.upper()}  {TITLES[key]}',20,'#35243d',700)+text(x+208,y+472,SUBTITLES[key],15,'#786d81')
s+='</svg>'
(ROOT/'overview.svg').write_text(s)
subprocess.run(['rsvg-convert',str(ROOT/'overview.svg'),'-o',str(ROOT/'previews'/'overview.png')],check=True)
print('Rendered 4 desktop, 4 mobile and 1 overview PNG; SVG sources remain editable.')
