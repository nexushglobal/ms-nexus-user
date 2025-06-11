# User Microservice Dockerfile with pnpm
FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable pnpm

# Dependencies stage
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY .npmrc* ./

RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY .npmrc* ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs

COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

USER nestjs

EXPOSE 3001

CMD ["node", "dist/main"]