"""Turn exports/app captures into the web snapshots the landing page shows.
Run after `npm run capture:app`."""
from PIL import Image

SCREENS = {'01-welcome': 'welcome', '02-home': 'home', '03-create': 'create', '04-pact-detail': 'detail',
           '10-invite-new-pact': 'invite', '05-invite': 'invite-sarah', '06-contribute': 'contribute', '07-confirmation': 'confirmation',
           '08-activity': 'activity', '09-completed': 'completed'}
for src, dst in SCREENS.items():
    im = Image.open(f'exports/app/{src}.png').convert('RGB').resize((780, 1688), Image.LANCZOS)
    im.save(f'public/snapshots/{dst}.webp', 'WEBP', quality=86)
    print('snapshot', dst)
