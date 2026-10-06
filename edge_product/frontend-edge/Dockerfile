FROM node:22-alpine AS build
WORKDIR /src
COPY frontend-edge/package.json frontend-edge/package-lock.json ./
RUN npm ci
COPY frontend-edge/ ./
ENV VITE_API_BASE_URL=/api
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:stable-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/ /usr/share/nginx/html/
COPY production/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY production/docker-entrypoint.sh /docker-entrypoint.d/40-generate-default-conf.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-generate-default-conf.sh && chmod +x /docker-entrypoint.d/40-generate-default-conf.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
