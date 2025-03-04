#!/bin/sh

# Skontroluj, či je `psql` dostupný
which psql || (echo "psql not found, exiting" && exit 1)

echo "Waiting for database to be ready..."
# Jednoduchá kontrola pripravenosti - čakaj, kým je PostgreSQL pripravený prijímať pripojenia
until PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c '\q'; do
  >&2 echo "PostgreSQL is unavailable - sleeping 1s"
  sleep 1
done

echo "Database is ready, initializing..."
npx prisma db push

echo "Starting API server..."
node dist/index.js