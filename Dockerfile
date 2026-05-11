dockerfile
# syntax=docker/dockerfile:1.4

############################
# Build stage
############################
FROM node:18-alpine AS builder

# Set environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Install all dependencies (including dev) for building
COPY package*.json ./
RUN npm ci

# Copy application source files (excluding files matched by .dockerignore)
COPY . .

# Build the Next.js application
RUN npm run build

############################
# Runtime stage
############################
FROM node:18-alpine

# Set environment
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Install only production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/.env.example ./.env

# Expose the HTTP port used by the service
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/health || exit 1

# Default command
CMD ["npm", "run", "start"]