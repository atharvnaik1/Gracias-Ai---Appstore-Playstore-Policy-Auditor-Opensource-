dockerfile
# Dockerfile for Node 20 Alpine
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

# Expose application port
EXPOSE 3000

# Run the application
CMD ["npm", "start"]