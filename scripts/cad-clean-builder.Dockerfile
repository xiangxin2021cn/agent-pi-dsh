FROM emscripten/emsdk:4.0.12-x64@sha256:744fb6a68941970951bacf9d6632041a0398260492232691ef22bbf54b0585c6

USER root

# These are the Ubuntu 22.04 package versions used to regenerate LibreDWG's
# Autotools files. Keeping them explicit turns repository drift into a hard
# failure instead of silently changing the native build inputs.
RUN apt-get -qq update \
  && DEBIAN_FRONTEND=noninteractive apt-get -qq install -y --no-install-recommends \
    autoconf=2.71-2 \
    automake=1:1.16.5-1.3 \
    libtool=2.4.6-15build2 \
    pkg-config=0.29.2-1ubuntu3 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare pnpm@10.33.4 --activate \
  && test "$(pnpm --version)" = "10.33.4" \
  && test "$(node --version)" = "v22.16.0" \
  && emcc --version | head -n 1 | grep -F " 4.0.12"

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC

WORKDIR /workspace
