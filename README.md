# Jednoduchá CDN pomocou Nginx a Docker

Táto CDN slúži na efektívne servírovanie statických súborov (obrázky, videá, JSON) s vysokým výkonom a optimalizovaným cachovaním.

## Štruktúra projektu

```
.
├── Dockerfile           # Dockerfile pre Nginx kontajner
├── docker-compose.yml   # Docker Compose konfigurácia
├── nginx.conf           # Nginx konfigurácia
└── static/              # Adresár so statickými súbormi (namapovaný ako volume)
```

## Inštalácia a spustenie

1. Vytvorte adresár pre statické súbory:

```bash
mkdir static
```

2. Umiestnite statické súbory do adresára `static`.

3. Spustite CDN:

```bash
docker-compose up -d
```

## Použitie

Po spustení budú súbory dostupné priamo z koreňového adresára:

- Obrázky: `http://localhost/nazov-obrazku.jpg`
- Videá: `http://localhost/nazov-videa.mp4`
- JSON súbory: `http://localhost/nazov-suboru.json`

## Vlastnosti

- **Automatická synchronizácia**: Zmeny v adresári `static/` sa automaticky prejavia v CDN
- **Optimalizované cachovanie**: Rôzne stratégie cachovania pre rôzne typy súborov na základe prípon
- **Podpora streamovania**: Optimalizovaná konfigurácia pre streamovanie videí
- **CORS podpora**: Všetky statické súbory majú povolené CORS hlavičky
- **Kompresia**: Zapnutá Gzip kompresia pre zlepšenie rýchlosti načítavania
- **Prehľadávanie adresárov**: Zapnuté zobrazovanie obsahu adresárov

## Rozšírenia a úpravy

Pre úpravu konfigurácie Nginx môžete editovať súbor `nginx.conf`. Zmeny sa prejavia po reštarte kontajnera:

```bash
docker-compose restart
```

## Monitorovanie

Kontrola zdravia servera je dostupná na:

```
http://localhost/health
```