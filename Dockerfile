# syntax=docker/dockerfile:1.7
FROM node:24.20.0-bookworm-slim

ARG DEV_UID=1000
ARG DEV_GID=1000

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_HOME="/tmp/wmul-corepack"

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=wmul-pnpm,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

COPY . .

RUN mkdir -p /tmp/wmul-home /tmp/wmul-corepack && \
	chown -R "${DEV_UID}:${DEV_GID}" /app /tmp/wmul-home /tmp/wmul-corepack

ENV HOME=/tmp/wmul-home
USER ${DEV_UID}:${DEV_GID}

EXPOSE 5173

CMD ["pnpm", "dev:container"]
