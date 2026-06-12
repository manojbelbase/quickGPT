FROM node:22-alpine

WORKDIR /app

COPY package*.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 5005

CMD ["pnpm", "start"]