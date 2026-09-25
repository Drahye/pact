# syntax=docker/dockerfile:1.7
# One image serves the web app and the API. Run a second copy with `npm run worker`
# (and RUN_WORKER=false on the API) to scale background jobs separately.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production SERVE_STATIC=true PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/build ./build
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "build/index.mjs"]
