"use client";

import { useRef, useEffect } from "react";

// Simple Perlin noise for contour generation
class Noise {
  private perm: number[];
  private gradP: { x: number; y: number }[];

  constructor(seed = 0) {
    const grad3 = [
      { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    ];
    const p = [
      151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,
      21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,
      237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,
      111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,
      80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,
      3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,
      17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,
      129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,
      238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,
      184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,
      195,78,66,215,61,156,180,
    ];
    this.perm = new Array(512);
    this.gradP = new Array(512);
    if (seed > 0 && seed < 1) seed *= 65536;
    seed = Math.floor(seed);
    if (seed < 256) seed |= seed << 8;
    for (let i = 0; i < 256; i++) {
      const v = i & 1 ? p[i] ^ (seed & 255) : p[i] ^ ((seed >> 8) & 255);
      this.perm[i] = this.perm[i + 256] = v;
      this.gradP[i] = this.gradP[i + 256] = grad3[v % 8];
    }
  }

  private fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  perlin2(x: number, y: number) {
    let X = Math.floor(x);
    let Y = Math.floor(y);
    x -= X;
    y -= Y;
    X &= 255;
    Y &= 255;
    const dot = (g: { x: number; y: number }, px: number, py: number) => g.x * px + g.y * py;
    const n00 = dot(this.gradP[X + this.perm[Y]], x, y);
    const n01 = dot(this.gradP[X + this.perm[Y + 1]], x, y - 1);
    const n10 = dot(this.gradP[X + 1 + this.perm[Y]], x - 1, y);
    const n11 = dot(this.gradP[X + 1 + this.perm[Y + 1]], x - 1, y - 1);
    const u = this.fade(x);
    const v = this.fade(y);
    return (1 - v) * ((1 - u) * n00 + u * n10) + v * ((1 - u) * n01 + u * n11);
  }

  // Layered noise for richer patterns
  fbm(x: number, y: number, octaves = 4) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      value += this.perlin2(x * frequency, y * frequency) * amplitude;
      max += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / max;
  }
}

interface TopographicBackgroundProps {
  /** Line color — reads from CSS var(--topo-line) by default */
  lineColor?: string;
  /** Background fill — reads from CSS var(--topo-bg) by default, "transparent" for overlay mode */
  backgroundColor?: string;
  /** Number of contour levels */
  levels?: number;
  /** Noise scale — smaller = larger features */
  scale?: number;
  /** Line width */
  lineWidth?: number;
  /** Line opacity 0-1 */
  lineOpacity?: number;
  /** Animate the noise field slowly */
  animate?: boolean;
  /** Animation speed multiplier */
  speed?: number;
  /** Intensity preset: "full" (landing), "subtle" (dashboards), "minimal" (content-heavy) */
  intensity?: "full" | "subtle" | "minimal";
  className?: string;
  style?: React.CSSProperties;
}

// Intensity presets
const intensityPresets = {
  full: { levels: 20, lineOpacity: 0.45, lineWidth: 1.2, speed: 0.012 },
  subtle: { levels: 14, lineOpacity: 0.25, lineWidth: 1.0, speed: 0.006 },
  minimal: { levels: 10, lineOpacity: 0.15, lineWidth: 0.8, speed: 0.003 },
};

export function TopographicBackground({
  lineColor,
  backgroundColor,
  levels,
  scale = 0.003,
  lineWidth,
  lineOpacity,
  animate = true,
  speed,
  intensity = "subtle",
  className = "",
  style,
}: TopographicBackgroundProps) {
  const preset = intensityPresets[intensity];
  const resolvedLevels = levels ?? preset.levels;
  const resolvedLineWidth = lineWidth ?? preset.lineWidth;
  const resolvedLineOpacity = lineOpacity ?? preset.lineOpacity;
  const resolvedSpeed = speed ?? preset.speed;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const noiseRef = useRef(new Noise(42));
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d")!;
    let width = 0;
    let height = 0;

    // Read CSS variable colors from the container
    const computedStyle = getComputedStyle(container);
    const resolvedLineColor = lineColor || computedStyle.getPropertyValue("--topo-line").trim() || "#1a5c5c";
    const resolvedBgColor = backgroundColor ?? (computedStyle.getPropertyValue("--topo-bg").trim() || "#070f12");

    function resize() {
      const rect = container!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Marching squares to trace contour lines
    function drawContours(time: number) {
      const noise = noiseRef.current;
      ctx.clearRect(0, 0, width, height);

      if (resolvedBgColor && resolvedBgColor !== "transparent") {
        ctx.fillStyle = resolvedBgColor;
        ctx.fillRect(0, 0, width, height);
      }

      // Sample noise into a grid
      const step = 4; // pixel resolution of the grid
      const cols = Math.ceil(width / step) + 1;
      const rows = Math.ceil(height / step) + 1;
      const field = new Float32Array(cols * rows);

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const x = i * step;
          const y = j * step;
          field[j * cols + i] = noise.fbm(
            x * scale + time * 0.01,
            y * scale + time * 0.008,
            4
          );
        }
      }

      // Find min/max for threshold spacing
      let min = Infinity;
      let max = -Infinity;
      for (let k = 0; k < field.length; k++) {
        if (field[k] < min) min = field[k];
        if (field[k] > max) max = field[k];
      }

      ctx.strokeStyle = resolvedLineColor;
      ctx.lineWidth = resolvedLineWidth;
      ctx.globalAlpha = resolvedLineOpacity;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // For each contour level, trace with marching squares
      for (let l = 1; l < resolvedLevels; l++) {
        const threshold = min + (max - min) * (l / resolvedLevels);
        ctx.beginPath();

        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const idx = j * cols + i;
            const a = field[idx];
            const b = field[idx + 1];
            const c = field[idx + cols + 1];
            const d = field[idx + cols];

            const x0 = i * step;
            const y0 = j * step;

            // Classify corners
            const sa = a >= threshold ? 1 : 0;
            const sb = b >= threshold ? 1 : 0;
            const sc = c >= threshold ? 1 : 0;
            const sd = d >= threshold ? 1 : 0;
            const code = sa | (sb << 1) | (sc << 2) | (sd << 3);

            if (code === 0 || code === 15) continue;

            // Interpolation helpers
            const lerp = (v1: number, v2: number) => {
              const t = (threshold - v1) / (v2 - v1);
              return Math.max(0, Math.min(1, t));
            };

            // Edge midpoints (interpolated)
            const top = { x: x0 + lerp(a, b) * step, y: y0 };
            const right = { x: x0 + step, y: y0 + lerp(b, c) * step };
            const bottom = { x: x0 + lerp(d, c) * step, y: y0 + step };
            const left = { x: x0, y: y0 + lerp(a, d) * step };

            // Draw line segments based on marching squares case
            const segment = (
              p1: { x: number; y: number },
              p2: { x: number; y: number }
            ) => {
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            };

            switch (code) {
              case 1: segment(top, left); break;
              case 2: segment(top, right); break;
              case 3: segment(left, right); break;
              case 4: segment(right, bottom); break;
              case 5:
                // Saddle — use center value to disambiguate
                if ((a + b + c + d) / 4 >= threshold) {
                  segment(top, right);
                  segment(bottom, left);
                } else {
                  segment(top, left);
                  segment(right, bottom);
                }
                break;
              case 6: segment(top, bottom); break;
              case 7: segment(left, bottom); break;
              case 8: segment(left, bottom); break;
              case 9: segment(top, bottom); break;
              case 10:
                // Saddle
                if ((a + b + c + d) / 4 >= threshold) {
                  segment(top, left);
                  segment(bottom, right);
                } else {
                  segment(top, right);
                  segment(bottom, left);
                }
                break;
              case 11: segment(right, bottom); break;
              case 12: segment(left, right); break;
              case 13: segment(top, right); break;
              case 14: segment(top, left); break;
            }
          }
        }
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    function tick() {
      // Pause when tab is not visible
      if (document.hidden) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      if (animate) {
        timeRef.current += resolvedSpeed;
      }
      drawContours(timeRef.current);
      if (animate) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    resize();

    // Draw once immediately
    drawContours(timeRef.current);

    // Only start animation loop if animate is true
    if (animate) {
      frameRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [lineColor, backgroundColor, resolvedLevels, scale, resolvedLineWidth, resolvedLineOpacity, animate, resolvedSpeed]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
