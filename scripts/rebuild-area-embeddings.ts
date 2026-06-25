import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';
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

async function rebuild() {
  console.log('Starting rebuilding area_embeddings from responses...');

  // 1. Fetch all responses (select only areaId and embedding, avoid description for privacy)
  console.log('Fetching responses...');
  const allResponses = await db
    .select({
      areaId: schema.responses.areaId,
      embedding: schema.responses.embedding,
    })
    .from(schema.responses);

  console.log(`Retrieved ${allResponses.length} responses.`);

  // 2. Aggregate embeddings by area_id
  const aggregates = new Map<number, { count: number; sum: number[] }>();

  for (const resp of allResponses) {
    const areaId = resp.areaId;
    const emb = resp.embedding;

    if (!emb || emb.length === 0) {
      console.warn(`Warning: Response for area ID ${areaId} has empty embedding.`);
      continue;
    }

    if (!aggregates.has(areaId)) {
      aggregates.set(areaId, { count: 0, sum: new Array(emb.length).fill(0) });
    }

    const agg = aggregates.get(areaId)!;
    agg.count += 1;
    for (let i = 0; i < emb.length; i++) {
      agg.sum[i] += emb[i];
    }
  }

  // 3. Update or Insert (upsert) aggregates to area_embeddings
  console.log('Updating area_embeddings table...');
  const activeAreaIds = new Set<number>();

  for (const [areaId, agg] of aggregates.entries()) {
    activeAreaIds.add(areaId);

    // Check if entry already exists in area_embeddings
    const existing = await db
      .select()
      .from(schema.areaEmbeddings)
      .where(eq(schema.areaEmbeddings.areaId, areaId))
      .limit(1);

    if (existing.length === 0) {
      console.log(`- Inserting new summary for area ID ${areaId} (responses count: ${agg.count})`);
      await db.insert(schema.areaEmbeddings).values({
        areaId,
        embeddingSum: agg.sum,
        responseCount: agg.count,
        updatedAt: new Date(),
      });
    } else {
      console.log(`- Updating existing summary for area ID ${areaId} (responses count: ${agg.count})`);
      await db
        .update(schema.areaEmbeddings)
        .set({
          embeddingSum: agg.sum,
          responseCount: agg.count,
          updatedAt: new Date(),
        })
        .where(eq(schema.areaEmbeddings.areaId, areaId));
    }
  }

  // 4. Check for orphaned records in area_embeddings (where no responses exist)
  const allEmbeddings = await db.select().from(schema.areaEmbeddings);
  for (const emb of allEmbeddings) {
    if (!activeAreaIds.has(emb.areaId)) {
      console.warn(
        `WARNING: area_embeddings contains a record for area ID ${emb.areaId}, but no responses were found for this area in the database. The record was NOT modified or deleted.`
      );
    }
  }

  console.log('Rebuilding completed successfully!');
}

rebuild().catch((err) => {
  console.error('Rebuilding failed:', err);
  process.exit(1);
});
