FROM node:20-alpine

WORKDIR /app

# Install libc6-compat for native binary compatibility
RUN apk add --no-cache libc6-compat curl

# Install dependencies based on package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source code
COPY . .

ENV PORT=3100
ENV HOSTNAME="0.0.0.0"

EXPOSE 3100

# Default to development server for fast local testing
CMD ["npm", "run", "dev"]
