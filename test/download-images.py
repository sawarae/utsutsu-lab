"""Download test images from Wikimedia Commons."""
import subprocess, json
from pathlib import Path

ASSETS = Path(__file__).parent / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)

def wiki_url(filename):
    import urllib.parse
    enc = urllib.parse.quote(filename)
    api = (f"https://commons.wikimedia.org/w/api.php"
           f"?action=query&titles=File:{enc}&prop=imageinfo&iiprop=url&format=json")
    r = subprocess.run(['curl', '-s', '-A', 'TestBot/1.0', api],
                       capture_output=True, text=True)
    d = json.loads(r.stdout)
    for p in d['query']['pages'].values():
        ii = p.get('imageinfo', [{}])
        if ii:
            return ii[0].get('url', '')
    return ''

TARGETS = [
    ('01_mug.jpg',     'Amazon Echo Dot (virtual digital assistant) with normal coffee mug as size comparison.jpg'),
    ('02_teacup.jpg',  'Teacup with a saucer.jpg'),
    ('03_jp_teacup.jpg','Hanazume Japanese Teacup by MUSUBI KILN - 51501763966.jpg'),
    ('04_beer.jpg',    'Glass beer mug full.jpg'),
    ('05_sake.jpg',    'Sake set.jpg'),
    ('06_chawan.jpg',  'Ceremonial matcha.jpg'),
]

for dest, wiki_name in TARGETS:
    out = ASSETS / dest
    if out.exists() and out.stat().st_size > 10000:
        from PIL import Image
        try:
            img = Image.open(out)
            print(f'  skip (exists): {dest}  {img.size}')
            continue
        except Exception:
            pass
    url = wiki_url(wiki_name)
    if not url:
        print(f'  no url: {dest}'); continue
    r = subprocess.run(['wget', '-q', url, '-O', str(out)], capture_output=True)
    if r.returncode == 0:
        from PIL import Image
        try:
            img = Image.open(out)
            print(f'  OK: {dest}  {img.size}')
        except Exception as e:
            print(f'  bad image {dest}: {e}'); out.unlink(missing_ok=True)
    else:
        print(f'  wget fail: {dest}')
