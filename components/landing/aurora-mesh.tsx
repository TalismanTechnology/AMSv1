"use client";

// Slow-drifting multi-radial gradient mesh that sits behind the hero,
// above the topographic canvas, below the orbs.
// Pure CSS animation — pauses automatically on prefers-reduced-motion via globals.
export function AuroraMesh({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-[2] overflow-hidden ${className ?? ""}`}
    >
      <div className="aurora-mesh absolute inset-0" />
    </div>
  );
}
