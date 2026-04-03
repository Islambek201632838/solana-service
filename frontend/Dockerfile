FROM node:20-slim AS build

WORKDIR /app

ARG VITE_API_URL=""
ARG VITE_WS_URL=""
ARG VITE_SOLANA_RPC
ARG VITE_PROGRAM_ID

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_SOLANA_RPC=$VITE_SOLANA_RPC
ENV VITE_PROGRAM_ID=$VITE_PROGRAM_ID

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx tsc -b && npx vite build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
