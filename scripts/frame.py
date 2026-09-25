"""Wrap each exported app screen (exports/app/*.png, 3x) in an iPhone-style frame
with a status bar, on a warm backdrop. Output: exports/app-framed/*.png."""
import glob, os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('exports/app-framed', exist_ok=True)
INK, BG, PAPER = (15, 23, 19), (239, 236, 229), (246, 244, 239)

def rounded(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m

try:
    font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 44)
except OSError:
    font = ImageFont.load_default()

for f in sorted(glob.glob('exports/app/*.png')):
    shot = Image.open(f).convert('RGB')           # 1170 x 2532
    w, h = shot.size
    status = 141                                  # 47pt status bar at 3x
    bezel, pad = 36, 160
    screen = Image.new('RGB', (w, h + status), PAPER)
    screen.paste(shot, (0, status))
    d = ImageDraw.Draw(screen)
    d.text((110, 52), '9:41', fill=INK, font=font)
    d.rounded_rectangle((w // 2 - 190, 30, w // 2 + 190, 140), 55, fill=INK)          # island
    d.rounded_rectangle((w - 190, 66, w - 100, 106), 12, outline=INK, width=5)        # battery
    d.rounded_rectangle((w - 184, 72, w - 118, 100), 7, fill=INK)
    for i, bh in enumerate((16, 24, 32, 40)):                                            # signal
        d.rounded_rectangle((w - 330 + i * 22, 106 - bh, w - 316 + i * 22, 106), 4, fill=INK)
    sw, sh = screen.size
    phone = Image.new('RGBA', (sw + bezel * 2, sh + bezel * 2), (0, 0, 0, 0))
    phone.paste(Image.new('RGB', phone.size, INK), (0, 0), rounded(phone.size, 170))
    phone.paste(screen, (bezel, bezel), rounded(screen.size, 135))
    ImageDraw.Draw(phone).rounded_rectangle((phone.width // 2 - 200, phone.height - 62, phone.width // 2 + 200, phone.height - 48), 7, fill=INK)
    canvas = Image.new('RGB', (phone.width + pad * 2, phone.height + pad * 2), BG)
    canvas.paste(phone, (pad, pad), phone)
    out = os.path.join('exports/app-framed', os.path.basename(f))
    canvas.save(out, optimize=True)
    print('framed', out)
