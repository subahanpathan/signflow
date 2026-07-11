# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci
COPY backend/ ./
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production
COPY --from=builder /app/backend/dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.js"]
