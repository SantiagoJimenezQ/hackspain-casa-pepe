# Casa Pepe API for a long-running host (Railway, Render, Fly, any Docker VM).
# The agent, the simulation clock and the ElevenLabs call polling need a process
# that stays alive between requests, which serverless functions do not provide.
FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/tools/package.json packages/tools/
RUN pnpm install --frozen-lockfile --filter @casa-pepe/server...
COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm --filter @casa-pepe/server build

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/tools/package.json packages/tools/
RUN pnpm install --frozen-lockfile --prod --filter @casa-pepe/server...
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/server/dist ./apps/server/dist
WORKDIR /workspace/apps/server
# Railway injects PORT; the API reads it and serves /api and /documentation
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/bootstrap"]
