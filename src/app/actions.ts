'use server';

import { db } from '@/db';
import { areas, responses, areaEmbeddings, areaColorVotes } from '@/db/schema';
import { sql, eq, ne } from 'drizzle-orm';
import { generateEmbedding } from '@/lib/embeddings';
import { PLACE_COLORS } from '@/lib/colors';
import { headers } from 'next/headers';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Lazy load rate limiters to support local configuration bypass
let minRatelimit: Ratelimit | null = null;
let hrRatelimit: Ratelimit | null = null;

function getRateLimiters() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (!minRatelimit || !hrRatelimit) {
    const redis = new Redis({ url, token });

    minRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
      prefix: '@upstash/ratelimit/min',
    });

    hrRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '3600 s'),
      analytics: true,
      prefix: '@upstash/ratelimit/hr',
    });
  }

  return { minRatelimit, hrRatelimit };
}

export interface ActionResponse {
  success: boolean;
  error?: string;
}

export interface PromptArea {
  id: number;
  name: string;
}

/**
 * Fetches a random area from the database for the user to describe.
 * Optionally excludes a specific area ID to prevent repeats.
 */
export async function getRandomArea(excludeId?: number): Promise<PromptArea | null> {
  try {
    const query = db
      .select({ id: areas.id, name: areas.name })
      .from(areas);

    const result = excludeId !== undefined
      ? await query.where(ne(areas.id, excludeId)).orderBy(sql`random()`).limit(1)
      : await query.orderBy(sql`random()`).limit(1);
    
    return result[0] || null;
  } catch (error) {
    console.error('Failed to fetch random area:', error);
    return null;
  }
}

/**
 * Submits a user's description for an area.
 * Generates embeddings, saves the response, and updates the accumulated sum in a transaction.
 */
export async function submitResponse(
  areaId: number,
  description: string
): Promise<ActionResponse> {
  // 1. Emergency stop switch check
  if (process.env.SUBMISSIONS_ENABLED === 'false') {
    console.warn('Submission blocked: submissions are disabled');
    return {
      success: false,
      error: '投稿できませんでした。',
    };
  }

  // 2. Rate Limiting Check
  const limiters = getRateLimiters();
  if (!limiters) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Rate limiter configuration missing in production environment. Request blocked.');
      return {
        success: false,
        error: '投稿できませんでした。',
      };
    } else {
      console.warn('Rate limiter environment variables (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) are not set. Bypassing rate limit in development.');
    }
  } else {
    try {
      const headerList = await headers();
      const forwardedFor = headerList.get('x-forwarded-for');
      let ip = '127.0.0.1';
      if (forwardedFor) {
        const firstIp = forwardedFor.split(',')[0]?.trim();
        if (firstIp) {
          ip = firstIp;
        }
      } else {
        ip = headerList.get('x-real-ip') || headerList.get('x-client-ip') || '127.0.0.1';
      }

      const [minResult, hrResult] = await Promise.all([
        limiters.minRatelimit.limit(ip),
        limiters.hrRatelimit.limit(ip),
      ]);

      if (!minResult.success || !hrResult.success) {
        console.warn('Rate limit exceeded');
        return {
          success: false,
          error: 'しばらくしてから再度お試しください。',
        };
      }
    } catch (err) {
      console.error('Rate limiter check failed:', err instanceof Error ? err.message : 'Unknown error');
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          error: 'しばらくしてから再度お試しください。',
        };
      }
    }
  }

  // 3. Normalize description: \r, \n, \t are replaced with space
  const normalizedDescription = description.replace(/[\r\n\t]/g, ' ');

  // Reject description containing other control characters
  const controlCharRegex = /[\x00-\x1F\x7F-\x9F]/;
  if (controlCharRegex.test(normalizedDescription)) {
    console.warn('Submission blocked: contains control characters');
    return {
      success: false,
      error: '投稿できませんでした。',
    };
  }

  // Trim and check length (1-150 characters)
  const cleanDescription = normalizedDescription.trim();
  const len = cleanDescription.length;
  if (len < 1 || len > 150) {
    console.warn(`Submission blocked: invalid description length (${len})`);
    return {
      success: false,
      error: '投稿できませんでした。',
    };
  }

  // 4. Verify area ID exists in database
  try {
    const areaExists = await db
      .select({ id: areas.id })
      .from(areas)
      .where(eq(areas.id, areaId))
      .limit(1);

    if (areaExists.length === 0) {
      console.warn('Submission blocked: areaId does not exist');
      return {
        success: false,
        error: '投稿できませんでした。',
      };
    }
  } catch (error: unknown) {
    console.error('Failed to validate areaId:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: '投稿できませんでした。',
    };
  }

  // 5. Generate Embedding (OpenAI API call)
  let embedding: number[];
  try {
    embedding = await generateEmbedding(cleanDescription);
  } catch (error: unknown) {
    console.error('Failed to generate embedding:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: '投稿できませんでした。',
    };
  }

  // 6. Save response and update accumulated embeddings in database
  try {
    await db.insert(responses).values({
      areaId,
      description: cleanDescription,
      embedding,
    });

    const existing = await db
      .select()
      .from(areaEmbeddings)
      .where(eq(areaEmbeddings.areaId, areaId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(areaEmbeddings).values({
        areaId,
        embeddingSum: embedding,
        responseCount: 1,
      });
    } else {
      const currentSum = existing[0].embeddingSum;
      const newSum = currentSum.map((val, idx) => val + embedding[idx]);
      const newCount = existing[0].responseCount + 1;

      await db
        .update(areaEmbeddings)
        .set({
          embeddingSum: newSum,
          responseCount: newCount,
          updatedAt: new Date(),
        })
        .where(eq(areaEmbeddings.areaId, areaId));
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Failed to write to database:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: '投稿できませんでした。',
    };
  }
}

/**
 * Submits a user's color vote for an area.
 */
export async function submitColorVote(
  areaId: number,
  colorId: string
): Promise<ActionResponse> {
  // 1. Emergency stop switch check
  if (process.env.SUBMISSIONS_ENABLED === 'false') {
    return {
      success: false,
      error: '投票できませんでした。',
    };
  }

  // Find color in palette
  const color = PLACE_COLORS.find((c) => c.id === colorId);
  if (!color) {
    return {
      success: false,
      error: '指定された色が存在しません。',
    };
  }

  // 2. Verify area ID exists in database
  try {
    const areaExists = await db
      .select({ id: areas.id })
      .from(areas)
      .where(eq(areas.id, areaId))
      .limit(1);

    if (areaExists.length === 0) {
      return {
        success: false,
        error: '対象のPlaceが存在しません。',
      };
    }
  } catch (error: unknown) {
    console.error('Failed to validate areaId for color vote:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: '投票できませんでした。',
    };
  }

  // 3. Save vote to DB
  try {
    await db.insert(areaColorVotes).values({
      areaId,
      colorId: color.id,
      colorHex: color.hex,
      hue: color.hue,
      chroma: color.chroma,
      lightness: color.lightness,
      family: color.family,
      tone: color.tone,
    });
    return { success: true };
  } catch (error: unknown) {
    console.error('Failed to write color vote to database:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: '投票できませんでした。',
    };
  }
}

export interface ColorSummary {
  totalVotes: number;
  representativeColor: {
    id: string;
    name: string;
    hex: string;
    textColor: string;
  } | null;
  topColors: Array<{
    id: string;
    name: string;
    hex: string;
    count: number;
    percentage: number;
    textColor: string;
  }>;
  averageLightness: number;
  averageChroma: number;
}

/**
 * Fetches the aggregated color summary for a specific area.
 */
export async function getColorSummary(areaId: number): Promise<ColorSummary | null> {
  try {
    // 1. Get statistics and total count
    const stats = await db
      .select({
        totalVotes: sql<number>`count(*)::int`,
        avgLightness: sql<number>`avg(${areaColorVotes.lightness})`,
        avgChroma: sql<number>`avg(${areaColorVotes.chroma})`,
      })
      .from(areaColorVotes)
      .where(eq(areaColorVotes.areaId, areaId));

    const totalVotes = stats[0]?.totalVotes || 0;
    if (totalVotes === 0) {
      return null;
    }

    // 2. Get vote count per color grouped by color_id
    const colorCounts = await db
      .select({
        colorId: areaColorVotes.colorId,
        count: sql<number>`count(*)::int`,
        maxCreatedAt: sql<Date>`max(${areaColorVotes.createdAt})`,
      })
      .from(areaColorVotes)
      .where(eq(areaColorVotes.areaId, areaId))
      .groupBy(areaColorVotes.colorId);

    // Sort counts: descending by count, then descending by maxCreatedAt (latest vote tie-breaker)
    const sortedCounts = [...colorCounts].sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return new Date(b.maxCreatedAt).getTime() - new Date(a.maxCreatedAt).getTime();
    });

    // Determine representative color (most voted)
    const repColorItem = sortedCounts[0];
    let representativeColor = null;
    if (repColorItem) {
      const colorInfo = PLACE_COLORS.find(c => c.id === repColorItem.colorId);
      representativeColor = {
        id: repColorItem.colorId,
        name: colorInfo?.name || repColorItem.colorId,
        hex: colorInfo?.hex || '#cccccc',
        textColor: colorInfo?.textColor || '#1c1917',
      };
    }

    // Determine top 5 colors
    const topColors = sortedCounts.slice(0, 5).map(item => {
      const colorInfo = PLACE_COLORS.find(c => c.id === item.colorId);
      return {
        id: item.colorId,
        name: colorInfo?.name || item.colorId,
        hex: colorInfo?.hex || '#cccccc',
        textColor: colorInfo?.textColor || '#1c1917',
        count: item.count,
        percentage: Math.round((item.count / totalVotes) * 100),
      };
    });

    return {
      totalVotes,
      representativeColor,
      topColors,
      averageLightness: Math.round(Number(stats[0]?.avgLightness || 0) * 10) / 10,
      averageChroma: Math.round(Number(stats[0]?.avgChroma || 0) * 10) / 10,
    };
  } catch (error) {
    console.error('Failed to get color summary:', error);
    return null;
  }
}

