dockerfile
# syntax=docker/dockerfile:1.4

############################
# Build stage
############################
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source files (excluding files matched by .dockerignore)
COPY . .

############################
# Runtime stage
############################
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy only the installed production dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the application source code from the builder stage
COPY --from=builder /app ./

# Expose the HTTP port used by the service
EXPOSE 3000

# Default command
CMD ["npm", "start"]