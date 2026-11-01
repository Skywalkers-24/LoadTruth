# LoadTruth frontend — Next.js 16 standalone output.
# syntax=docker/dockerfile:1

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next standalone bakes the rewrite destination at build time, so BACKEND_URL
# must be present during `next build` (compose passes it as a build arg). It is
# also set at runtime for belt-and-suspenders.
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=${BACKEND_URL}
# NEXT_PUBLIC_* vars are inlined at build time, so judge mode is chosen when the
# image is built. Defaults to the normal console.
ARG NEXT_PUBLIC_APP_MODE=default
ENV NEXT_PUBLIC_APP_MODE=${NEXT_PUBLIC_APP_MODE}
ARG NEXT_PUBLIC_JUDGE_TICKET_ID=
ENV NEXT_PUBLIC_JUDGE_TICKET_ID=${NEXT_PUBLIC_JUDGE_TICKET_ID}
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN useradd --create-home --uid 10001 appuser
# Next standalone output ships a minimal server + only required node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER appuser
EXPOSE 3000
CMD ["sh", "-c", "node server.js"]
