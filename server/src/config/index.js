import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from server root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/hemosync_db?schema=public',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'hemosync_jwt_dev_secret_replace_in_production_min_32_chars',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'hemosync_refresh_token_dev_secret_replace_in_production',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
  }
};

