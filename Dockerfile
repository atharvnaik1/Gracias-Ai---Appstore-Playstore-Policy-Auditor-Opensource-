FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npm run build

# IMPORTANT FIX ↓↓↓
RUN cp -r .next/static .next/standalone/.next/ && \
    cp -r public .next/standalone/

WORKDIR /app/.next/standalone

EXPOSE 8080

CMD ["node", "server.js"]