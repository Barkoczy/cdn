FROM node:18-alpine AS build

WORKDIR /app

# Kopíruj package.json a package-lock.json
COPY package*.json ./

# Inštaluj závislosti
RUN npm ci

# Kopíruj zdrojový kód a Prisma schému
COPY . .

# Aktualizuj Prisma schému pre správny binaryTarget
RUN sed -i 's/provider *= *"prisma-client-js"/provider = "prisma-client-js"\n  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]/' prisma/schema.prisma

# Generuj Prisma klienta
RUN npx prisma generate

# Buildni aplikáciu
RUN npm run build

FROM node:18-alpine AS runtime

WORKDIR /app

# Inštaluj OpenSSL pre Prisma
RUN apk add --no-cache openssl postgresql-client

# Kopíruj package.json a package-lock.json
COPY package*.json ./

# Inštaluj len produkčné závislosti
RUN npm ci --omit=dev

# Kopíruj buildnutú aplikáciu
COPY --from=build /app/dist ./dist

# Kopíruj Prisma artefakty
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# Kopíruj Prisma schému
COPY --from=build /app/prisma ./prisma

# Kopíruj init script
COPY ./scripts/init.sh /app/init.sh
RUN chmod +x /app/init.sh

# Vystav port 3000
EXPOSE 3000

# Spusti init skript
CMD ["/app/init.sh"]