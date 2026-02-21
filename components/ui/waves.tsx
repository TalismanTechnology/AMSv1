"use client";

import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

// ---------- Perlin Noise ----------
class Grad {
  x: number;
  y: number;
  z: number;
  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  dot2(x: number, y: number) {
    return this.x * x + this.y * y;
  }
}

class Noise {
  private grad3: Grad[];
  private p: number[];
  private perm: number[];
  private gradP: Grad[];

  constructor(seed = 0) {
    this.grad3 = [
      new Grad(1, 1, 0), new Grad(-1, 1, 0), new Grad(1, -1, 0), new Grad(-1, -1, 0),
      new Grad(1, 0, 1), new Grad(-1, 0, 1), new Grad(1, 0, -1), new Grad(-1, 0, -1),
      new Grad(0, 1, 1), new Grad(0, -1, 1), new Grad(0, 1, -1), new Grad(0, -1, -1),
    ];
    this.p = [
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
    this.seed(seed);
  }

  seed(seed: number) {
    if (seed > 0 && seed < 1) seed *= 65536;
    seed = Math.floor(seed);
    if (seed < 256) seed |= seed << 8;
    for (let i = 0; i < 256; i++) {
      const v = i & 1 ? this.p[i] ^ (seed & 255) : this.p[i] ^ ((seed >> 8) & 255);
      this.perm[i] = this.perm[i + 256] = v;
      this.gradP[i] = this.gradP[i + 256] = this.grad3[v % 12];
    }
  }

  private fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number) {
    return (1 - t) * a + t * b;
  }

  perlin2(x: number, y: number) {
    let X = Math.floor(x);
    let Y = Math.floor(y);
    x -= X;
    y -= Y;
    X &= 255;
    Y &= 255;
    const n00 = this.gradP[X + this.perm[Y]].dot2(x, y);
    const n01 = this.gradP[X + this.perm[Y + 1]].dot2(x, y - 1);
    const n10 = this.gradP[X + 1 + this.perm[Y]].dot2(x - 1, y);
    const n11 = this.gradP[X + 1 + this.perm[Y + 1]].dot2(x - 1, y - 1);
    const u = this.fade(x);
    return this.lerp(this.lerp(n00, n10, u), this.lerp(n01, n11, u), this.fade(y));
  }
}

// ---------- Types ----------
interface Point {
  x: number;
  y: number;
  wave: { x: number; y: number };
  cursor: { x: number; y: number; vx: number; vy: number };
}

interface Mouse {
  x: number;
  y: number;
  lx: number;
  ly: number;
  sx: number;
  sy: number;
  v: number;
  vs: number;
  a: number;
  set: boolean;
}

interface WavesProps {
  lineColor?: string;
  backgroundColor?: string;
  waveSpeedX?: number;
  waveSpeedY?: number;
  waveAmpX?: number;
  waveAmpY?: number;
  friction?: number;
  tension?: number;
  maxCursorMove?: number;
  xGap?: number;
  yGap?: number;
  className?: string;
  paused?: boolean;
}

export interface WavesHandle {
  /** Apply an outward shockwave burst from (centerX, centerY) in viewport coords */
  shock: (centerX: number, centerY: number) => void;
}

export const Waves = forwardRef<WavesHandle, WavesProps>(function Waves({
  lineColor = "#4682b4",
  backgroundColor = "transparent",
  waveSpeedX = 0.0125,
  waveSpeedY = 0.01,
  waveAmpX = 40,
  waveAmpY = 20,
  friction = 0.9,
  tension = 0.01,
  maxCursorMove = 120,
  xGap = 12,
  yGap = 36,
  className = "",
  paused = false,
}: WavesProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const boundingRef = useRef({ width: 0, height: 0, left: 0, top: 0 });
  const noiseRef = useRef(new Noise(Math.random()));
  const linesRef = useRef<Point[][]>([]);
  const mouseRef = useRef<Mouse>({
    x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false,
  });
  const frameIdRef = useRef(0);
  const pausedRef = useRef(paused);
  const configRef = useRef({
    lineColor, waveSpeedX, waveSpeedY, waveAmpX, waveAmpY,
    friction, tension, maxCursorMove, xGap, yGap,
  });

  // Keep config ref in sync
  useEffect(() => {
    configRef.current = {
      lineColor, waveSpeedX, waveSpeedY, waveAmpX, waveAmpY,
      friction, tension, maxCursorMove, xGap, yGap,
    };
  }, [lineColor, waveSpeedX, waveSpeedY, waveAmpX, waveAmpY, friction, tension, maxCursorMove, xGap, yGap]);

  // Keep paused ref in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Expose shock method for the intro animation
  useImperativeHandle(ref, () => ({
    shock(centerX: number, centerY: number) {
      const b = boundingRef.current;
      const cx = centerX - b.left;
      const cy = centerY - b.top;
      for (const pts of linesRef.current) {
        for (const p of pts) {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const force = Math.min(60, 4000 / dist);
          p.cursor.vx += (dx / dist) * force;
          p.cursor.vy += (dy / dist) * force;
        }
      }
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    ctxRef.current = canvas.getContext("2d");

    function setSize() {
      const rect = container!.getBoundingClientRect();
      boundingRef.current = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
      canvas!.width = rect.width;
      canvas!.height = rect.height;
    }

    function setLines() {
      const { width, height } = boundingRef.current;
      const cfg = configRef.current;
      linesRef.current = [];
      const oWidth = width + 200;
      const oHeight = height + 30;
      const totalLines = Math.ceil(oWidth / cfg.xGap);
      const totalPoints = Math.ceil(oHeight / cfg.yGap);
      const xStart = (width - cfg.xGap * totalLines) / 2;
      const yStart = (height - cfg.yGap * totalPoints) / 2;
      for (let i = 0; i <= totalLines; i++) {
        const pts: Point[] = [];
        for (let j = 0; j <= totalPoints; j++) {
          pts.push({
            x: xStart + cfg.xGap * i,
            y: yStart + cfg.yGap * j,
            wave: { x: 0, y: 0 },
            cursor: { x: 0, y: 0, vx: 0, vy: 0 },
          });
        }
        linesRef.current.push(pts);
      }
    }

    function movePoints(time: number) {
      const lines = linesRef.current;
      const mouse = mouseRef.current;
      const noise = noiseRef.current;
      const cfg = configRef.current;
      for (const pts of lines) {
        for (const p of pts) {
          const move = noise.perlin2(
            (p.x + time * cfg.waveSpeedX) * 0.002,
            (p.y + time * cfg.waveSpeedY) * 0.0015
          ) * 12;
          p.wave.x = Math.cos(move) * cfg.waveAmpX;
          p.wave.y = Math.sin(move) * cfg.waveAmpY;

          const dx = p.x - mouse.sx;
          const dy = p.y - mouse.sy;
          const dist = Math.hypot(dx, dy);
          const l = Math.max(175, mouse.vs);
          if (dist < l) {
            const s = 1 - dist / l;
            const f = Math.cos(dist * 0.001) * s;
            p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00065;
            p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00065;
          }

          p.cursor.vx += (0 - p.cursor.x) * cfg.tension;
          p.cursor.vy += (0 - p.cursor.y) * cfg.tension;
          p.cursor.vx *= cfg.friction;
          p.cursor.vy *= cfg.friction;
          p.cursor.x += p.cursor.vx * 2;
          p.cursor.y += p.cursor.vy * 2;
          p.cursor.x = Math.min(cfg.maxCursorMove, Math.max(-cfg.maxCursorMove, p.cursor.x));
          p.cursor.y = Math.min(cfg.maxCursorMove, Math.max(-cfg.maxCursorMove, p.cursor.y));
        }
      }
    }

    function moved(point: Point, withCursor = true) {
      const x = point.x + point.wave.x + (withCursor ? point.cursor.x : 0);
      const y = point.y + point.wave.y + (withCursor ? point.cursor.y : 0);
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    function drawLines() {
      const { width, height } = boundingRef.current;
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.strokeStyle = configRef.current.lineColor;
      ctx.lineWidth = 1.5;
      for (const points of linesRef.current) {
        let p1 = moved(points[0], false);
        ctx.moveTo(p1.x, p1.y);
        for (let idx = 0; idx < points.length; idx++) {
          const isLast = idx === points.length - 1;
          p1 = moved(points[idx], !isLast);
          const p2 = moved(points[idx + 1] || points[points.length - 1], !isLast);
          ctx.lineTo(p1.x, p1.y);
          if (isLast) ctx.moveTo(p2.x, p2.y);
        }
      }
      ctx.stroke();
    }

    function tick(t: number) {
      const mouse = mouseRef.current;
      mouse.sx += (mouse.x - mouse.sx) * 0.1;
      mouse.sy += (mouse.y - mouse.sy) * 0.1;
      const dx = mouse.x - mouse.lx;
      const dy = mouse.y - mouse.ly;
      const d = Math.hypot(dx, dy);
      mouse.v = d;
      mouse.vs += (d - mouse.vs) * 0.1;
      mouse.vs = Math.min(100, mouse.vs);
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;
      mouse.a = Math.atan2(dy, dx);

      if (!pausedRef.current) movePoints(t);
      drawLines();
      frameIdRef.current = requestAnimationFrame(tick);
    }

    function onResize() {
      setSize();
      setLines();
    }

    function updateMouse(clientX: number, clientY: number) {
      const mouse = mouseRef.current;
      const b = boundingRef.current;
      mouse.x = clientX - b.left;
      mouse.y = clientY - b.top;
      if (!mouse.set) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.set = true;
      }
    }

    function onMouseMove(e: MouseEvent) {
      updateMouse(e.clientX, e.clientY);
    }

    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0];
      updateMouse(touch.clientX, touch.clientY);
    }

    setSize();
    setLines();
    frameIdRef.current = requestAnimationFrame(tick);

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none fixed inset-0 z-40 overflow-hidden ${className}`}
      style={{ backgroundColor, opacity: 0.3 }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
});
