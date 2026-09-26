# Multi-architecture image: Docker selects ARM64 on a 64-bit Raspberry Pi.
FROM node:22-alpine
ARG BUILD_VERSION=1.13.0
ARG BUILD_ARCH
LABEL io.hass.name="Tank Frenzy" \
      io.hass.description="Multiplayer tank battles for Home Assistant" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.source="https://github.com/charlescsj-del/tank-frenzy-rpi"
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY server.cjs game-server.cjs map-generator.cjs bots.cjs leaderboard.cjs shared.js ./
COPY index.html client.js sound-bank.js music.js mode-banner.webp manifest.webmanifest ./
COPY audio/ ./audio/
COPY tutorial/ ./tutorial/
COPY icons/ ./icons/
COPY addon.cjs ./
EXPOSE 8765 8099
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8765/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "addon.cjs"]
