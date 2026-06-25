import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { areas, areaEmbeddings } from '@/db/schema';
import { classicalMDS, Coordinate2D } from '@/lib/mds';

// Mark this route as dynamic to prevent Vercel from caching the GET request statically
export const dynamic = 'force-dynamic';

function l2Normalize(vector: number[]): number[] {
  const sumSquares = vector.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude < 1e-9) {
    return new Array(vector.length).fill(0);
  }
  return vector.map((val) => val / magnitude);
}

function dotProduct(v1: number[], v2: number[]): number {
  return v1.reduce((sum, val, idx) => sum + val * v2[idx], 0);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const debugMode = searchParams.get('debug') === '1' &&
      (process.env.NODE_ENV !== 'production' || process.env.VISUALIZATION_DEBUG === 'true');

    // 1. Fetch all areas and their cached embedding summaries
    const allAreas = await db.select().from(areas);
    const allEmbeddings = await db.select().from(areaEmbeddings);

    // Create a map for quick embedding lookups
    const embeddingMap = new Map<number, typeof allEmbeddings[0]>();
    for (const emb of allEmbeddings) {
      embeddingMap.set(emb.areaId, emb);
    }

    // 2. Separate areas into plotted (n >= 1) and unplotted (n = 0)
    const plottedItems: Array<{
      areaId: number;
      name: string;
      responseCount: number;
      normEmbedding: number[];
    }> = [];

    const unplottedItems: Array<{
      areaId: number;
      name: string;
      responseCount: number;
    }> = [];

    const debugEmbeddings: Array<{
      areaId: number;
      name: string;
      rawType: string;
      isArray: boolean;
      length: number;
      sample: number[];
    }> = [];

    for (const area of allAreas) {
      const embRecord = embeddingMap.get(area.id);
      const count = embRecord?.responseCount || 0;

      if (count >= 1 && embRecord?.embeddingSum) {
        const rawSum = embRecord.embeddingSum;
        if (debugMode) {
          debugEmbeddings.push({
            areaId: area.id,
            name: area.name,
            rawType: typeof rawSum,
            isArray: Array.isArray(rawSum),
            length: Array.isArray(rawSum) ? rawSum.length : 0,
            sample: Array.isArray(rawSum) ? rawSum.slice(0, 5) : [],
          });
        }

        // Calculate the exact weighted average embedding by L2-normalizing the sum
        const normEmbedding = l2Normalize(rawSum);
        plottedItems.push({
          areaId: area.id,
          name: area.name,
          responseCount: count,
          normEmbedding,
        });
      } else {
        unplottedItems.push({
          areaId: area.id,
          name: area.name,
          responseCount: 0,
        });
      }
    }

    const numPlotted = plottedItems.length;

    // 3. Compute pairwise distances for plotted areas
    const coords2D: Array<{
      areaId: number;
      name: string;
      responseCount: number;
      x: number;
      y: number;
    }> = [];

    let similarityMatrixDebug: number[][] = [];
    let distanceMatrixDebug: number[][] = [];
    let rawCoordsDebug: Coordinate2D[] = [];
    let fallbackTriggered = false;

    if (numPlotted > 0) {
      const distanceMatrix = Array.from({ length: numPlotted }, () =>
        new Array(numPlotted).fill(0)
      );
      const similarityMatrix = Array.from({ length: numPlotted }, () =>
        new Array(numPlotted).fill(0)
      );

      for (let i = 0; i < numPlotted; i++) {
        for (let j = i; j < numPlotted; j++) {
          if (i === j) {
            distanceMatrix[i][j] = 0;
            similarityMatrix[i][j] = 1.0;
          } else {
            const similarity = dotProduct(
              plottedItems[i].normEmbedding,
              plottedItems[j].normEmbedding
            );
            // Clamp similarity to [-1, 1] to prevent floating point issues
            const clampedSim = Math.max(-1.0, Math.min(1.0, similarity));
            const distance = 1.0 - clampedSim; // Cosine distance

            distanceMatrix[i][j] = distance;
            distanceMatrix[j][i] = distance;

            similarityMatrix[i][j] = clampedSim;
            similarityMatrix[j][i] = clampedSim;
          }
        }
      }

      if (debugMode) {
        similarityMatrixDebug = similarityMatrix;
        distanceMatrixDebug = distanceMatrix;
      }

      // 4. Compute 2D coordinates using MDS
      const rawCoords = classicalMDS(distanceMatrix);
      if (debugMode) {
        rawCoordsDebug = rawCoords;
      }

      // Check if fallback was triggered internally
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const c of rawCoords) {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      }
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      if (rangeX < 1e-4 && rangeY < 1e-4) {
        fallbackTriggered = true;
        console.warn(`[MDS Warning] Coordinates collapsed (rangeX=${rangeX}, rangeY=${rangeY}). Falled back to circular equal-spacing layout.`);
      }

      // 5. Normalize MDS coordinates to unit circle centered at (0, 0)
      let sumX = 0, sumY = 0;
      for (const c of rawCoords) {
        sumX += c.x;
        sumY += c.y;
      }
      const meanX = sumX / numPlotted;
      const meanY = sumY / numPlotted;

      let maxDist = 0;
      const centered = rawCoords.map((c) => {
        const cx = c.x - meanX;
        const cy = c.y - meanY;
        const dist = Math.sqrt(cx * cx + cy * cy);
        if (dist > maxDist) maxDist = dist;
        return { cx, cy };
      });

      for (let i = 0; i < numPlotted; i++) {
        const item = plottedItems[i];
        const c = centered[i];
        
        // Scale to [-1, 1] range inside the unit circle.
        const x = maxDist > 1e-5 ? c.cx / maxDist : 0;
        const y = maxDist > 1e-5 ? c.cy / maxDist : 0;

        coords2D.push({
          areaId: item.areaId,
          name: item.name,
          responseCount: item.responseCount,
          x,
          y,
        });
      }
    }

    const totalResponses = allEmbeddings.reduce((sum, emb) => sum + (emb.responseCount || 0), 0);

    const responseJSON: {
      summary: {
        totalResponses: number;
        plottedAreaCount: number;
        unplottedAreaCount: number;
      };
      plotted: typeof coords2D;
      unplotted: typeof unplottedItems;
      debug?: {
        plottedList: Array<{ areaId: number; name: string }>;
        embeddingsSummary: typeof debugEmbeddings;
        similarityMatrix: number[][];
        distanceMatrix: number[][];
        rawMdsCoords: Coordinate2D[];
        fallbackTriggered: boolean;
      };
    } = {
      summary: {
        totalResponses,
        plottedAreaCount: coords2D.length,
        unplottedAreaCount: unplottedItems.length,
      },
      plotted: coords2D,
      unplotted: unplottedItems.sort((a, b) => a.name.localeCompare(b.name)),
    };

    if (debugMode) {
      responseJSON.debug = {
        plottedList: plottedItems.map(p => ({ areaId: p.areaId, name: p.name })),
        embeddingsSummary: debugEmbeddings,
        similarityMatrix: similarityMatrixDebug,
        distanceMatrix: distanceMatrixDebug,
        rawMdsCoords: rawCoordsDebug,
        fallbackTriggered,
      };
    }

    return NextResponse.json(responseJSON);
  } catch (error: unknown) {
    console.error('Visualization fetch failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to retrieve visualization data';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
