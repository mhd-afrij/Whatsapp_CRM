# Frontend (Next.js 14+ App Router)
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so they
# must be present as build arguments. Render passes a service's env vars to the
# Docker build automatically; declaring each ARG and promoting it to ENV before
# `next build` is what makes the deployed bundle point at the right API/Socket
# URLs (docker-compose builds without them and falls back to localhost).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_WHATSAPP_COUNTRY_CODE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_WHATSAPP_COUNTRY_CODE=$NEXT_PUBLIC_WHATSAPP_COUNTRY_CODE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# Bind to the port Render routes traffic to ($PORT, default 10000), falling back
# to 3000 for docker-compose.
CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]
