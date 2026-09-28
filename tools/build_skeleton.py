# python-hwpx 빈 문서에 시수표용 스타일을 더해 브라우저용 골격(skeleton.js)을 만든다
# 사용: pip install python-hwpx 후
#   python -c "from hwpx.document import HwpxDocument as D; d=D.new(); d.add_table(2,2); d.save_to_path('blank.hwpx')"
#   python tools/build_skeleton.py blank.hwpx skeleton.js
import re, json, base64, zipfile, sys
src = zipfile.ZipFile(sys.argv[1]); out = sys.argv[2]
parts = {n: src.read(n) for n in src.namelist()}
h = parts['Contents/header.xml'].decode()

def add(container, tag, xml):
    global h
    h = h.replace(f'</hh:{container}>', xml + f'</hh:{container}>', 1)
    n = len(re.findall(rf'<hh:{tag}\b', h))
    h = re.sub(rf'(<hh:{container} itemCnt=")\d+', rf'\g<1>{n}', h, count=1)

bf3 = re.search(r'<hh:borderFill id="3".*?</hh:borderFill>', h, re.S).group(0)
def bf(i, color):
    x = bf3.replace('id="3"', f'id="{i}"', 1)
    return x.replace('</hh:borderFill>', f'<hc:fillBrush><hc:winBrush faceColor="{color}" hatchColor="#999999" alpha="0"/></hc:fillBrush></hh:borderFill>')
add('borderFills', 'borderFill', bf(4, '#E6EEF7'))   # 머리글(원본 구성표 색)
add('borderFills', 'borderFill', bf(5, '#F7E8E8'))   # 휴업일
add('borderFills', 'borderFill', bf(6, '#F2F2F2'))   # 소계·합계, 월·주·일수 열

cp0 = re.search(r'<hh:charPr id="0".*?</hh:charPr>', h, re.S).group(0)
def cp(i, height, color='#000000', bold=False):
    x = re.sub(r'id="0"', f'id="{i}"', cp0, count=1)
    x = re.sub(r'height="\d+"', f'height="{height}"', x, count=1)
    x = re.sub(r'textColor="[^"]+"', f'textColor="{color}"', x, count=1)
    x = re.sub(r'<hh:fontRef [^>]*/>', '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>', x)
    if bold: x = x.replace('<hh:underline', '<hh:bold/><hh:underline', 1)
    return x
for args in [(7, 900), (8, 900, '#000000', True), (9, 900, '#FF0000'), (10, 1400, '#000000', True), (11, 1100, '#000000', True), (12, 1000),
             (13, 900, '#0000FF'), (14, 900, '#FF0000', True)]:
    add('charProperties', 'charPr', cp(*args))

pp0 = re.search(r'<hh:paraPr id="0".*?</hh:paraPr>', h, re.S).group(0)
def pp(i, align, spacing, prev=0):
    x = pp0.replace('id="0"', f'id="{i}"', 1).replace('horizontal="JUSTIFY"', f'horizontal="{align}"', 1)
    x = x.replace('value="160" unit="HWPUNIT"', f'value="{spacing}" unit="HWPUNIT"')
    x = x.replace('<hc:prev value="0"', f'<hc:prev value="{prev}"')
    return x
for args in [(20, 'CENTER', 130), (21, 'LEFT', 130), (22, 'LEFT', 160, 1200), (23, 'RIGHT', 130), (24, 'CENTER', 160, 0)]:
    add('paraProperties', 'paraPr', pp(*args))
parts['Contents/header.xml'] = h.encode()

sec = parts['Contents/section0.xml'].decode()
sec = re.sub(r'<hp:margin header="\d+" footer="\d+" gutter="0" left="\d+" right="\d+" top="\d+" bottom="\d+"/>',
             '<hp:margin header="2835" footer="2835" gutter="0" left="4252" right="4252" top="4252" bottom="4252"/>', sec)
open_tag = sec[:sec.index('<hp:p ')]
first_p = re.search(r'<hp:p .*?</hp:p>', sec, re.S).group(0)
first_p = re.sub(r'<hp:linesegarray>.*?</hp:linesegarray>', '', first_p)
width = 59528 - 4252 * 2

hpf = parts['Contents/content.hpf'].decode()
hpf = re.sub(r'<opf:title>.*?</opf:title>|<opf:title/>', '<opf:title>교육과정 시수표</opf:title>', hpf)
parts['Contents/content.hpf'] = hpf.encode()

skel = {'order': src.namelist(), 'text': {}, 'b64': {}, 'secOpen': open_tag, 'secFirstP': first_p, 'width': width}
for n, b in parts.items():
    if n == 'Contents/section0.xml': continue
    if n.endswith('.png'): skel['b64'][n] = base64.b64encode(b).decode()
    else: skel['text'][n] = b.decode()
open(out, 'w').write('// 자동 생성: python-hwpx 빈 문서 + 시수표 스타일 (build_skeleton.py). 직접 고치지 말 것\n'
                     '// borderFill 3=표 4=머리글 5=휴업일 6=합계·회색열 / charPr 7=9pt 8=9pt굵게 9=9pt빨강 10=14pt굵게 11=11pt굵게 12=10pt 13=9pt파랑 14=9pt빨강굵게\n'
                     '// paraPr 20=가운데 21=왼쪽 22=제목(위 여백) 23=오른쪽 24=가운데(문단)\n'
                     'window.HWPX_SKELETON = ' + json.dumps(skel, ensure_ascii=False) + ';\n')
print('ok', out, width)
