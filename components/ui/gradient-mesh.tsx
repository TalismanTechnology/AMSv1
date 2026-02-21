"use client";

export function GradientMesh() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      {/* Blue-steel orb, top-left */}
      <div
        className="absolute -left-[10%] -top-[15%] h-[600px] w-[600px] rounded-full blur-[140px]"
        style={{
          background: "radial-gradient(circle, #4682b4 0%, #2c3e50 60%, transparent 100%)",
          opacity: 0.07,
          animation: "float-orb-1 20s ease-in-out infinite",
        }}
      />
      {/* Platinum orb, center-right */}
      <div
        className="absolute right-[0%] top-[25%] h-[500px] w-[500px] rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(circle, #e5e4e2 0%, #536872 60%, transparent 100%)",
          opacity: 0.05,
          animation: "float-orb-2 18s ease-in-out infinite",
        }}
      />
      {/* Chrome orb, bottom-center */}
      <div
        className="absolute -bottom-[10%] left-[30%] h-[550px] w-[550px] rounded-full blur-[150px]"
        style={{
          background: "radial-gradient(circle, #d4d4d4 0%, #2a3439 60%, transparent 100%)",
          opacity: 0.06,
          animation: "float-orb-3 24s ease-in-out infinite",
        }}
      />
      {/* Small accent orb for glow-pulse */}
      <div
        className="absolute left-[60%] top-[10%] h-[300px] w-[300px] rounded-full blur-[100px]"
        style={{
          background: "radial-gradient(circle, #4682b4 0%, transparent 70%)",
          opacity: 0.04,
          animation: "glow-pulse 8s ease-in-out infinite, float-orb-2 22s ease-in-out infinite",
        }}
      />
    </div>
  );
}
