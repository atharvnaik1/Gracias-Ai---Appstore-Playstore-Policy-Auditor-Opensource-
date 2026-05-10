dockerfile
# syntax=docker/dockerfile:1.4

############################
# Build stage
############################
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source files (excluding files matched by .dockerignore)
COPY . .

# Build the application
RUN npm run build

############################
# Runtime stage
############################
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy only the installed production dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the built application source code from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Expose the HTTP port used by the service
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/health || exit 1

# Default command
CMD ["npm", "start"]