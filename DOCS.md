# Tank Frenzy installation and operation

## Recommended: repository installation

Add `https://github.com/charlescsj-del/tank-frenzy-rpi` in **Settings → Apps → App store → ⋮ → Repositories**, then install and start **Tank Frenzy**. On older Home Assistant versions these menus are called Add-ons and Add-on Store.

Use 64-bit Home Assistant OS on your Raspberry Pi. The app is built locally by Supervisor. No image registry credentials are required. Watch the Supervisor log during the first install.

## Alternative: local app installation

From a terminal with access to `/addons`:

```bash
cd /addons
git clone https://github.com/charlescsj-del/tank-frenzy-rpi.git tank_frenzy
```

The complete repository must be inside `/addons/tank_frenzy`, with `config.yaml`, `Dockerfile`, `addon.cjs`, game files, `audio/`, `icons/` and `tutorial/` together. In the App store, choose **Check for updates** and find **Tank Frenzy** under **Local apps**. Choose either repository installation or local installation, not both, to avoid duplicate apps/port conflicts.

## Configuration

- `admin_path`: Optional private address of the admin page, for example `hq-7f3k` for `https://your-domain/hq-7f3k`. Nothing in the game links to it, and the default `/admin` stops existing once you change it. Letters, digits, `-` and `_`, 3–64 characters.
- `admin_password`: Optional. Required to open the admin page on the game port and your public address; the browser asks for it (any user name works). At least 8 characters; after 20 wrong passwords in a minute, sign-in pauses for the rest of that minute. Leave it empty to keep the admin page off the public address. Inside the Home Assistant sidebar, type the admin address after the sidebar URL instead; it opens without a password because Home Assistant has already signed you in. For stronger protection on a Cloudflare address, you can also add a Cloudflare Access rule for the admin path.
- `notify_service`: Optional Home Assistant notify service that announces each newly opened room, for example `notify.mobile_app_your_phone` or `notify.notify`. The message names the player, room and mode; with `public_url` set, tapping it opens the room. At most one notification is sent per minute. Leave empty to turn notifications off. Find your service names under **Developer tools → Actions** by searching for `notify.`.
- `public_url`: Optional absolute game URL used for invitations. Example: `http://192.168.1.50:8765`. For a reverse proxy, use its HTTPS address. Do not include a room query, username, password, or fragment. Restart after changing it.
- **Network → 8765/tcp**: Host port for LAN players. Default: `8765`. Set a different free host port if occupied, or disable to use only Home Assistant ingress.
- **Show in sidebar**: Opens the game through Home Assistant authentication. The dedicated ingress listener accepts only the Supervisor proxy at `172.30.32.2`.

The app has no HA configuration/media mappings. It uses the Home Assistant API only to send the optional notifications. `/data` holds Supervisor options and `leaderboard.json`: all-time totals (wins, matches, kills, deaths and country by player name, at most 200 names) plus the last 62 days of match results, which power the Today, This week and This month views. It is saved about a second after every finished match and again when the app stops, written to a temporary file first so a power cut cannot corrupt it. It survives app restarts, updates and Pi reboots, and is included in Home Assistant backups of the app; uninstalling the app deletes it. Delete the file with the app stopped to reset the leaderboard. Days and weeks (Monday to Sunday) follow Home Assistant's time zone. Rooms and matches in progress are not persisted: app restarts/updates end active matches.

## Reading the admin resource charts

- **System CPU** is busy CPU time across all host cores over the latest sample interval. The game's CPU is listed separately: **100% means one full core**, so a process using multiple cores can exceed 100% there.
- **System memory** shows used / total host RAM. On Linux it uses `MemTotal − MemAvailable`, so reclaimable cache does not look like exhausted RAM. Available RAM and game resident memory (RSS) are also shown. If Linux's available-memory figure cannot be read, the display explicitly says used memory includes cache. Values use MiB/GiB.
- **Pi load** counts running/runnable tasks and tasks waiting in uninterruptible I/O. It is **not CPU usage**. On a four-core Pi, load 4.00 is the one-task-per-core reference. Compare the 1-, 5- and 15-minute averages to see a short spike versus sustained demand. Bar midpoints and the dashed trend line mark that reference; high values are not capped in the numeric readouts.
- Gauges summarize the host visible to the app, including other services; they do not represent a container memory limit. Colors are visual usage bands, not a hardware health diagnosis. The CPU gauge marks 70%/90%, memory 75%/90%; load bands use 0.7/1.0 tasks per core.
- Resource samples are taken on demand, at most once a second for all admin viewers combined. The CPU gauge needs a second sample after opening or returning from a long gap. The browser keeps up to 60 seconds of load history, clears it after gaps, and labels the last readings when disconnected. Missing metrics show a dash, never a fake zero.

## Verify after starting

1. The app log should show listeners on game port `8765` and internal ingress port `8099`.
2. Open **Web UI**: the lobby, banner and room list should load.
3. Open `http://YOUR_PI_IP:8765` on two devices. Create and join one room, start a round, move, shoot, and confirm sound after interacting.
4. Check `http://YOUR_PI_IP:8765/health`; it should return `status: ok` and game version `1.15.0`.
5. Test an invitation generated from the sidebar after setting `public_url`.

## Updates

For repository installs, use the App store's **Check for updates**, then **Update** when a new package version appears.

For local installs:

```bash
cd /addons/tank_frenzy
git pull --ff-only
```

Then check for updates and update/rebuild the app. Releases change `config.yaml` version so Supervisor can detect them. Avoid uninstalling solely to rebuild.

## Optional external access

If you already run Cloudflare Tunnel, add a public hostname whose service is `http://YOUR_PI_IP:8765` (or `http://homeassistant.local:8765`, or your mapped host port). Turn **WebSockets** on in the zone's Network settings and leave **HTTP Host Header** empty: the game only accepts WebSocket connections whose Origin matches the Host the browser used. Set `public_url` to the HTTPS game address. Cloudflare also sends each player's country (`CF-IPCountry`), which the leaderboard's Region filter uses; players on the LAN have no country. This app has no separate game login on the LAN/tunnel listener, so apply your tunnel's access policy if you want restricted access (for example a Cloudflare Access rule on just your `admin_path`). Creating this repository does not configure or expose a tunnel.

## Capacity

Each room holds four tanks, and the server allows 32 rooms at once. Snapshots go out 30 times a second at about 0.7 Mbit/s per player in a busy match, so a group of 19 people (five rooms) needs roughly 13 Mbit/s of upload and a modest share of one Pi 4 core. Bots add a little CPU and no extra connections. Wi-Fi quality on the players' side usually matters more than the Pi.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| App missing | Open the **App store**, refresh repositories, confirm 64-bit OS, check Supervisor logs for manifest errors. |
| Install fails | Supervisor needs internet access to Docker Hub and the npm registry. Read the build log and retry after resolving connectivity. |
| LAN URL fails | Use the Pi IP instead of `homeassistant.local`; check port mapping and Wi-Fi client isolation. |
| Sidebar works, LAN fails | Ensure host port `8765` is enabled and not already used by another app. |
| Lobby loads but cannot join | Reverse proxy must pass WebSocket upgrades and preserve the browser's Host/Origin. |
| Sidebar gives 403 | Ingress listener only accepts Supervisor at `172.30.32.2`; use port `8765` for direct requests. |
| Wrong invitation address | Set `public_url` to the address reachable by the other players and restart. |
| Silent until tapped | Expected browser autoplay behavior. Tap a control and confirm sound/music toggles. |
| Slow game | Check Pi CPU load, other apps and Wi-Fi quality; first compare one room with two players. |
| App does not start after changing options | The log names the invalid option (`public_url`, `notify_service`, `admin_password` shorter than 8 characters, or an `admin_path` that is not 3–64 letters/digits/`-`/`_` or reuses a game address). |
| Admin page shows "Not found" | On the game port or public address it needs `admin_password`; with `admin_path` set, `/admin` no longer exists. Open `/<admin_path>` and restart after changing options. |
| No room notifications | Check `notify_service` under **Developer tools → Actions**; at most one notification is sent per minute. |
| Leaderboard has no regions | Only players arriving through Cloudflare have a country. |

The container uses the maintained `node:22-alpine` tag; patch updates may change the underlying image on future rebuilds. ARM64 build success and real-device performance are separate checks.
