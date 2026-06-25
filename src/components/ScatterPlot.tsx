'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface PlottedArea {
  areaId: number;
  name: string;
  responseCount: number;
  x: number;
  y: number;
}

interface ScatterPlotProps {
  plottedAreas: PlottedArea[];
  activeAreaId?: number;
  onAreaSelect?: (areaId: number) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ComputedLabelLayout {
  areaId: number;
  rectX: number;      // Clamped top-left corner
  rectY: number;      // Clamped top-left corner
  width: number;      // Bounding box width
  height: number;     // Bounding box height
  textX: number;      // Text horizontal center
  textY: number;      // Text vertical center
  hasLine: boolean;   // Draw leader line or not
  lineStartX: number;  // Leader line start (on circle border)
  lineStartY: number;
  lineEndX: number;    // Leader line end (on rect border)
  lineEndY: number;
}

// Estimate dimensions based on character lengths
function estimateLabelDimensions(name: string) {
  let width = 0;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    // ASCII letters: ~7.5px, CJK Kanji/Hiragana/Katakana: ~13.5px
    if (code >= 0x00 && code <= 0x7f) {
      width += 7.5;
    } else {
      width += 13.5;
    }
  }
  const paddingX = 14; // total horizontal padding
  const height = 20;   // clean compact height
  return {
    width: Math.ceil(width + paddingX),
    height,
  };
}

// Overlap area of two rectangles
function getOverlapArea(r1: Rect, r2: Rect): number {
  const xOverlap = Math.max(0, Math.min(r1.x + r1.w, r2.x + r2.w) - Math.max(r1.x, r2.x));
  const yOverlap = Math.max(0, Math.min(r1.y + r1.h, r2.y + r2.h) - Math.max(r1.y, r2.y));
  return xOverlap * yOverlap;
}

// Calculate 8 candidate positions for a label box
function getCandidates(
  cx: number,
  cy: number,
  radius: number,
  W: number,
  H: number,
  svgWidth: number,
  svgHeight: number
): Rect[] {
  const gap = 5;
  const offset = radius + gap;

  const candidates: Rect[] = [
    // 0. Top (Default)
    { x: cx - W / 2, y: cy - radius - gap - H, w: W, h: H },
    // 1. Right
    { x: cx + radius + gap, y: cy - H / 2, w: W, h: H },
    // 2. Left
    { x: cx - radius - gap - W, y: cy - H / 2, w: W, h: H },
    // 3. Bottom
    { x: cx - W / 2, y: cy + radius + gap, w: W, h: H },
    // 4. Top-Right
    { x: cx + offset * 0.707, y: cy - offset * 0.707 - H, w: W, h: H },
    // 5. Top-Left
    { x: cx - offset * 0.707 - W, y: cy - offset * 0.707 - H, w: W, h: H },
    // 6. Bottom-Right
    { x: cx + offset * 0.707, y: cy + offset * 0.707, w: W, h: H },
    // 7. Bottom-Left
    { x: cx - offset * 0.707 - W, y: cy + offset * 0.707, w: W, h: H },
  ];

  // Clamp candidate rects to SVG bounds to avoid clipping (responsive check)
  const padding = 5;
  return candidates.map((c) => {
    const clampedX = Math.max(padding, Math.min(svgWidth - W - padding, c.x));
    const clampedY = Math.max(padding, Math.min(svgHeight - H - padding, c.y));
    return { x: clampedX, y: clampedY, w: W, h: H };
  });
}

interface PlotTransform {
  midX: number;
  midY: number;
  scale: number;
  usedRobustExtent: boolean;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  robustMinX: number;
  robustMaxX: number;
  robustMinY: number;
  robustMaxY: number;
}

// Percentile helper for robust range calculation
function getPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// Distance-based outlier detection for 3-7 points
function findOutlierIndex3To7(areasList: PlottedArea[]): number {
  const n = areasList.length;
  if (n < 3 || n > 7) return -1;

  // Calculate centroid
  let sumX = 0;
  let sumY = 0;
  for (const p of areasList) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / n;
  const cy = sumY / n;

  // Calculate Euclidean distances to centroid
  const distances = areasList.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const sortedDists = [...distances].sort((a, b) => a - b);
  const medianDist = sortedDists[Math.floor(n / 2)];

  if (medianDist < 1e-4) return -1;

  let outlierIdx = -1;
  let outlierCount = 0;

  for (let i = 0; i < n; i++) {
    // If a point is more than 3 times the median distance, it's a potential outlier
    if (distances[i] > 3.0 * medianDist) {
      outlierIdx = i;
      outlierCount++;
    }
  }

  // Only label as outlier if there's exactly one isolated point
  return outlierCount === 1 ? outlierIdx : -1;
}

// Calculate dynamic uniform scaling factors and centering midpoints based on points extent
function computePlotTransform(
  areasList: PlottedArea[],
  svgWidth: number,
  svgHeight: number
): PlotTransform {
  const n = areasList.length;

  const defaultTransform = {
    midX: 0,
    midY: 0,
    scale: 1.0,
    usedRobustExtent: false,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    robustMinX: 0,
    robustMaxX: 0,
    robustMinY: 0,
    robustMaxY: 0,
  };

  if (n === 0) {
    return defaultTransform;
  }

  // Calculate standard boundaries
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of areasList) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  let robustMinX = minX;
  let robustMaxX = maxX;
  let robustMinY = minY;
  let robustMaxY = maxY;
  let usedRobustExtent = false;

  // Determine scaling boundaries based on point counts to prevent outliers from collapsing clusters
  if (n >= 8) {
    // 8+ points: percentile-based robust range (e.g. 10th to 90th percentile)
    const xs = areasList.map((p) => p.x);
    const ys = areasList.map((p) => p.y);

    robustMinX = getPercentile(xs, 0.10);
    robustMaxX = getPercentile(xs, 0.90);
    robustMinY = getPercentile(ys, 0.10);
    robustMaxY = getPercentile(ys, 0.90);
    usedRobustExtent = true;
  } else if (n >= 3 && n <= 7) {
    // 3-7 points: simple single outlier exclusion check
    const outlierIdx = findOutlierIndex3To7(areasList);
    if (outlierIdx !== -1) {
      const filtered = areasList.filter((_, idx) => idx !== outlierIdx);
      let rMinX = Infinity;
      let rMaxX = -Infinity;
      let rMinY = Infinity;
      let rMaxY = -Infinity;
      for (const p of filtered) {
        if (p.x < rMinX) rMinX = p.x;
        if (p.x > rMaxX) rMaxX = p.x;
        if (p.y < rMinY) rMinY = p.y;
        if (p.y > rMaxY) rMaxY = p.y;
      }
      robustMinX = rMinX;
      robustMaxX = rMaxX;
      robustMinY = rMinY;
      robustMaxY = rMaxY;
      usedRobustExtent = true;
    }
  }

  const rangeX = robustMaxX - robustMinX;
  const rangeY = robustMaxY - robustMinY;

  // Margins for label spacing (75px left/right, 65px top/bottom)
  const paddingX = 75;
  const paddingY = 65;
  const usableWidth = svgWidth - 2 * paddingX;
  const usableHeight = svgHeight - 2 * paddingY;

  // Fallback ranges if all points are at the same location or single point exists
  const safeRangeX = rangeX < 1e-5 ? 2.0 : rangeX;
  const safeRangeY = rangeY < 1e-5 ? 2.0 : rangeY;

  const scaleX = usableWidth / safeRangeX;
  const scaleY = usableHeight / safeRangeY;

  // Preserve aspect ratio (uniform scale)
  let scale = Math.min(scaleX, scaleY);

  // Cap the scale to avoid excessive zoom-in on extremely close points
  const maxScale = 500;
  if (scale > maxScale) {
    scale = maxScale;
  }

  return {
    midX: (robustMinX + robustMaxX) / 2,
    midY: (robustMinY + robustMaxY) / 2,
    scale,
    usedRobustExtent,
    minX,
    maxX,
    minY,
    maxY,
    robustMinX,
    robustMaxX,
    robustMinY,
    robustMaxY,
  };
}

// Map a MDS coordinate point to screen space and clamp outliers to SVG boundaries
function projectPointToScreen(
  x: number,
  y: number,
  transform: PlotTransform,
  svgWidth: number,
  svgHeight: number
) {
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  const rawX = centerX + (x - transform.midX) * transform.scale;
  const rawY = centerY + (y - transform.midY) * transform.scale;

  // Plotting area bounds (same margins as paddingX/paddingY)
  const paddingX = 75;
  const paddingY = 65;
  const minClampedX = paddingX;
  const maxClampedX = svgWidth - paddingX;
  const minClampedY = paddingY;
  const maxClampedY = svgHeight - paddingY;

  const clampedX = Math.max(minClampedX, Math.min(maxClampedX, rawX));
  const clampedY = Math.max(minClampedY, Math.min(maxClampedY, rawY));

  const isOutlier = clampedX !== rawX || clampedY !== rawY;

  return {
    screenX: clampedX,
    screenY: clampedY,
    isOutlier,
  };
}

// Calculate non-overlapping labels layout via greedy cost minimization
function computeLabelLayouts(
  areasList: PlottedArea[],
  transform: PlotTransform,
  svgWidth: number,
  svgHeight: number
): Map<number, ComputedLabelLayout> {
  const layoutsMap = new Map<number, ComputedLabelLayout>();
  const placedRects: Rect[] = [];

  // Generate circle boundaries first to prevent label boxes covering other dots
  const circleRects = areasList.map((area) => {
    const { screenX: cx, screenY: cy } = projectPointToScreen(area.x, area.y, transform, svgWidth, svgHeight);
    const radius = area.responseCount === 1 ? 6 : area.responseCount === 2 ? 8 : 11;
    return {
      areaId: area.areaId,
      cx,
      cy,
      radius,
      rect: {
        x: cx - radius - 4,
        y: cy - radius - 4,
        w: (radius + 4) * 2,
        h: (radius + 4) * 2,
      },
    };
  });

  // Sort a copy by responseCount descending (prioritize higher confidence spots)
  const sorted = [...areasList].sort((a, b) => b.responseCount - a.responseCount);

  for (const area of sorted) {
    const circleInfo = circleRects.find((c) => c.areaId === area.areaId)!;
    const { cx, cy, radius } = circleInfo;
    const { width: W, height: H } = estimateLabelDimensions(area.name);

    const candidates = getCandidates(cx, cy, radius, W, H, svgWidth, svgHeight);

    let bestCandidateIndex = 0;
    let minCost = Infinity;

    candidates.forEach((cand, idx) => {
      let cost = 0;

      // Penalty for overlap with other labels
      placedRects.forEach((placed) => {
        cost += getOverlapArea(cand, placed) * 1.5;
      });

      // High penalty for covering other dots
      circleRects.forEach((c) => {
        if (c.areaId !== area.areaId) {
          cost += getOverlapArea(cand, c.rect) * 2.0;
        }
      });

      // Small index bias (prefer T, R, L, B over diagonals)
      cost += idx * 1.0;

      if (cost < minCost) {
        minCost = cost;
        bestCandidateIndex = idx;
      }
    });

    const bestBox = candidates[bestCandidateIndex];
    placedRects.push(bestBox);

    // Leader line calculation
    const lineEndX = Math.max(bestBox.x, Math.min(cx, bestBox.x + W));
    const lineEndY = Math.max(bestBox.y, Math.min(cy, bestBox.y + H));

    const angle = Math.atan2(lineEndY - cy, lineEndX - cx);
    const lineStartX = cx + radius * Math.cos(angle);
    const lineStartY = cy + radius * Math.sin(angle);

    const distToBorder = Math.hypot(lineEndX - cx, lineEndY - cy) - radius;
    const hasLine = distToBorder > 5; // Leader line if label is far

    layoutsMap.set(area.areaId, {
      areaId: area.areaId,
      rectX: bestBox.x,
      rectY: bestBox.y,
      width: W,
      height: H,
      textX: bestBox.x + W / 2,
      textY: bestBox.y + H / 2,
      hasLine,
      lineStartX,
      lineStartY,
      lineEndX,
      lineEndY,
    });
  }

  return layoutsMap;
}

export default function ScatterPlot({ plottedAreas, activeAreaId, onAreaSelect }: ScatterPlotProps) {
  const [alignedAreas, setAlignedAreas] = useState<PlottedArea[]>([]);
  const [hoveredAreaId, setHoveredAreaId] = useState<number | null>(null);
  
  // Keep track of the previously rendered coordinates to align the axes and prevent mirror flips
  const prevCoordsRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  useEffect(() => {
    // Defer state updates to the next tick to prevent synchronous setState inside rendering path
    const timer = setTimeout(() => {
      if (plottedAreas.length === 0) {
        setAlignedAreas([]);
        return;
      }

      // Align signs of X and Y axes to match the previous frame's layout as closely as possible
      let flipX = false;
      let flipY = false;

      let sumDistXNormal = 0;
      let sumDistXFlipped = 0;
      let sumDistYNormal = 0;
      let sumDistYFlipped = 0;
      let commonPointsCount = 0;

      // 1. Calculate squared distances between current coordinates and previous coordinates (safe inside deferred callback)
      for (const area of plottedAreas) {
        const prev = prevCoordsRef.current.get(area.areaId);
        if (prev) {
          commonPointsCount++;
          sumDistXNormal += Math.pow(area.x - prev.x, 2);
          sumDistXFlipped += Math.pow(-area.x - prev.x, 2);

          sumDistYNormal += Math.pow(area.y - prev.y, 2);
          sumDistYFlipped += Math.pow(-area.y - prev.y, 2);
        }
      }

      // 2. Determine if flipping coordinates reduces the total displacement of points
      if (commonPointsCount > 0) {
        if (sumDistXFlipped < sumDistXNormal) {
          flipX = true;
        }
        if (sumDistYFlipped < sumDistYNormal) {
          flipY = true;
        }
      }

      // 3. Apply the sign flips and create the aligned dataset
      const processed = plottedAreas.map((area) => ({
        ...area,
        x: flipX ? -area.x : area.x,
        y: flipY ? -area.y : area.y,
      }));

      // 4. Update the previous coordinates cache
      const newCache = new Map<number, { x: number; y: number }>();
      for (const area of processed) {
        newCache.set(area.areaId, { x: area.x, y: area.y });
      }
      prevCoordsRef.current = newCache;

      setAlignedAreas(processed);
    }, 0);

    return () => clearTimeout(timer);
  }, [plottedAreas]); // Only runs when plottedAreas changes

  // Viewport dimensions for SVG
  const width = 600;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate the scaling transform dynamically based on aligned areas
  const transform = React.useMemo(() => {
    return computePlotTransform(alignedAreas, width, height);
  }, [alignedAreas]);

  // Compute label layouts based on screen positions
  const layouts = React.useMemo(() => {
    return computeLabelLayouts(alignedAreas, transform, width, height);
  }, [alignedAreas, transform]);

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 'auto',
          backgroundColor: 'var(--canvas-bg)',
          borderRadius: '12px',
          border: '1px solid var(--canvas-border)',
          boxShadow: 'var(--canvas-shadow)',
          display: 'block',
          transition: 'background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        {/* Cartographic Dotted Grid Background */}
        <defs>
          <pattern id="dot-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.75" fill="var(--grid-dot-color)" style={{ transition: 'fill 0.3s ease' }} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />

        {/* Central Crosshairs (Drafting style grid axes) */}
        <line
          x1={centerX}
          y1={20}
          x2={centerX}
          y2={height - 20}
          stroke="var(--axis-line-color)"
          strokeWidth="1"
          strokeDasharray="3,6"
          style={{ transition: 'stroke 0.3s ease' }}
        />
        <line
          x1={20}
          y1={centerY}
          x2={width - 20}
          y2={centerY}
          stroke="var(--axis-line-color)"
          strokeWidth="1"
          strokeDasharray="3,6"
          style={{ transition: 'stroke 0.3s ease' }}
        />

        {/* Areas / Nodes */}
        {alignedAreas.map((area) => {
          const { screenX: svgX, screenY: svgY } = projectPointToScreen(area.x, area.y, transform, width, height);
          const layout = layouts.get(area.areaId);

          const isCurrentActive = area.areaId === activeAreaId;
          const isHoveredOrFocused = area.areaId === hoveredAreaId;
          
          // isInteractiveHighlighted defines nodes that should stand out (active or hovered)
          const isInteractiveHighlighted = isHoveredOrFocused || isCurrentActive;
          const isPlottedActiveAreaExist = alignedAreas.some(p => p.areaId === activeAreaId);
          const hasAnyActiveOrHovered = hoveredAreaId !== null || isPlottedActiveAreaExist;
          const isDimmed = hasAnyActiveOrHovered && !isInteractiveHighlighted;

          // Visual weight calculation based on response count (n)
          const isLowConfidence = area.responseCount < 3;
          const radius = area.responseCount === 1 ? 6 : area.responseCount === 2 ? 8 : 11;

          // CSS Variable-driven colors
          let fillColor = 'var(--point-color-normal)';
          let strokeColor = 'var(--point-stroke-normal)';
          let opacity = 0.95;

          if (isCurrentActive) {
            fillColor = 'var(--point-color-active)';
            strokeColor = 'var(--point-stroke-active)';
            opacity = 0.98;
          } else if (isLowConfidence) {
            fillColor = 'var(--point-color-low)';
            strokeColor = 'var(--point-stroke-low)';
            opacity = 0.70; // Muted confidence but readable
          }

          // Uniform strokeWidth = 1 across all nodes to fully eliminate thick borders
          const strokeWidth = 1.0;

          return (
            <g
              key={area.areaId}
              tabIndex={0}
              role="button"
              aria-label={`${area.name}について投稿する`}
              onMouseEnter={() => setHoveredAreaId(area.areaId)}
              onMouseLeave={() => setHoveredAreaId(null)}
              onFocus={() => setHoveredAreaId(area.areaId)}
              onBlur={() => setHoveredAreaId(null)}
              onClick={() => onAreaSelect?.(area.areaId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onAreaSelect?.(area.areaId);
                }
              }}
              style={{
                outline: 'none',
                opacity: isDimmed ? 0.80 : 1.0,
                transition: 'opacity 0.2s ease-in-out',
                cursor: 'pointer',
              }}
            >
              {/* Tooltip containing area name and response count */}
              <title>{`${area.name} (投稿数: ${area.responseCount}件)`}</title>

              {/* Leader Line */}
              {layout?.hasLine && (
                <line
                  x1={layout.lineStartX}
                  y1={layout.lineStartY}
                  x2={layout.lineEndX}
                  y2={layout.lineEndY}
                  stroke="var(--axis-line-color)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                  strokeOpacity="0.6"
                  style={{
                    transition: 'x1 0.6s ease-out, y1 0.6s ease-out, x2 0.6s ease-out, y2 0.6s ease-out, stroke 0.3s ease',
                  }}
                />
              )}

              {/* Subtle outer accent ring (ONLY shown on hover/focus, 1px width) */}
              <circle
                cx={svgX}
                cy={svgY}
                r={isHoveredOrFocused ? radius + 5.5 : radius + 4}
                fill="none"
                stroke="var(--point-stroke-active)"
                strokeWidth="1.0"
                strokeDasharray="2,2"
                opacity={isHoveredOrFocused ? 1 : 0}
                style={{
                  pointerEvents: 'none',
                  transition: 'cx 0.6s ease-out, cy 0.6s ease-out, r 0.2s ease-out, opacity 0.2s ease-in-out',
                }}
              />

              {/* Circle (Point) */}
              <circle
                cx={svgX}
                cy={svgY}
                r={isHoveredOrFocused ? radius + 1.5 : radius}
                fill={fillColor}
                fillOpacity={opacity}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                style={{
                  transition: 'cx 0.6s ease-out, cy 0.6s ease-out, r 0.2s ease-out, fill 0.3s ease, stroke 0.3s ease',
                }}
              />

              {/* Label Background Rect */}
              {layout && (
                <rect
                  x={layout.rectX}
                  y={layout.rectY}
                  width={layout.width}
                  height={layout.height}
                  fill="var(--toggle-bg)"
                  stroke={isCurrentActive ? 'var(--point-stroke-active)' : 'var(--badge-border)'}
                  strokeWidth={1}
                  rx="6"
                  ry="6"
                  style={{
                    transition: 'x 0.6s ease-out, y 0.6s ease-out, fill 0.3s ease, stroke 0.3s ease',
                  }}
                />
              )}

              {/* Label Text */}
              {layout && (
                <text
                  x={layout.textX}
                  y={layout.textY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isCurrentActive ? 'var(--text-color)' : (isLowConfidence ? 'var(--text-secondary)' : 'var(--text-color)')}
                  fontSize={isLowConfidence ? '11px' : '12px'}
                  fontWeight={isCurrentActive ? '800' : (isLowConfidence ? 'normal' : '600')}
                  style={{
                    transition: 'x 0.6s ease-out, y 0.6s ease-out, fill 0.3s ease',
                    userSelect: 'none',
                  }}
                >
                  {area.name}
                </text>
              )}
            </g>
          );
        })}

        {/* Custom Rich Tooltip drawn at the very front of the SVG */}
        {(() => {
          const hoveredArea = alignedAreas.find((a) => a.areaId === hoveredAreaId);
          if (!hoveredArea) return null;

          const hoveredSvg = projectPointToScreen(hoveredArea.x, hoveredArea.y, transform, width, height);
          const layout = layouts.get(hoveredArea.areaId);
          
          // Place tooltip slightly above the point or the label rect to avoid overlap
          const baseTooltipX = layout ? layout.textX : hoveredSvg.screenX;
          const hRadius = hoveredArea.responseCount === 1 ? 6 : hoveredArea.responseCount === 2 ? 8 : 11;
          const baseTooltipY = layout ? layout.rectY - 8 : hoveredSvg.screenY - hRadius - 12;

          const ttWidth = 110;
          const ttHeight = 36;
          const ttX = baseTooltipX - ttWidth / 2;
          const ttY = baseTooltipY - ttHeight;

          // Clamp coordinates to keep the tooltip fully visible within SVG viewport
          const clampedTtX = Math.max(6, Math.min(width - ttWidth - 6, ttX));
          const clampedTtY = Math.max(6, Math.min(height - ttHeight - 6, ttY));

          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect
                x={clampedTtX}
                y={clampedTtY}
                width={ttWidth}
                height={ttHeight}
                fill="var(--tooltip-bg)"
                rx="4"
                ry="4"
                opacity="0.95"
                stroke="var(--tooltip-border)"
                strokeWidth="1"
                style={{ transition: 'fill 0.3s ease, stroke 0.3s ease' }}
              />
              <text
                x={clampedTtX + ttWidth / 2}
                y={clampedTtY + 13}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--tooltip-text)"
                fontSize="11px"
                fontWeight="bold"
                style={{ transition: 'fill 0.3s ease' }}
              >
                {hoveredArea.name}
              </text>
              <text
                x={clampedTtX + ttWidth / 2}
                y={clampedTtY + 26}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--tooltip-subtext)"
                fontSize="10px"
                style={{ transition: 'fill 0.3s ease' }}
              >
                投稿数: {hoveredArea.responseCount}件
              </text>
            </g>
          );
        })()}

        {/* Empty state overlay inside SVG */}
        {alignedAreas.length === 0 && (
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            fill="var(--text-secondary)"
            fontSize="14px"
            style={{ fontWeight: 500 }}
          >
            投稿が集まるとここにプロットされます
          </text>
        )}
      </svg>
    </div>
  );
}
