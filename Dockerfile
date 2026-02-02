# Simple single-stage Dockerfile for Cloud Run
FROM node:20-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install all dependencies
RUN npm install
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy source code (explicitly to avoid .git and other problematic files)
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
COPY frontend/src ./frontend/src
COPY frontend/public ./frontend/public
COPY frontend/index.html ./frontend/
COPY frontend/tsconfig*.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/postcss.config.js ./frontend/
COPY frontend/tailwind.config.js ./frontend/

# Build frontend
RUN cd frontend && npm run build

# Build backend
RUN cd backend && npm run build

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app/backend

EXPOSE 8080

CMD ["node", "dist/index.js"]
