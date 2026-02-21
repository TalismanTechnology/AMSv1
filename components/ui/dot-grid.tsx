"use client";

export function DotGrid() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10"
      aria-hidden="true"
      style={{
        opacity: 0.04,
        mixBlendMode: "overlay" as const,
        backgroundImage:
          "radial-gradient(circle, currentColor 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    />
  );
}
