"""Finds CSS rules whose selectors can no longer match anything: a class that no source file mentions (even as the start of a
template literal like `ask__att-btn--${x}`). Usage: python3 scripts/css-dead.py [--apply] [file.css ...]. Without --apply it only reports."""
import re, sys, glob, os
apply = '--apply' in sys.argv
files = [a for a in sys.argv[1:] if a.endswith('.css')] or [f for f in glob.glob('src/**/*.css', recursive=True)]
src = ''
for f in glob.glob('src/**/*', recursive=True):
    if f.endswith(('.ts', '.tsx')): src += open(f, errors='ignore').read() + '\n'
for f in ['index.html']: src += open(f).read()
cls_re = re.compile(r'\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)')
def alive(tok):
    if tok in src: return True
    # dynamic: prefix up to a separator followed by ${ or a quote-less concat
    for m in re.finditer(r'[-_]+', tok):
        pre = tok[:m.end()]
        if re.search(re.escape(pre) + r'\$\{', src) or re.search(re.escape(pre) + r"'\s*\+", src): return True
    return False
cache = {}
def tok_alive(t):
    if t not in cache: cache[t] = alive(t)
    return cache[t]
def sel_dead(sel):
    toks = cls_re.findall(re.sub(r'\[[^\]]*\]|\([^)]*\)', '', sel))
    return any(not tok_alive(t) for t in toks)
total = 0
for f in sorted(files):
    css = open(f).read()
    out = []; i = 0; removed = []
    def scan(text):
        res = []; pos = 0
        while pos < len(text):
            # skip comments
            if text.startswith('/*', pos):
                e = text.find('*/', pos) + 2; res.append(text[pos:e]); pos = e; continue
            b = text.find('{', pos)
            if b == -1: res.append(text[pos:]); break
            head = text[pos:b]
            depth = 1; j = b + 1
            while depth and j < len(text):
                if text[j] == '{': depth += 1
                elif text[j] == '}': depth -= 1
                j += 1
            body = text[b + 1:j - 1]
            h = head.strip()
            if h.startswith('@media') or h.startswith('@supports'):
                inner = scan(body)
                if inner.strip() == '' or not re.search(r'\{', inner): removed.append(h + ' (empty)'); pos = j; continue
                res.append(head + '{' + inner + '}')
            elif h.startswith('@'):
                res.append(head + '{' + body + '}')
            else:
                sels = [s.strip() for s in re.sub(r'/\*.*?\*/', '', h, flags=re.S).split(',') if s.strip()]
                keep = [s for s in sels if not sel_dead(s)]
                dead = [s for s in sels if sel_dead(s)]
                if dead: removed.append(', '.join(dead))
                if keep: res.append((head if not dead else '\n' + ',\n'.join(keep)) + '{' + body + '}')
            pos = j
        return ''.join(res)
    new = scan(css)
    if removed:
        total += len(removed)
        print(f'{f}: {len(removed)} dead selector groups')
        for r in removed[:int(os.environ.get("SHOW", "0"))]: print('   ', r[:110])
        if apply: open(f, 'w').write(re.sub(r'\n{3,}', '\n\n', new))
print('total dead selector groups:', total)
