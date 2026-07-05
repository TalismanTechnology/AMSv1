/**
 * Faint line-art atmosphere for the editorial hero: a hand-drawn campus
 * building anchored bottom-left and botanical branches framing the corners.
 * Pure decoration — inert to pointer + screen readers. Drawn in ink navy at
 * very low opacity so it sits behind the content as texture, adding depth
 * without competing with the headline.
 */
export function BotanicalDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden">
      {/* Campus building — bottom left */}
      <svg
        className="absolute -bottom-6 left-[-2%] w-[300px] text-ink opacity-[0.07] sm:w-[380px]"
        viewBox="0 0 200 220"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M40 210V95l55-38 55 38v115" />
        <path d="M95 57V30M88 34h14M84 40h22" />
        <path d="M95 30l-5 8h10z" />
        <rect x="82" y="120" width="26" height="90" />
        <path d="M95 120v90M82 150h26M82 180h26" />
        <path d="M55 120h16v34H55zM119 120h16v34h-16z" />
        <path d="M63 120v34M127 120v34M55 137h16M119 137h16" />
        <path d="M30 210h130M46 95h98" />
      </svg>

      {/* Botanical branch — top left */}
      <svg
        className="absolute left-[-30px] top-[-20px] w-[220px] text-ink opacity-[0.06]"
        viewBox="0 0 160 160"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <path d="M10 10c30 20 55 55 70 100" />
        {[
          [28, 34],
          [42, 56],
          [56, 80],
          [70, 106],
        ].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y}c-18-6-30-2-40 8 14 6 30 6 42-2`} />
            <path d={`M${x} ${y}c14-14 30-18 46-14-10 14-28 20-44 18`} />
          </g>
        ))}
      </svg>

      {/* Botanical branch — right edge */}
      <svg
        className="absolute right-[-40px] top-1/4 hidden w-[260px] text-ink opacity-[0.05] lg:block"
        viewBox="0 0 160 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <path d="M150 0c-40 30-64 78-70 140" />
        {[
          [132, 30],
          [112, 66],
          [96, 104],
          [84, 140],
        ].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y}c18-8 32-4 42 8-14 6-32 6-44-2`} />
            <path d={`M${x} ${y}c-12-14-28-20-44-16 10 14 28 20 44 16`} />
          </g>
        ))}
      </svg>
    </div>
  );
}
