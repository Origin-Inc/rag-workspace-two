# syntax = docker/dockerfile:1

# Base image
ARG NODE_VERSION=20.11.0
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="Remix"

# Install openssl for Prisma
RUN apt-get update -qq && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

# Set production environment
ENV NODE_ENV="production"

# Install pnpm
ARG PNPM_VERSION=8.14.1
RUN npm install -g pnpm@$PNPM_VERSION

WORKDIR /app

# Build stage
FROM base as build

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Production stage
FROM base

# Copy built application
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build
COPY --from=build /app/public /app/public
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/prisma /app/prisma

# Add a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 remix

USER remix

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]