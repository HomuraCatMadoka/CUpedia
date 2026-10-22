# syntax=docker/dockerfile:1.7
# The upstream registries no longer serve these community releases publicly.
# Build the same releases from checksum-verified, immutable official sources.
# Server: RELEASE.2025-09-07T16-13-09Z.
FROM golang:1.24.7-alpine3.22 AS server-build
ADD --checksum=sha256:8819e3e7817e46b7b3798f8f200ead208562e571563c2e040352378031abe9f2 \
    https://codeload.github.com/minio/minio/tar.gz/07c3a429bfed433e49018cb0f78a52145d4bedeb /tmp/source.tar.gz
WORKDIR /src
RUN tar -xzf /tmp/source.tar.gz --strip-components=1
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -p 2 -trimpath -buildvcs=false -o /out/minio .

# Client: RELEASE.2025-08-13T08-35-41Z.
FROM golang:1.24.7-alpine3.22 AS client-build
ADD --checksum=sha256:95cd293c7119f16921a6dc515a1fb74a2227f19fd994b9c8b770a154e802ac44 \
    https://codeload.github.com/minio/mc/tar.gz/7394ce0dd2a80935aded936b09fa12cbb3cb8096 /tmp/source.tar.gz
WORKDIR /src
RUN tar -xzf /tmp/source.tar.gz --strip-components=1
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -p 2 -trimpath -buildvcs=false -o /out/mc .

FROM alpine:3.22 AS runtime
RUN apk add --no-cache ca-certificates curl

FROM runtime AS server
COPY --from=server-build /out/minio /usr/local/bin/minio
COPY --from=server-build /src/LICENSE /licenses/minio-LICENSE
ENTRYPOINT ["minio"]

FROM runtime AS client
COPY --from=client-build /out/mc /usr/local/bin/mc
COPY --from=client-build /src/LICENSE /licenses/mc-LICENSE
ENTRYPOINT ["mc"]
