FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++ linux-headers eudev-dev

WORKDIR /app

ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SOLANA_RPC
ARG VITE_PROGRAM_ID

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
