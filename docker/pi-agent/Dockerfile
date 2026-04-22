FROM node:22-bookworm-slim

RUN corepack enable

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    openssh-client \
    ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @mariozechner/pi-coding-agent \
  && command -v pi

WORKDIR /workspace

CMD ["bash"]
