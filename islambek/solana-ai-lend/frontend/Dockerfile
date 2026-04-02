FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SOLANA_RPC
ARG VITE_PROGRAM_ID

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
