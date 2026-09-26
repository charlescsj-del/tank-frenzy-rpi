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

- `admin_password`: Optional. Opens **/admin** on the game port and your public address (for example `https://your-domain/admin`), protected by the browser's password prompt; any user name works. At least 8 characters. Leave empty to keep /admin off the public address. The **Admin** link on the room browser inside the Home Assistant sidebar always works without it, because Home Assistant has already signed you in.
- `notify_service`: Optional Home Assistant notify service that announces each newly opened room, for example `notify.mobile_app_your_phone` or `notify.notify`. The message names the player, room and mode; with `public_url` set, tapping it opens the room. At most one notification is sent per minute. Leave empty to turn notifications off. Find your service names under **Developer tools → Actions** by searching for `notify.`.
- `public_url`: Optional absolute game URL used for invitations. Example: `http://192.168.1.50:8765`. For a reverse proxy, use its HTTPS address. Do not include a room query, username, password, or fragment. Restart after changing it.
- **Network → 8765/tcp**: Host port for LAN players. Default: `8765`. Set a different free host port if occupied, or disable to use only Home Assistant ingress.
- **Show in sidebar**: Opens the game through Home Assistant authentication. The dedicated ingress listener accepts only the Supervisor proxy at `172.30.32.2`.

The app has no HA configuration/media mappings. It uses the Home Assistant API only to send the optional notifications. `/data` holds Supervisor options and `leaderboard.json`: all-time totals (wins, matches, kills, deaths and country by player name, at most 200 names) plus the last 62 days of match results, which power the Today, This week and This month views. It is saved about a second after every finished match and again when the app stops, written to a temporary file first so a power cut cannot corrupt it. It survives app restarts, updates and Pi reboots, and is included in Home Assistant backups of the app; uninstalling the app deletes it. Delete the file with the app stopped to reset the leaderboard. Days and weeks (Monday to Sunday) follow Home Assistant's time zone. Rooms and matches in progress are not persisted: app restarts/updates end active matches.

## Verify after starting

1. The app log should show listeners on game port `8765` and internal ingress port `8099`.
2. Open **Web UI**: the lobby, banner and room list should load.
3. Open `http://YOUR_PI_IP:8765` on two devices. Create and join one room, start a round, move, shoot, and confirm sound after interacting.
4. Check `http://YOUR_PI_IP:8765/health`; it should return `status: ok` and game version `1.14.0`.
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

If you already run Cloudflare Tunnel, point your chosen game hostname at `http://homeassistant.local:8765` (or the Pi LAN IP and mapped host port). WebSockets must be supported and the original Host/Origin preserved. Set `public_url` to the HTTPS game address. This app has no separate game login on the LAN/tunnel listener, so apply your tunnel's access policy if you want restricted access. Creating this repository does not configure or expose a tunnel.

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

The container uses the maintained `node:22-alpine` tag; patch updates may change the underlying image on future rebuilds. ARM64 build success and real-device performance are separate checks.
