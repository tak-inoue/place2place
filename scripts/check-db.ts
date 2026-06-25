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
const dbUrl: string = databaseUrl;

// Extract database name from connection string securely (avoid showing credentials)
function getSafeDbInfo(url: string): string {
  try {
    // Standard connection format: postgresql://[user]:[password]@[host]:[port]/[dbname]?options
    const parsed = new URL(url);
    const dbName = parsed.pathname.substring(1);
    const hostName = parsed.hostname;
    // Only return the database name and a masked host for sanity check
    const maskedHost = hostName.substring(0, 4) + '...' + hostName.substring(hostName.length - 8);
    return `DB Name: "${dbName}" (Host: ${maskedHost})`;
  } catch {
    // Fallback if URL parsing fails
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1] || '';
    const dbName = lastPart.split('?')[0];
    return `DB Name: "${dbName}" (Custom Connection Format)`;
  }
}

const sql = neon(dbUrl);

async function checkDb() {
  console.log('=============================================');
  console.log(' DATABASE CONNECTION CHECK');
  console.log('=============================================');
  console.log(`Target: ${getSafeDbInfo(dbUrl)}`);

  try {
    // 1. current_database() & current_schema()
    const dbResult = await sql`SELECT current_database(), current_schema();`;
    const curDb = dbResult[0]?.current_database;
    const curSchema = dbResult[0]?.current_schema;
    console.log(`Current Database: ${curDb}`);
    console.log(`Current Schema:   ${curSchema}`);

    // 2. vector extension check
    const extensionResult = await sql`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'vector';
    `;
    const isVectorEnabled = extensionResult.length > 0;
    if (isVectorEnabled) {
      console.log(`pgvector Status:  ENABLED (version ${extensionResult[0].extversion})`);
    } else {
      console.log(`pgvector Status:  NOT ENABLED (Warning: 'vector' extension is missing)`);
    }

    // 3. public schema tables list
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
    `;
    const tables = (tablesResult as Array<{ table_name: string }>).map((t) => t.table_name);
    console.log(`Tables in Schema: [${tables.join(', ')}]`);

    // 4. check if areas table exists and select count(*)
    const hasAreas = tables.includes('areas');
    console.log(`"areas" Table:    ${hasAreas ? 'EXISTS' : 'DOES NOT EXIST'}`);
    
    if (hasAreas) {
      const countResult = await sql`SELECT count(*)::int as count FROM areas;`;
      console.log(`"areas" Count:    ${countResult[0]?.count} records`);
    }

    const hasResponses = tables.includes('responses');
    console.log(`"responses" Table: ${hasResponses ? 'EXISTS' : 'DOES NOT EXIST'}`);
    if (hasResponses) {
      const countResult = await sql`SELECT count(*)::int as count FROM responses;`;
      console.log(`"responses" Count: ${countResult[0]?.count} records`);
    }

    console.log('=============================================');
    console.log('Check finished successfully.');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

checkDb().catch((err) => {
  console.error('Execution failed:', err);
  process.exit(1);
});
