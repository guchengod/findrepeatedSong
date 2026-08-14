# Build Backend
FROM golang:1.26-alpine AS backend-builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# CGO_ENABLED=0 is important as taglib uses wazero (Wasm)
RUN CGO_ENABLED=0 go build -o main .

# Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Final Stage
FROM alpine:latest
# Install ffmpeg and ffprobe for robust duration detection and metadata writing
RUN apk add --no-cache ca-certificates ffmpeg
WORKDIR /app
COPY --from=backend-builder /app/main .
# Vite writes its production output to ../backend/static relative to /app.
COPY --from=frontend-builder /backend/static ./static
EXPOSE 8080
CMD ["./main"]
