"""Write exports/html/index.html listing every exported screen, then zip the folder."""
import glob, html, os, subprocess

files = sorted(os.path.basename(f) for f in glob.glob('exports/html/*.html') if not f.endswith('index.html'))
groups = [('Mobile app', [f for f in files if f.startswith('app-')]),
          ('Website (responsive: resize the window to see mobile)', [f for f in files if f in ('landing.html', 'download.html')]),
          ('Style guide', [f for f in files if f == 'styleguide.html'])]
items = ''.join(
    f'<h2>{html.escape(t)}</h2><ul>' + ''.join(f'<li><a href="{f}">{html.escape(f[:-5].replace("app-", "").replace("-", " "))}</a></li>' for f in fs) + '</ul>'
    for t, fs in groups if fs)
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PACT · Screens</title><style>
body{{margin:0;padding:48px 24px;font:16px/1.5 -apple-system,system-ui,sans-serif;background:#f6f4ef;color:#0f1713}}
main{{max-width:720px;margin:auto}}h1{{font-size:40px;letter-spacing:-.04em;margin:0 0 8px}}p{{color:#4a544f}}
h2{{font-size:18px;margin:32px 0 8px}}ul{{list-style:none;padding:0;margin:0;display:grid;gap:8px}}
a{{display:block;padding:14px 18px;border-radius:16px;background:#fff;box-shadow:inset 0 0 0 1px #e7e3da;color:inherit;text-decoration:none;text-transform:capitalize;font-weight:600}}
a:hover{{box-shadow:inset 0 0 0 1px #0f1713}}</style></head><body><main>
<h1>PACT screens</h1><p>Each file is a self-contained snapshot of the coded product: styles, fonts and images are inlined, so it opens offline in any browser. Interactions (gestures, 3D, scroll animation) live in the running build: <code>npm run dev</code>.</p>
{items}</main></body></html>'''
open('exports/html/index.html', 'w').write(page)
if os.path.exists('exports/pact-screens-html.zip'):
    os.remove('exports/pact-screens-html.zip')
subprocess.run(['zip', '-qr', '../pact-screens-html.zip', '.'], cwd='exports/html', check=True)
print('zipped', len(files), 'screens ->', 'exports/pact-screens-html.zip', os.path.getsize('exports/pact-screens-html.zip') // 1024, 'KB')
