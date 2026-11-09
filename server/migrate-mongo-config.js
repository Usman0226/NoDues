import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const uri = process.env.MIGRATION_MONGO_URI || process.env.MONGODB_URI;

const config = {
  mongodb: {
    url: uri,
    options: {
      serverSelectionTimeoutMS: 10000,
    },
  },
  migrationsDir: path.resolve(__dirname, 'migrations'),
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm',
};

export default config;
