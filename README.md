# Vysokovýkonná CDN s pokročilými funkciami

Kompletné riešenie pre CDN (Content Delivery Network) s pokročilými funkciami pre správu obsahu vrátane verziovania súborov, webhookov, spracovania obrázkov a monitoringu.

## Architektúra

Riešenie pozostáva z nasledujúcich komponentov:

1. **Nginx CDN Server** - Vysokovýkonný server pre statický obsah
2. **CDN Management API** - REST API pre správu obsahu s pokročilými funkciami
3. **PostgreSQL** - Databáza pre metadáta, používateľov a štatistiky
4. **Redis** - Cache a fronty pre spracovanie asynchrónnych úloh
5. **Prometheus & Grafana** - Monitoring a vizualizácia metrík
6. **Traefik** - Reverse proxy pre smerovanie požiadaviek a zabezpečenie

## Pokročilé funkcie

### 1. Verziovanie súborov

Systém automaticky udržiava históriu verzií súborov, čo umožňuje:

- Sledovanie histórie zmien súborov
- Obnovenie súboru na predchádzajúcu verziu
- Porovnanie verzií a zobrazenie rozdielov
- Správu verzií (mazanie, archivácia)

### 2. Webhooky pre notifikácie

Systém podporuje integráciu s externými službami pomocou webhookov:

- Notifikácie o udalostiach (nahranie, aktualizácia, vymazanie)
- Bezpečná autentifikácia pomocou signatúr (HMAC)
- Asynchrónne spracovanie a retry mechanizmus
- Logovanie histórie webhookov

### 3. On-the-fly spracovanie obrázkov

Integrované funkcie pre transformáciu obrázkov:

- Preddefinované varianty (thumbnail, small, medium, large)
- Dynamické vytváranie variant s rôznymi parametrami (veľkosť, formát, kvalita)
- Konverzia medzi formátmi (JPEG, PNG, WebP, AVIF)
- Optimalizácia pre rôzne zariadenia
- Cachovanie variant pre vyšší výkon

### 4. Monitoring a štatistiky

Rozsiahle monitorovacie funkcie:

- Real-time monitorovanie v Grafana dashboardoch
- Prometheus metriky pre výkon a využitie
- Analytika prístupov k súborom
- Podrobné štatistiky (počet stiahnutí, unikátni používatelia, referery)
- Alerting pre kritické stavy

## Štruktúra projektu

```
.
├── cdn-api/                   # REST API pre správu obsahu
│   ├── prisma/                # Prisma databázový model
│   ├── src/                   # Zdrojový kód API
│   ├── Dockerfile             # Dockerfile pre API
│   ├── package.json           # NPM konfigurácia
│   └── tsconfig.json          # TypeScript konfigurácia
├── nginx/                     # Nginx CDN server
│   ├── Dockerfile             # Dockerfile pre Nginx CDN
│   └── nginx.conf             # Nginx konfigurácia
├── prometheus/                # Prometheus konfigurácia
│   └── prometheus.yml         # Konfiguračný súbor
├── grafana/                   # Grafana konfigurácia
│   └── provisioning/          # Automatické nastavenie dashboardov
├── traefik/                   # Traefik konfigurácia
│   ├── cdn.yml                # Konfigurácia pre CDN
│   └── cdn-api.yml            # Konfigurácia pre API
├── init-db/                   # Inicializačné SQL scripty pre PostgreSQL
├── static/                    # Zdieľaný adresár pre statické súbory
├── docker-compose.yml         # Docker Compose konfigurácia
└── README.md                  # Dokumentácia
```

## Inštalácia a spustenie

### Príprava

1. Uistite sa, že máte nainštalovaný Docker a Docker Compose
2. Vytvorte potrebné adresáre:

```bash
mkdir -p ./static
mkdir -p ./init-db
mkdir -p ./prometheus
mkdir -p ./grafana/provisioning/dashboards
mkdir -p ./grafana/provisioning/datasources
```

### Konfigurácia

1. Upravte `.env` súbor s vašimi nastaveniami:

```
# Databázové nastavenia
DB_USER=cdnuser
DB_PASSWORD=securepassword123
DB_NAME=cdn

# Redis nastavenia
REDIS_PASSWORD=redispassword123

# JWT Secret
JWT_SECRET=your-very-secure-jwt-secret-key-change-in-production

# Features
ENABLE_WEBHOOKS=true
ENABLE_VERSIONING=true
ENABLE_IMAGE_PROCESSING=true
ENABLE_MONITORING=true

# Grafana nastavenia
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=grafanapassword
```

2. Upravte domény v Traefik konfigurácii:

```yaml
# traefik/cdn.yml
rule: 'Host(`cdn.vasadomena.com`)'

# traefik/cdn-api.yml
rule: 'Host(`api.cdn.vasadomena.com`)'
```

### Spustenie

```bash
docker-compose up -d
```

Všetky potrebné služby sa automaticky spustia a nakonfigurujú. Pri prvom spustení sa vytvorí databázová schéma a demo používatelia.

## Používanie API

### Autentifikácia

```bash
# Prihlásenie a získanie JWT tokenu
curl -X POST https://api.cdn.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
```

### Správa súborov

```bash
# Nahranie súboru
curl -X POST https://api.cdn.example.com/api/files \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@./cesta/k/suboru.jpg" \
  -F "path=images" \
  -F "metadata={\"description\":\"Popis súboru\",\"tags\":[\"tag1\",\"tag2\"]}"
```

### Verziovanie

```bash
# Zobrazenie verzií súboru
curl -X GET https://api.cdn.example.com/api/versions/file/FILE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Obnovenie na staršiu verziu
curl -X POST https://api.cdn.example.com/api/versions/file/FILE_ID/2/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Varianty obrázkov

```bash
# Získanie thumbnail varianty
curl -X GET https://api.cdn.example.com/api/variants/file/FILE_ID/thumbnail \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Vytvorenie vlastnej varianty
curl -X POST https://api.cdn.example.com/api/variants/file/FILE_ID/custom \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"width":800,"height":600,"format":"webp","quality":80,"crop":true}'
```

### Webhooky

```bash
# Vytvorenie webhoku
curl -X POST https://api.cdn.example.com/api/webhooks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Webhook",
    "url": "https://moj-server.com/callback",
    "secret": "webhook_secret_123",
    "events": ["file.created", "file.deleted"]
  }'
```

### Štatistiky

```bash
# Získanie štatistík prístupu k súboru
curl -X GET https://api.cdn.example.com/api/stats/file/FILE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Získanie systémových štatistík
curl -X GET https://api.cdn.example.com/api/stats/system \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Prístup k monitoringu

- **Grafana Dashboard**: http://grafana.vasadomena.com (alebo localhost:3000)
  - Používateľské meno: admin
  - Heslo: grafanapassword (alebo hodnota z .env)

- **Prometheus**: http://prometheus.vasadomena.com (alebo localhost:9090)

## Bezpečnostné odporúčania pre produkciu

1. Zmeňte všetky predvolené heslá
2. Použite vlastný SSL certifikát cez Traefik (Let's Encrypt)
3. Pravidelne zálohujte databázu a obsah
4. Aktivujte rate limiting v Traefik pre ochranu API
5. Nastavte monitoring alertov v Grafana

## Rozšírenia a prispôsobenia

Riešenie je modulárne a môžete ho ďalej rozšíriť a prispôsobiť:

### Podpora pre S3-kompatibilné úložisko

Pre väčšie nasadenia môžete integrovať S3-kompatibilné úložiská:

```typescript
// Príklad implementácie S3 providera
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

async function uploadToS3(buffer, key, contentType) {
  const client = new S3Client({ region: process.env.S3_REGION });
  await client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));
}
```

### Automatické tagovanie obsahu pomocou AI

```typescript
import { ImageAnnotatorClient } from '@google-cloud/vision';

async function autoTagImage(filePath) {
  const client = new ImageAnnotatorClient();
  const [result] = await client.labelDetection(filePath);
  return result.labelAnnotations.map(label => label.description);
}
```

### Implementácia verziovania pomocou Git LFS

Pre sofistikovanejšie verziovanie môžete integrovať Git LFS:

```bash
# Príklad použitia Git LFS pre verziovanie
git lfs track "*.jpg" "*.png" "*.mp4"
git lfs install
```

### Geografická distribúcia obsahu

Pre globálne nasadenie môžete implementovať geograficky distribuovanú CDN:

```yaml
# Príklad konfigurácie pre multi-region
cdn-europe:
  image: cdnapi
  environment:
    - REGION=europe
    - STORAGE_PATH=/storage/europe

cdn-asia:
  image: cdnapi
  environment:
    - REGION=asia
    - STORAGE_PATH=/storage/asia
```

## Vývojový proces

### Lokálny vývoj

Pre lokálny vývoj API použite:

```bash
cd cdn-api
npm install
npm run dev
```

### Testovanie

Spustenie testov:

```bash
cd cdn-api
npm test
```

### Nasadenie nových verzií

1. Aktualizujte kód a buildnite nové Docker images
2. Aktualizujte docker-compose.yml s novými verziami
3. Spustite postupný deployment:

```bash
docker-compose up -d --no-deps --build cdn-api
```

## Podpora a prispievanie

- **Hlásenie problémov**: Vytvorte issue v repozitári GitHub
- **Vylepšenia**: Pull requesty sú vítané
- **Dokumentácia**: Aktualizácie dokumentácie sú veľmi cenené

## Licencia

MIT

## Autori

- Hlavný developer: [Meno]
- Prispievatelia: [Zoznam]

## Poďakovanie

Špeciálne poďakovanie patrí autorom použitých open-source knižníc a nástrojov:
- Hono
- Sharp
- Prisma
- Prometheus
- Grafana
- a mnohým ďalším

---

© 2025 CDN Project Team