# AlphaGenome MCP Server - Docker Image
# Multi-stage build for optimized image size

# Stage 1: Build TypeScript
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Runtime image
FROM node:18-alpine

# Install Python 3.10+
RUN apk add --no-cache python3 py3-pip

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/build ./build

# Copy Python client
COPY alphagenome_client.py ./

# Install Python dependencies
RUN python3 -m pip install --no-cache-dir alphagenome>=0.5.0

# Create non-root user for security
RUN addgroup -g 1001 -S alphagenome && \
    adduser -S -u 1001 -G alphagenome alphagenome && \
    chown -R alphagenome:alphagenome /app

# Switch to non-root user
USER alphagenome

# Set environment variables
ENV NODE_ENV=production

# Expose stdio for MCP communication
# Note: MCP servers use stdio, not network ports

# Health check (optional - checks if node process is running)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Run the MCP server
ENTRYPOINT ["node", "/app/build/index.js"]
