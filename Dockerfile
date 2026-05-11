dockerfile
# syntax=docker/dockerfile:1.4

############################
# Build stage
############################
FROM node:20-alpine AS builder

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

############################
# Runtime stage
############################
FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/.env.example ./.env

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["npm", "run", "start"]