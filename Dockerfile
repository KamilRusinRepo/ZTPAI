FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
USER node

CMD ["sh", "-c", "./node_modules/.bin/knex migrate:latest && exec node src/server.js"]
