FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# uploads dir for file sharing
RUN mkdir -p uploads

EXPOSE 5000
CMD ["node", "src/index.js"]