FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates && pip3 install --break-system-packages --no-cache-dir yt-dlp && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p downloads && chown -R node:node /app
USER node
ENV PORT=5000
EXPOSE 5000
CMD ["npm", "start"]
