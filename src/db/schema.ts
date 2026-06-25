import { pgTable, serial, text, timestamp, integer, customType } from 'drizzle-orm/pg-core';

// Custom type for pgvector with 512 dimensions
export const vector512 = customType<{ data: number[] }>({
  dataType() {
    return 'vector(512)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === 'string') {
      return value
        .replace(/[\[\]]/g, '')
        .split(',')
        .map(Number);
    }
    if (Array.isArray(value)) {
      return value.map(Number);
    }
    return [];
  },
});

// 1. Areas master table
export const areas = pgTable('areas', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. User responses table (anonymized)
export const responses = pgTable('responses', {
  id: serial('id').primaryKey(),
  areaId: integer('area_id')
    .references(() => areas.id, { onDelete: 'cascade' })
    .notNull(),
  description: text('description').notNull(),
  embedding: vector512('embedding').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Accumulated Area Embeddings table (Running Sum and Count)
export const areaEmbeddings = pgTable('area_embeddings', {
  areaId: integer('area_id')
    .primaryKey()
    .references(() => areas.id, { onDelete: 'cascade' }),
  embeddingSum: vector512('embedding_sum').notNull(),
  responseCount: integer('response_count').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. Area Color Votes table
export const areaColorVotes = pgTable('area_color_votes', {
  id: serial('id').primaryKey(),
  areaId: integer('area_id')
    .references(() => areas.id, { onDelete: 'cascade' })
    .notNull(),
  colorId: text('color_id').notNull(),
  colorHex: text('color_hex').notNull(),
  hue: integer('hue').notNull(),
  chroma: integer('chroma').notNull(),
  lightness: integer('lightness').notNull(),
  family: text('family').notNull(),
  tone: text('tone').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

