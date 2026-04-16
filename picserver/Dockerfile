FROM node:20-alpine

WORKDIR /app

RUN npm init -y && npm install express multer

COPY server.js .

RUN mkdir -p /data

EXPOSE 9000

CMD ["node", "server.js"]
