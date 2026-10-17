# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend and backend
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# sharp needs libvips on Alpine
RUN apk add --no-cache libc6-compat vips

# Copy built assets and dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create a non-root user and switch to it
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Set environment to production
ENV NODE_ENV=production

# Expose the default Cloud Run port
EXPOSE 8080
ENV PORT=8080

# Start the Express server
CMD ["npm", "run", "start"]
