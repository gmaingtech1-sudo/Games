# Build from the jarvis-ai/ folder (not backend/) so the web UI is included:
#   docker build -f backend/Dockerfile -t jarvis-backend .
FROM node:22.22.0-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=8787 WEB_UI_DIR=/app/shared/ui
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY shared/ui /app/shared/ui
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
