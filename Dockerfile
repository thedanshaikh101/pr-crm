# Single image for the web app and the worker. Keeps the full node_modules so
# prisma migrate deploy, next start and tsx (worker) all run without extra installs.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
RUN mkdir -p /app/.storage
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
