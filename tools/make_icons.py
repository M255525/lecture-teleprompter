# 產生 PWA 圖示：炭黑底＋平板螢幕＋紅色提示燈＋琥珀色進度條與倒數數字塊
import os
from PIL import Image, ImageDraw
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(out, exist_ok=True)

def draw(size, pad):
    s = 4 * size
    im = Image.new('RGB', (s, s), '#121418')
    d = ImageDraw.Draw(im)
    x0, x1 = pad * s, (1 - pad) * s
    w = x1 - x0
    sx0, sy0, sx1, sy1 = x0 + w * .1, x0 + w * .2, x1 - w * .1, x1 - w * .2
    d.rounded_rectangle([sx0, sy0, sx1, sy1], radius=w * .06, fill='#1E222A', outline='#323845', width=int(w * .012))
    sw = sx1 - sx0
    r = sw * .045
    d.ellipse([sx0 + sw * .08 - r, sy0 + sw * .1 - r, sx0 + sw * .08 + r, sy0 + sw * .1 + r], fill='#FF5A5F')
    # 倒數數字（七段顯示器風格的方塊）
    seg = sw * .045
    def digit(ox, oy, dw, dh, segs):
        t = seg
        P = {'a':[ox, oy, ox + dw, oy + t], 'g':[ox, oy + dh / 2 - t / 2, ox + dw, oy + dh / 2 + t / 2], 'd':[ox, oy + dh - t, ox + dw, oy + dh],
             'f':[ox, oy, ox + t, oy + dh / 2], 'b':[ox + dw - t, oy, ox + dw, oy + dh / 2], 'e':[ox, oy + dh / 2, ox + t, oy + dh], 'c':[ox + dw - t, oy + dh / 2, ox + dw, oy + dh]}
        for k in segs: d.rectangle(P[k], fill='#FFB020')
    dw, dh, oy = sw * .17, sw * .3, sy0 + sw * .2
    digit(sx0 + sw * .12, oy, dw, dh, 'abged')      # 2
    digit(sx0 + sw * .34, oy, dw, dh, 'abcdfg')     # 9
    d.rectangle([sx0 + sw * .545, oy + dh * .25, sx0 + sw * .545 + seg, oy + dh * .25 + seg], fill='#FFB020')
    d.rectangle([sx0 + sw * .545, oy + dh * .7, sx0 + sw * .545 + seg, oy + dh * .7 + seg], fill='#FFB020')
    digit(sx0 + sw * .62, oy, dw, dh, 'abcdef')     # 0
    by = sy1 - sw * .14
    d.rounded_rectangle([sx0 + sw * .1, by, sx1 - sw * .1, by + sw * .05], radius=sw * .025, fill='#2B303B')
    d.rounded_rectangle([sx0 + sw * .1, by, sx0 + sw * .6, by + sw * .05], radius=sw * .025, fill='#FFB020')
    return im.resize((size, size), Image.LANCZOS)

draw(192, .04).save(os.path.join(out, 'icon-192.png'))
draw(512, .04).save(os.path.join(out, 'icon-512.png'))
draw(512, .16).save(os.path.join(out, 'icon-maskable-512.png'))
print('ok')
