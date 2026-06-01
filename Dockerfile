FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs
COPY package*.json ./

EXPOSE 8080

CMD ["node", "server.mjs"]
