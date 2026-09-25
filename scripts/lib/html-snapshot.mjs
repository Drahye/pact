// Serialises the current page into one self-contained HTML file:
// CSS, fonts and images are inlined, scripts removed, WebGL canvases frozen to images.
import { writeFileSync } from 'node:fs';

export async function saveHtml(page, file, opts = {}) {
  writeFileSync(file, await snapshotHtml(page, opts));
}

/**
 * @param opts.frameOverlays  move bottom sheets and toasts (portalled to <body>) inside the phone,
 *                            so a sheet slides up from the bottom of the device, not the browser window
 * @param opts.viewportHeight rewrite vh units to px at this height, so a full-height export keeps
 *                            the proportions of a real screen
 */
export async function snapshotHtml(page, { title, extraCss = '', frameOverlays = false, viewportHeight = 0 } = {}) {
  // 1. Freeze each 3D scene (WebGL can't be serialised) into an image of what it shows right now.
  //    The whole scene container is captured and replaced, so its DOM overlays (avatars, labels)
  //    are baked into the image instead of appearing twice.
  await page.evaluate(() =>
    document.querySelectorAll('canvas').forEach((c) => (c.closest('.payment-scene') ?? c).setAttribute('data-freeze', '')),
  );
  const canvases = await page.$$('[data-freeze]');
  for (const [i, c] of canvases.entries()) {
    const box = await c.boundingBox();
    if (!box || box.width < 2 || box.height < 2) continue;
    const png = await c.screenshot({ type: 'png', timeout: 60000 }).catch(() => null);
    if (!png) continue;
    await page.evaluate(
      ({ i, data }) => {
        const el = document.querySelectorAll('[data-freeze]')[i];
        if (!el) return;
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${data}`;
        img.alt = '';
        const cs = getComputedStyle(el);
        // fill the scene's box and crop from the centre, so the frozen scene still adapts to any width
        img.style.cssText = `position:${cs.position === 'static' ? 'relative' : cs.position};inset:${cs.top} ${cs.right} ${cs.bottom} ${cs.left};width:100%;height:${cs.position === 'absolute' ? 'auto' : el.clientHeight + 'px'};display:block;object-fit:cover;object-position:center;`;
        el.replaceWith(img);
      },
      { i, data: png.toString('base64') },
    );
  }

  // 2. Collect CSS, inline fonts and images, drop scripts, return the document.
  const html = await page.evaluate(async ({ extraCss, frameOverlays, viewportHeight }) => {
    const toDataUrl = async (url) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return await new Promise((ok) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.readAsDataURL(blob);
        });
      } catch {
        return url;
      }
    };
    let css = '';
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        css += Array.from(sheet.cssRules).map((r) => r.cssText).join('\n') + '\n';
      } catch {
        /* cross-origin sheet: skip */
      }
    }
    // fonts and css-referenced images
    const urls = [...new Set([...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')))];
    for (const u of urls) {
      const abs = new URL(u, location.href).href;
      const data = await toDataUrl(abs);
      css = css.split(u).join(data);
    }
    if (viewportHeight) {
      css = css.replace(/(-?\d*\.?\d+)(d|s|l)?vh\b/g, (_, n) => `${((parseFloat(n) * viewportHeight) / 100).toFixed(2)}px`);
    }
    const doc = document.documentElement.cloneNode(true);
    if (frameOverlays) {
      const device = doc.querySelector('.device');
      if (device) {
        doc.querySelectorAll('body > .modal, body > .toasts').forEach((n) => {
          n.classList.add(n.classList.contains('modal') ? 'modal--frame' : 'toasts--frame');
          device.appendChild(n);
        });
      }
    }
    doc.querySelectorAll('script, link[rel="stylesheet"], link[rel="modulepreload"], style, link[rel="icon"]').forEach((n) => n.remove());
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:')) img.setAttribute('src', await toDataUrl(new URL(src, location.href).href));
      img.removeAttribute('loading');
    }
    const style = document.createElement('style');
    style.textContent = css + '\n' + extraCss;
    doc.querySelector('head').appendChild(style);
    return '<!doctype html>\n' + doc.outerHTML;
  }, { extraCss, frameOverlays, viewportHeight });

  return title ? html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`) : html;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Full-frame export of one layout: the page at its true width (390 or 1440) and full height,
 * with no device or browser chrome. It renders inside an iframe of exactly that width so media
 * queries and vw units resolve to that layout wherever the file is opened; the iframe grows to
 * the page's full height. Desktop scales down to fit narrower windows.
 */
export function frameLayout(inner, { title, kind }) {
  const w = kind === 'mobile' ? 390 : 1440;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
html,body{margin:0;background:#e7e3da}
.frame{width:${w}px;margin:0 auto;transform-origin:top left}
iframe{display:block;border:0;width:${w}px;height:100vh;background:#f6f4ef}
</style></head><body><div class="frame"><iframe title="${esc(title)}" scrolling="no" srcdoc="${esc(inner)}"></iframe></div>
<script>
var f=document.querySelector('iframe'),box=document.querySelector('.frame');
function size(){var d=f.contentDocument;if(!d||!d.body)return;var h=d.documentElement.scrollHeight;f.style.height=h+'px';
var s=Math.min(1,innerWidth/${w});box.style.transform=s<1?'scale('+s+')':'';box.style.margin=s<1?'0':'0 auto';box.style.height=(h*s)+'px';}
f.addEventListener('load',function(){size();setTimeout(size,300);setTimeout(size,1200)});addEventListener('resize',size);
</script></body></html>`;
}

/** Centres a native-width app screen in a phone-sized frame when the HTML is opened on a desktop. */
export const phoneFrameCss = `
html, body { background: #efece5 !important; }
body { min-height: 100vh; display: grid; place-items: center; padding: 32px 0; }
#root { width: 390px; }
.proto--native { width: 390px; height: 844px !important; min-height: 0 !important; border-radius: 48px; overflow: hidden;
  box-shadow: 0 0 0 10px #0f1713, 0 0 0 11px #2e3a34, 0 40px 80px -30px rgba(15,23,19,.35); }
.proto--native .proto__stage, .proto--native .device { height: 844px !important; }
.skip-link { display: none; }
`;
