FROM node:22-bookworm-slim AS base

WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS runtime

ENV NODE_ENV=production
ENV PYTHON_EXECUTABLE=python3
ENV LUMORA_RUNTIME_ROLE=api

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY python-worker ./python-worker

RUN pip3 install --no-cache-dir -r python-worker/requirements.txt \
  && ln -sf /usr/bin/python3 /usr/local/bin/python

EXPOSE 5000

CMD ["sh", "-c", "npm run start:${LUMORA_RUNTIME_ROLE}"]
