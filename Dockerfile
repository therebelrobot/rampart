# ---- build: client (Vite) + server (esbuild, single file) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm test

# ---- runtime: just Node and the built output, no node_modules ----
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/therebelrobot/rampart" \
      org.opencontainers.image.description="Pixel-art palette generator: value-first, hue-shifted ramps with Procreate export" \
      org.opencontainers.image.licenses="Unlicense"
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "dist/server.mjs"]
