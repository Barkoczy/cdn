/**
 * Konfigurácia aplikácie
 */

// Databázové pripojenie
const getDatabaseUrl = () => {
  const { POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD } = process.env;
  return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
};

// Konfigurácia Redis
const getRedisConfig = () => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD || ''
  };
};

// Povolené funkcie
const getFeaturesConfig = () => {
  return {
    webhooks: process.env.ENABLE_WEBHOOKS === 'true',
    versioning: process.env.ENABLE_VERSIONING === 'true',
    imageProcessing: process.env.ENABLE_IMAGE_PROCESSING === 'true',
    monitoring: process.env.ENABLE_MONITORING === 'true'
  };
};

export const config = {
  // Server settings
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  environment: process.env.NODE_ENV || 'development',

  // Storage settings
  storagePath: process.env.STORAGE_PATH || '/usr/share/nginx/html',
  maxFileSize: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) : 100 * 1024 * 1024, // 100MB

  // Security settings
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',

  // CORS settings
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '*').split(','),

  // Upload settings
  allowedMimeTypes: [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/tiff', 'image/avif',
    // Videos
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
    // Audio
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/flac',
    // Documents
    'application/pdf', 'application/json', 'application/xml', 'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'application/msword', // doc
    'application/vnd.ms-excel', // xls
    'application/vnd.ms-powerpoint', // ppt
    // Text
    'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
    'application/javascript'
  ],

  // Database settings
  database: {
    url: getDatabaseUrl()
  },

  // Redis settings
  redis: getRedisConfig(),

  // Feature flags
  features: getFeaturesConfig(),

  // Security features
  security: {
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  }
};
