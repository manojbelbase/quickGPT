FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm build

FROM node:22-alpine AS runtime

WORKDIR /app

COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && pnpm install --prod

COPY --from=builder /app/dist ./dist

EXPOSE 5005

CMD ["node", "dist/server.js"]