FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    DOWNLOAD_DIR=/data/downloads

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY backend ./backend
COPY server.mjs ./server.mjs
COPY package*.json ./

RUN mkdir -p /data/downloads /data/users
VOLUME ["/data"]

EXPOSE 8080

CMD ["node", "--experimental-sqlite", "server.mjs"]
