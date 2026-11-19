# Builds tournament/sheet-a.jpg (v01-v12, 4x3) and sheet-b.jpg (n01-n06, 3x2)
# from the renders in tournament/renders/. Run from the repo root:
#   python3 tools/make_sheets.py

from PIL import Image, ImageDraw, ImageFont
import os

RENDERS = 'tournament/renders'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BG = (16, 16, 20)

def sheet(ids, cols, rows, out, cell=460, gap=28, label_h=52, margin=40):
    f = ImageFont.truetype(FONT, 34)
    cell_h = cell + label_h
    W = margin * 2 + cols * cell + (cols - 1) * gap
    H = margin * 2 + rows * cell_h + (rows - 1) * gap
    canvas = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(canvas)
    for i, vid in enumerate(ids):
        r, c = divmod(i, cols)
        x = margin + c * (cell + gap)
        y = margin + r * (cell_h + gap)
        im = Image.open(os.path.join(RENDERS, vid + '.jpg')).convert('RGB')
        im = im.resize((cell, cell), Image.LANCZOS)
        canvas.paste(im, (x, y))
        # thin frame so cell edges read clearly
        draw.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(70, 70, 78), width=1)
        text = vid
        tw = draw.textlength(text, font=f)
        draw.text((x + (cell - tw) / 2, y + cell + 10), text, font=f, fill=(235, 235, 240))
    canvas.save(out, 'JPEG', quality=80, optimize=True)
    print(out, canvas.size, os.path.getsize(out), 'B')

sheet([f'v{i:02d}' for i in range(1, 13)], 4, 3, 'tournament/sheet-a.jpg')
sheet([f'n{i:02d}' for i in range(1, 7)], 3, 2, 'tournament/sheet-b.jpg')
