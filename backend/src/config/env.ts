import dotenv from 'dotenv';
dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    // In mock/dev mode we don't hard-crash on missing 3rd-party keys,
    // but core infra vars must exist.
    return '';
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  API_BASE_URL: required('API_BASE_URL', 'http://localhost:4000'),
  FRONTEND_URL: required('FRONTEND_URL', 'http://localhost:3000'),

  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL', 'redis://localhost:6379'),

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET', 'dev_access_secret_change_me'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
  JWT_ACCESS_EXPIRES_IN: required('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: required('JWT_REFRESH_EXPIRES_IN', '30d'),

  ENCRYPTION_KEY: required('ENCRYPTION_KEY', 'dev_32_char_encryption_key_0000'),

  CINETPAY: {
    apiKey: required('CINETPAY_API_KEY'),
    siteId: required('CINETPAY_SITE_ID'),
    secretKey: required('CINETPAY_SECRET_KEY'),
    mode: required('CINETPAY_MODE', 'mock'),
  },
  WAVE: {
    apiKey: required('WAVE_API_KEY'),
    mode: required('WAVE_MODE', 'mock'),
  },
  ORANGE_MONEY: {
    clientId: required('ORANGE_MONEY_CLIENT_ID'),
    clientSecret: required('ORANGE_MONEY_CLIENT_SECRET'),
    mode: required('ORANGE_MONEY_MODE', 'mock'),
  },
  MTN_MOMO: {
    apiKey: required('MTN_MOMO_API_KEY'),
    userId: required('MTN_MOMO_USER_ID'),
    subscriptionKey: required('MTN_MOMO_SUBSCRIPTION_KEY'),
    mode: required('MTN_MOMO_MODE', 'mock'),
  },
  // Réservé à la future API de paiement que Ria enverra après la fin du projet.
  // Voir CustomPaymentAdapter.ts pour la marche à suivre - un seul fichier à remplir.
  CUSTOM_PAYMENT: {
    apiKey: required('CUSTOM_PAYMENT_API_KEY'),
    baseUrl: required('CUSTOM_PAYMENT_BASE_URL'),
    mode: required('CUSTOM_PAYMENT_MODE', 'mock'),
  },
  WHATSAPP: {
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: required('WHATSAPP_ACCESS_TOKEN'),
    verifyToken: required('WHATSAPP_VERIFY_TOKEN', 'ridia_webhook_verify'),
    mode: required('WHATSAPP_MODE', 'mock'),
  },
  SENDGRID: {
    apiKey: required('SENDGRID_API_KEY'),
    fromEmail: required('SENDGRID_FROM_EMAIL', 'no-reply@ridia-store.com'),
    mode: required('SENDGRID_MODE', 'mock'),
  },
  STORAGE: {
    provider: required('STORAGE_PROVIDER', 's3'),
    s3AccessKey: required('AWS_S3_ACCESS_KEY'),
    s3SecretKey: required('AWS_S3_SECRET_KEY'),
    s3Bucket: required('AWS_S3_BUCKET', 'ridia-store-images'),
    s3Region: required('AWS_S3_REGION', 'eu-west-1'),
    bunnyApiKey: required('BUNNY_API_KEY'),
    bunnyStorageZone: required('BUNNY_STORAGE_ZONE'),
    bunnyPullZoneUrl: required('BUNNY_PULL_ZONE_URL'),
  },
  CONNECTORS: {
    alibaba1688Mode: required('ALIBABA_1688_MODE', 'manual'),
    alibaba1688AppKey: required('ALIBABA_1688_APP_KEY'),
    alibaba1688AppSecret: required('ALIBABA_1688_APP_SECRET'),
    taobaoAppKey: required('TAOBAO_APP_KEY'),
    taobaoAppSecret: required('TAOBAO_APP_SECRET'),
    pinduoduoClientId: required('PINDUODUO_CLIENT_ID'),
    pinduoduoClientSecret: required('PINDUODUO_CLIENT_SECRET'),
  },
  CNY_TO_XOF_RATE: parseFloat(process.env.CNY_TO_XOF_RATE || '90'),

  TRANSLATION: {
    deeplApiKey: required('DEEPL_API_KEY'),
    mode: required('TRANSLATION_MODE', 'mock'),
    defaultTargetLang: required('TRANSLATION_DEFAULT_TARGET_LANG', 'fr'),
  },

  // Agent IA de catégorisation automatique (Claude API) - voir CategorySuggestionAgent.ts
  AI_AGENT: {
    apiKey: required('ANTHROPIC_API_KEY'),
    mode: required('AI_AGENT_MODE', 'mock'),
  },

  SINOBURK: {
    apiUrl: required('SINOBURK_API_URL'),
    apiKey: required('SINOBURK_API_KEY'),
  },

  SENTRY_DSN: required('SENTRY_DSN'),

  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),

  // Nombre de produits traités en parallèle par le worker d'import. Pour un catalogue
  // de plusieurs centaines de milliers/millions de produits, augmente cette valeur ET
  // lance plusieurs conteneurs "worker" en parallèle (docker-compose up --scale worker=4).
  IMPORT_WORKER_CONCURRENCY: parseInt(process.env.IMPORT_WORKER_CONCURRENCY || '10', 10),
};

export const isProd = env.NODE_ENV === 'production';
