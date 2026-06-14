FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:5005/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json pnpm-workspace.yaml ./

RUN corepack enable && pnpm install

COPY . .

RUN pnpm build

FROM nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]