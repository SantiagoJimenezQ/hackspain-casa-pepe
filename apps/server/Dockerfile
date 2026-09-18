FROM public.ecr.aws/docker/library/node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml package.json ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "start"]
