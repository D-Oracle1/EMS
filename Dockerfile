# Hylink Finance EMS - Multi-stage Dockerfile

# Stage 1: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/
RUN npm ci --workspace=packages/backend
COPY packages/backend ./packages/backend
WORKDIR /app/packages/backend
RUN npx prisma generate
RUN npm run build

# Stage 2: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
COPY packages/frontend/package*.json ./packages/frontend/
RUN npm ci --workspace=packages/frontend
COPY packages/frontend ./packages/frontend
WORKDIR /app/packages/frontend
RUN npm run build

# Stage 3: Production Backend
FROM node:20-alpine AS backend
WORKDIR /app
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
COPY --from=backend-builder /app/packages/backend/dist ./dist
COPY --from=backend-builder /app/packages/backend/node_modules ./node_modules
COPY --from=backend-builder /app/packages/backend/prisma ./prisma
COPY --from=backend-builder /app/packages/backend/package.json ./
EXPOSE 3000
USER node
CMD ["dumb-init", "node", "dist/index.js"]

# Stage 4: Production Frontend (Nginx)
FROM nginx:alpine AS frontend
COPY --from=frontend-builder /app/packages/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
