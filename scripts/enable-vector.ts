import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

// Manual env loader to safely load env vars from .env.local without external dependencies
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    for (const line of envConfig.split('\n')) {
      // Ignore comments and empty lines
      if (line.trim().startsWith('#') || !line.includes('=')) continue;
      const parts = line.split('=');
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      // Only set process.env[key] if it is not already defined (keeps command-line vars)
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not set in .env.local or environment.');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function enableVector() {
  console.log('Enabling pgvector extension...');
  // Execute raw query using Neon HTTP client
  await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
  console.log('pgvector extension enabled successfully!');
}

enableVector().catch((err) => {
  console.error('Failed to enable pgvector extension:', err);
  process.exit(1);
});
