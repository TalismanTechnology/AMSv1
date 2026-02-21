"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { gsap } from "gsap";
import {
  HEAD_PATH,
  BODY_PATH,
  LOGO_VIEWBOX,
  LOGO_ASPECT_RATIO,
} from "@/lib/logo-paths";
import { Waves, type WavesHandle } from "@/components/ui/waves";

const SESSION_KEY = "ams-intro-played";

// Fallback dimensions — overridden at runtime by measuring #hero-logo svg
const FALLBACK_SIZE = 140;

// Stroke width in viewBox units (viewBox is 820×380, rendered ~303×140px)
const STROKE_WIDTH = 5;

interface IntroOverlayProps {
  onComplete?: () => void;
}

export function IntroOverlay({ onComplete }: IntroOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<SVGPathElement>(null);
  const bodyRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wavesContainerRef = useRef<HTMLDivElement>(null);
  const wavesRef = useRef<WavesHandle>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const hasInitialized = useRef(false);
  const logoCenterRef = useRef({ x: 0, y: 0 });
  const [dismissed, setDismissed] = useState(false);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [wavesPaused, setWavesPaused] = useState(true);

  const handleComplete = useCallback(() => {
    setDismissed(true);
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      setSkipAnimation(true);
      setDismissed(true);
      onComplete?.();
      return;
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) {
      sessionStorage.setItem(SESSION_KEY, "true");
      setSkipAnimation(true);
      setDismissed(true);
      onComplete?.();
    }
  }, [onComplete]);

  useEffect(() => {
    if (skipAnimation || hasInitialized.current) return;
    hasInitialized.current = true;

    const overlay = overlayRef.current;
    const head = headRef.current;
    const body = bodyRef.current;
    const svg = svgRef.current;
    const wavesContainer = wavesContainerRef.current;
    const flash = flashRef.current;
    if (!overlay || !head || !body || !svg || !wavesContainer || !flash) {
      sessionStorage.setItem(SESSION_KEY, "true");
      handleComplete();
      return;
    }

    // Safety timeout: dismiss overlay even if animation fails
    const safetyTimer = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "true");
      handleComplete();
    }, 8000);

    // Measure the hero logo and position the overlay SVG on top of it
    const heroSvg = document.querySelector(
      "#hero-logo svg"
    ) as SVGSVGElement | null;
    if (heroSvg) {
      const rect = heroSvg.getBoundingClientRect();
      svg.style.left = `${rect.left}px`;
      svg.style.top = `${rect.top}px`;
      svg.style.width = `${rect.width}px`;
      svg.style.height = `${rect.height}px`;
      // Position flash glow at logo center
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      flash.style.left = `${cx - 200}px`;
      flash.style.top = `${cy - 200}px`;
      logoCenterRef.current = { x: cx, y: cy };
    }

    timelineRef.current = runAnimation(
      overlay,
      head,
      body,
      wavesContainer,
      flash,
      {
        onFlash: () => {
          setWavesPaused(false);
          wavesRef.current?.shock(
            logoCenterRef.current.x,
            logoCenterRef.current.y
          );
        },
        onComplete: () => {
          clearTimeout(safetyTimer);
          sessionStorage.setItem(SESSION_KEY, "true");
          handleComplete();
        },
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      timelineRef.current?.kill();
    };
  }, [skipAnimation, handleComplete]);

  if (dismissed) return null;

  const svgWidth = FALLBACK_SIZE * LOGO_ASPECT_RATIO;
  const svgHeight = FALLBACK_SIZE;

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ backgroundColor: "#1a1a1a" }}
    >
      {/* Waves — start frozen, fade in via GSAP, unfreeze + shock at flash */}
      <div
        ref={wavesContainerRef}
        className="absolute inset-0"
        style={{ opacity: 0 }}
      >
        <Waves
          ref={wavesRef}
          lineColor="#5a9fd4"
          backgroundColor="transparent"
          waveSpeedX={0.0125}
          waveSpeedY={0.01}
          waveAmpX={40}
          waveAmpY={20}
          friction={0.9}
          tension={0.01}
          maxCursorMove={120}
          xGap={24}
          yGap={50}
          paused={wavesPaused}
        />
      </div>

      {/* Flash glow — positioned at logo center by JS */}
      <div
        ref={flashRef}
        className="absolute rounded-full"
        style={{
          width: 400,
          height: 400,
          background:
            "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 25%, rgba(255,255,255,0.1) 50%, transparent 70%)",
          opacity: 0,
          filter: "blur(8px)",
          zIndex: 2,
        }}
      />

      {/* SVG logo — positioned absolutely by JS to match hero logo */}
      <svg
        ref={svgRef}
        width={svgWidth}
        height={svgHeight}
        viewBox={LOGO_VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", overflow: "visible", zIndex: 3 }}
      >
        <path
          ref={headRef}
          d={HEAD_PATH.d}
          transform={`translate(${HEAD_PATH.translateX}, ${HEAD_PATH.translateY})`}
          fill="transparent"
          stroke="transparent"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          ref={bodyRef}
          d={BODY_PATH.d}
          transform={`translate(${BODY_PATH.translateX}, ${BODY_PATH.translateY})`}
          fill="transparent"
          stroke="transparent"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

interface AnimationCallbacks {
  onFlash: () => void;
  onComplete: () => void;
}

function runAnimation(
  overlay: HTMLDivElement,
  head: SVGPathElement,
  body: SVGPathElement,
  wavesContainer: HTMLDivElement,
  flash: HTMLDivElement,
  callbacks: AnimationCallbacks
): gsap.core.Timeline {
  const tl = gsap.timeline({ onComplete: callbacks.onComplete });

  // Measure path lengths for the stroke-draw effect
  const headLength = head.getTotalLength();
  const bodyLength = body.getTotalLength();

  // Set up stroke-draw initial state
  gsap.set(head, {
    attr: {
      stroke: "#ffffff",
      "stroke-dasharray": headLength,
      "stroke-dashoffset": headLength,
    },
  });
  gsap.set(body, {
    attr: {
      stroke: "#ffffff",
      "stroke-dasharray": bodyLength,
      "stroke-dashoffset": bodyLength,
    },
  });

  // ---- PHASE 1 (0–1.2s): Stroke draw — outline traces in ----
  tl.to(
    head,
    {
      attr: { "stroke-dashoffset": 0 },
      duration: 1.2,
      ease: "power2.inOut",
    },
    0
  );

  tl.to(
    body,
    {
      attr: { "stroke-dashoffset": 0 },
      duration: 1.2,
      ease: "power2.inOut",
    },
    0.3
  );

  // ---- Waves fade in during stroke draw (0.5–1.2s), frozen ----
  tl.to(
    wavesContainer,
    {
      opacity: 1,
      duration: 0.7,
      ease: "power2.out",
    },
    0.5
  );

  // ---- PHASE 2 (1.5–2.0s): Fill fades in, stroke fades out ----
  tl.to(
    [head, body],
    {
      attr: { fill: "#ffffff", stroke: "rgba(255,255,255,0)" },
      duration: 0.5,
      ease: "power2.inOut",
    },
    1.5
  );

  // ---- PHASE 3 (2.1s): FLASH — white burst + shockwave + electric glow ----
  // Trigger shockwave + unfreeze waves
  tl.call(() => callbacks.onFlash(), [], 2.1);

  // Flash glow burst from logo center
  tl.to(
    flash,
    {
      opacity: 1,
      scale: 1.5,
      duration: 0.15,
      ease: "power4.out",
    },
    2.1
  );

  // Logo goes bright with intense glow
  tl.to(
    [head, body],
    {
      attr: { fill: "#ffffff" },
      filter:
        "brightness(2) drop-shadow(0 0 30px #fff) drop-shadow(0 0 60px rgba(255,255,255,0.7)) drop-shadow(0 0 100px rgba(255,255,255,0.4))",
      duration: 0.15,
      ease: "power4.out",
    },
    2.1
  );

  // Waves go electric: bright, thick-looking, neon glow
  tl.to(
    wavesContainer,
    {
      filter:
        "brightness(4) drop-shadow(0 0 6px #5af) drop-shadow(0 0 14px #5af)",
      duration: 0.15,
      ease: "power4.out",
    },
    2.1
  );

  // Flash settles down
  tl.to(
    flash,
    {
      opacity: 0,
      scale: 2.5,
      duration: 0.6,
      ease: "power2.out",
    },
    2.25
  );

  // Logo glow settles
  tl.to(
    [head, body],
    {
      filter: "brightness(2) drop-shadow(0 0 30px #fff) drop-shadow(0 0 60px rgba(255,255,255,0.7)) drop-shadow(0 0 100px rgba(255,255,255,0.4))",
      duration: 0.8,
      ease: "power2.out",
    },
    2.25
  );

  // ---- Waves electric glow fades gradually over ~3s ----
  tl.to(
    wavesContainer,
    {
      filter: "brightness(1) drop-shadow(0 0 0px transparent)",
      duration: 3,
      ease: "power2.out",
    },
    2.25
  );

  // ---- PHASE 4 (3.5–5.0s): Background dissolves, revealing the page ----
  tl.set(overlay, { pointerEvents: "none" }, 3.5);

  tl.to(
    overlay,
    {
      backgroundColor: "rgba(26, 26, 26, 0)",
      duration: 1.5,
      ease: "power2.inOut",
    },
    3.5
  );

  // ---- PHASE 5 (4.8–5.2s): Overlay fully fades, hero takes over ----
  tl.to(
    overlay,
    {
      opacity: 0,
      duration: 0.4,
      ease: "power2.out",
    },
    4.8
  );

  return tl;
}
