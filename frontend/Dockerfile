FROM node:22-alpine

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:5005/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json pnpm-workspace.yaml ./

RUN corepack enable && pnpm install

COPY . .

RUN pnpm build

EXPOSE 4173

CMD ["pnpm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]