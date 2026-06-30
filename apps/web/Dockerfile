FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# No per-package lockfile in this monorepo (root lockfile only), so use install, not ci.
RUN npm install
COPY . .
RUN npm run build

# nginx-unprivileged runs as the non-root "nginx" user (uid 101) and listens on 8080.
FROM nginxinc/nginx-unprivileged:alpine AS runner
USER root
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
