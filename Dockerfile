# Giai đoạn 1: Cài đặt dependencies
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Giai đoạn 2: Build ứng dụng
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Tạo Prisma Client
RUN npx prisma generate
# Build Next.js ở chế độ standalone
RUN npm run build

# Giai đoạn 3: Chạy ứng dụng
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Tắt telemetry để tăng tốc
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy các file cần thiết từ giai đoạn builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8006
ENV PORT=8006

# Chạy đồng bộ Database rồi mới khởi động app
CMD npx prisma db push && node server.js
