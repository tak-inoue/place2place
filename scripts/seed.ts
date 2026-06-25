import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema';
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
const db = drizzle(sql, { schema });

const initialAreas = [
  '下北沢', '吉祥寺', '高円寺', '中野', '渋谷', '原宿', '新宿', '池袋', '上野', '浅草',
  '神楽坂', '清澄白河', '代官山', '自由が丘', '二子玉川', '赤羽', '北千住', '巣鴨', '秋葉原', '六本木',
  '三軒茶屋', '中目黒', '恵比寿', '品川', '丸の内', '日本橋', '銀座', '蒲田', '錦糸町', '荻窪',
];

async function seed() {
  console.log('Seeding areas...');
  for (const name of initialAreas) {
    // ON CONFLICT DO NOTHING to prevent duplicate keys while keeping existing responses intact
    await db.insert(schema.areas)
      .values({ name })
      .onConflictDoNothing();
    console.log(`- Check/Insert: ${name}`);
  }
  console.log('Seeding completed successfully!');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
