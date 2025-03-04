-- Inicializačný skript pre CDN databázu
-- Vytvorí základnú schému a demo používateľov

CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'USER');

-- Vytvor demo používateľov
INSERT INTO "users" ("id", "username", "password", "email", "role", "active", "created_at", "updated_at")
VALUES
  ('1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p', 'admin', '$2b$10$uV3nPG4rWJ3MpV9Eu/xJWOSO/HZfZ3mnX8BQRR1ASCEWu66jzMGPC', 'admin@example.com', 'ADMIN', true, NOW(), NOW()),
  ('2b3c4d5e-6f7g-8h9i-0j1k-2l3m4n5o6p7q', 'manager', '$2b$10$2xLQRZ9cEj2nxO2jWn7J8uMdMj0TVhXC1HWK38mB.zhCW7NzLMfZq', 'manager@example.com', 'MANAGER', true, NOW(), NOW()),
  ('3c4d5e6f-7g8h-9i0j-1k2l-3m4n5o6p7q8r', 'user', '$2b$10$uV3nPG4rWJ3MpV9Eu/xJWOSO/HZfZ3mnX8BQRR1ASCEWu66jzMGPC', 'user@example.com', 'USER', true, NOW(), NOW());
-- Poznámka: Heslo pre 'admin' a 'user' je 'password123', pre 'manager' je 'manager123'
-- Pre reálne nasadenie zmeniť tieto heslá a správne ich zahešovať!

-- Vytvor demo API kľúče
INSERT INTO "api_keys" ("id", "name", "key", "user_id", "active", "created_at", "expires_at")
VALUES
  ('4d5e6f7g-8h9i-0j1k-2l3m-4n5o6p7q8r9s', 'Admin API Key', 'sk_admin_1234567890abcdef1234567890abcdef', '1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p', true, NOW(), NULL),
  ('5e6f7g8h-9i0j-1k2l-3m4n-5o6p7q8r9s0t', 'Manager API Key', 'sk_manager_1234567890abcdef1234567890abcdef', '2b3c4d5e-6f7g-8h9i-0j1k-2l3m4n5o6p7q', true, NOW(), NULL),
  ('6f7g8h9i-0j1k-2l3m-4n5o-6p7q8r9s0t1u', 'User API Key', 'sk_user_1234567890abcdef1234567890abcdef', '3c4d5e6f-7g8h-9i0j-1k2l-3m4n5o6p7q8r', true, NOW(), NULL);

-- Vytvor demo webhook
INSERT INTO "webhooks" ("id", "name", "url", "secret", "user_id", "active", "created_at", "updated_at")
VALUES
  ('7g8h9i0j-1k2l-3m4n-5o6p-7q8r9s0t1u2v', 'Demo Webhook', 'https://webhook.example.com/cdn-events', 'webhook_secret_123', '1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p', true, NOW(), NOW());

-- Pridaj demo webhook eventy
INSERT INTO "webhook_events" ("id", "webhook_id", "event")
VALUES
  ('8h9i0j1k-2l3m-4n5o-6p7q-8r9s0t1u2v3w', '7g8h9i0j-1k2l-3m4n-5o6p-7q8r9s0t1u2v', 'file.created'),
  ('9i0j1k2l-3m4n-5o6p-7q8r-9s0t1u2v3w4x', '7g8h9i0j-1k2l-3m4n-5o6p-7q8r9s0t1u2v', 'file.deleted'),
  ('0j1k2l3m-4n5o-6p7q-8r9s-0t1u2v3w4x5y', '7g8h9i0j-1k2l-3m4n-5o6p-7q8r9s0t1u2v', 'version.created');

-- Vytvor základné adresáre
INSERT INTO "folders" ("id", "name", "path", "description", "is_public", "user_id", "created_at", "updated_at")
VALUES
  ('a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6', 'images', 'images', 'Adresár pre obrázky', true, '1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p', NOW(), NOW()),
  ('b2c3d4e5-f6g7-h8i9-j0k1-l2m3n4o5p6q7', 'videos', 'videos', 'Adresár pre videá', true, '1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p', NOW(), NOW()),
  ('c3d4e5f6-g7h8-i9j0-k1l2-m3n4o5p6q7r8', 'documents', 'documents', 'Adresár pre dokumenty', true, '1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p', NOW(), NOW());