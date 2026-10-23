FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000

FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3000
COPY --from=builder /app/node_modules ./node_modules
CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js || true && node dist/main"]
