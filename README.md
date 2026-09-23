# Tank Frenzy for Home Assistant / Raspberry Pi

Install Tank Frenzy as a Home Assistant app (formerly called an add-on). The Pi hosts the multiplayer game; players use Safari, Edge, Chrome, or another modern browser on their phones, tablets, or computers. Rendering and sound run on each player's device.

Based on **Tank Frenzy v1.7.0** from the [main game repository](https://github.com/charlescsj-del/tank-frenzy/commit/eca194333d78931cd6653e20bb5129bb468fd292). Includes the approved B pre-game track, random A/C battle tracks, selected combat effects, louder continuous music loops, and distinct 3–2–1 and Start sounds. The Pi app provides separate Home Assistant sidebar and LAN listeners.

## Install

Requires **64-bit Home Assistant OS with Supervisor**, such as a Raspberry Pi 4 or 5. ARM64 (`aarch64`) and x86-64 (`amd64`) are supported. This is not a Home Assistant integration or HACS package; Home Assistant Container alone cannot install apps.

1. Open **Settings → Apps → App store** (older versions: **Add-ons → Add-on Store**).
2. Open **⋮ → Repositories**, then add:
   ```text
   https://github.com/charlescsj-del/tank-frenzy-rpi
   ```
3. Close the dialog, refresh/check for updates, then select **Tank Frenzy → Install**.
4. Start it. Enable **Start on boot**, **Watchdog**, and **Show in sidebar** if desired.
5. Click **Open Web UI**, or open **http://homeassistant.local:8765** from a device on your Wi-Fi. If that hostname does not resolve, use `http://YOUR_PI_IP:8765`.

The first install downloads a Node image and installs one JavaScript dependency. Internet access is needed for installation; normal LAN gameplay uses the files served by your Pi.

[Add this repository to Home Assistant](https://my.home-assistant.io/redirect/supervisor_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fcharlescsj-del%2Ftank-frenzy-rpi)

## Play with friends

Use the direct LAN address for the best mobile/full-screen experience and invite links. Create a room, ask friends to open the same address, then join the room. Supports up to four players per room. The sidebar is available through Home Assistant's authenticated ingress.

Set **Configuration → public_url** to your LAN address, for example `http://192.168.1.50:8765`, so **Copy Invite** also produces a usable LAN link when you open the game through the sidebar. Leave it empty to use the address currently open in the browser. Temporary ingress URLs require a Home Assistant session and are not suitable as permanent invitations.

Port `8765` is the game port and does not require a Home Assistant login. Change or disable its host mapping under **Network** if needed; update `public_url` to match. The internal ingress port `8099` is not published on the host. Disabling the game port still permits sidebar play.

Music starts after the first tap/click, according to browser autoplay rules. Sound comes from the playing device, not the Pi's audio output. Scores and rooms are held in memory and reset when the app restarts.

See [DOCS.md](DOCS.md) for local installation, updates and troubleshooting, and [GAMEPLAY.md](GAMEPLAY.md) for controls and game rules.

## Development and verification

```bash
npm ci
npm test
npm start
```

`npm start` runs the standalone server at port 8765. `node addon.cjs` starts both Home Assistant listeners and reads `/data/options.json` if available. No HA API, host networking, privileged mode, or media access is required.

```bash
docker build --build-arg BUILD_ARCH=aarch64 -t tank-frenzy-rpi .
docker run --rm -p 8765:8765 tank-frenzy-rpi
```

Run the build on the intended architecture (or use Docker Buildx with `--platform linux/arm64`). The repository includes CI for tests and ARM64/AMD64 container builds. A physical Pi/Home Assistant installation and mobile play must still be checked on the target device; automated tests do not establish Pi performance under load.

App package version: **1.7.0**. Game version: **1.7.0**. Bump `config.yaml` for future app updates and keep the Dockerfile default build version in sync.
