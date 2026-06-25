/**
 * Classical Multidimensional Scaling (MDS) implementation in pure TypeScript.
 * Maps high-dimensional items (via a pairwise distance matrix) to a 2D coordinate space.
 */

export interface Coordinate2D {
  x: number;
  y: number;
}

/**
 * Performs power iteration to find the dominant eigenvector and eigenvalue of a symmetric matrix.
 */
function powerIteration(
  matrix: number[][],
  maxIterations = 100,
  tolerance = 1e-6
): { eigenvalue: number; eigenvector: number[] } {
  const n = matrix.length;
  
  // Start with a non-uniform vector to prevent double-centering cancellation (all-1s vector yields 0 on double-centered matrix)
  let v = Array.from({ length: n }, (_, i) => Math.sin(i + 1));
  const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  v = v.map((val) => val / norm);

  let eigenvalue = 0;
  for (let iter = 0; iter < maxIterations; iter++) {
    const nextV = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        nextV[i] += matrix[i][j] * v[j];
      }
    }

    const nextNorm = Math.sqrt(nextV.reduce((sum, val) => sum + val * val, 0));
    if (nextNorm < 1e-9) {
      // Safe fallback if vector converges to zero
      return { eigenvalue: 0, eigenvector: v };
    }

    const normalizedNextV = nextV.map((val) => val / nextNorm);

    // Check convergence via dot product of old and new vectors (absolute value should approach 1)
    let dot = 0;
    for (let i = 0; i < n; i++) {
      dot += v[i] * normalizedNextV[i];
    }

    v = normalizedNextV;

    if (Math.abs(Math.abs(dot) - 1.0) < tolerance) {
      break;
    }
  }

  // Rayleigh quotient: v^T * A * v
  const Av = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      Av[i] += matrix[i][j] * v[j];
    }
  }
  eigenvalue = v.reduce((sum, val, idx) => sum + val * Av[idx], 0);

  return { eigenvalue, eigenvector: v };
}

/**
 * Computes 2D coordinates for items based on their pairwise distance matrix.
 * 
 * @param distances N x N symmetric distance matrix (distances[i][j] >= 0, distances[i][i] = 0)
 * @returns Array of Coordinate2D representing projected coordinates in 2D space
 */
export function classicalMDS(distances: number[][]): Coordinate2D[] {
  const n = distances.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];
  if (n === 2) {
    const d = distances[0][1];
    return [
      { x: -d / 2, y: 0 },
      { x: d / 2, y: 0 },
    ];
  }

  // 1. Double centering of squared distance matrix: B = -0.5 * H * D^(2) * H
  // We can calculate H * D^(2) * H directly without full matrix multiplication:
  // B_ij = -0.5 * (D2_ij - mean(row_i) - mean(col_j) + mean(all))
  const rowMeans = new Array(n).fill(0);
  let grandMean = 0;

  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      const d2 = distances[i][j] * distances[i][j];
      rowSum += d2;
    }
    rowMeans[i] = rowSum / n;
    grandMean += rowMeans[i];
  }
  grandMean /= n;

  const B = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d2 = distances[i][j] * distances[i][j];
      B[i][j] = -0.5 * (d2 - rowMeans[i] - rowMeans[j] + grandMean);
    }
  }

  // 2. Find top 2 eigenvalues & eigenvectors using Power Iteration with Deflation
  // Find first principal component
  const pc1 = powerIteration(B);
  
  // Deflate the matrix: B_deflated = B - lambda1 * v1 * v1^T
  const BDeflated = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      BDeflated[i][j] = B[i][j] - pc1.eigenvalue * pc1.eigenvector[i] * pc1.eigenvector[j];
    }
  }

  // Find second principal component
  const pc2 = powerIteration(BDeflated);

  // 3. Compute coordinates: X = sqrt(max(0, lambda1)) * v1, Y = sqrt(max(0, lambda2)) * v2
  const xMult = Math.sqrt(Math.max(0, pc1.eigenvalue));
  const yMult = Math.sqrt(Math.max(0, pc2.eigenvalue));

  const coords: Coordinate2D[] = [];
  for (let i = 0; i < n; i++) {
    const x = pc1.eigenvector[i] * xMult;
    const y = pc2.eigenvector[i] * yMult;
    coords.push({
      x: isNaN(x) ? 0 : x,
      y: isNaN(y) ? 0 : y,
    });
  }

  // 4. Handle collapse / degenerated cases (e.g. all points overlaying each other)
  // If the spread of coords is extremely small, fallback to a deterministic circle layout
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const c of coords) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  if (rangeX < 1e-4 && rangeY < 1e-4) {
    // Return a deterministic circle fallback layout so it is stable and clean
    const circleCoords: Coordinate2D[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (i * 2 * Math.PI) / n;
      circleCoords.push({
        x: Math.cos(angle),
        y: Math.sin(angle),
      });
    }
    return circleCoords;
  }

  return coords;
}

/**
 * Validates the MDS calculations with different test scenarios to guarantee stability in production.
 * This runs locally as a self-test and logs errors if things behave unexpectedly.
 */
export function verifyMDS(): boolean {
  try {
    // Test Case N = 1
    const coords1 = classicalMDS([[0]]);
    if (coords1.length !== 1 || coords1[0].x !== 0 || coords1[0].y !== 0) {
      throw new Error('N=1 MDS validation failed');
    }

    // Test Case N = 2
    const coords2 = classicalMDS([
      [0, 1.5],
      [1.5, 0],
    ]);
    if (coords2.length !== 2 || Math.abs(coords2[0].x - (-0.75)) > 1e-5 || Math.abs(coords2[1].x - 0.75) > 1e-5) {
      throw new Error('N=2 MDS validation failed');
    }

    // Test Case N = 3 (Equilateral triangle of distance 1)
    const d3 = [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ];
    const coords3 = classicalMDS(d3);
    if (coords3.length !== 3) {
      throw new Error('N=3 MDS count mismatch');
    }
    for (const c of coords3) {
      if (isNaN(c.x) || isNaN(c.y)) {
        throw new Error('N=3 MDS coordinates contain NaN');
      }
    }

    // Check for collapse protection
    const collapseCoords = classicalMDS([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    if (collapseCoords.length !== 3) {
      throw new Error('Collapse fallback returned wrong size');
    }
    // Verify circle layout is indeed circular and does not collapse to zero
    const dist01 = Math.sqrt(
      Math.pow(collapseCoords[0].x - collapseCoords[1].x, 2) +
      Math.pow(collapseCoords[0].y - collapseCoords[1].y, 2)
    );
    if (dist01 < 0.1) {
      throw new Error('Collapse fallback failed to displace points');
    }

    console.log('MDS library self-check passed successfully.');
    return true;
  } catch (error) {
    console.error('MDS verification failed:', error);
    return false;
  }
}
