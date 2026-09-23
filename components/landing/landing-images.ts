// Manifest of the photography slots on the marketing page. Each entry is a
// file under public/images/landing/. A slot whose file doesn't exist yet
// borrows one of the finished photos as a stand-in (never an empty card);
// the moment the real file lands, it takes over on the next load.
//
// Every image is shot to the site palette: warm cream #faf8f5, forest
// #2d3a2e, sage #7a9a7c, soft morning light, medium-format film look, and
// no legible text or signage anywhere in frame.

export type LandingImage = {
  src: string;
  alt: string;
  /** Intrinsic aspect ratio of the file; the slot may crop it further. */
  ratio: "3/2" | "2/3" | "1/1";
  /** A finished photo to show while `src` is still being generated. */
  standIn?: string;
};

/* Finished photos that other slots can stand in with. */
const READY = {
  playground: "/images/landing/playground.jpg",
  campusTrees: "/images/landing/campus-trees.jpg",
  hallwayLockers: "/images/landing/hallway-lockers.jpg",
};

export const LANDING_IMAGES = {
  /* ── Foreground plate ──────────────────────────────────────────────── */
  pickupLine: {
    src: "/images/landing/pickup-line.jpg",
    alt: "Parents waiting under trees at afternoon pickup as children run toward them.",
    ratio: "3/2",
    standIn: READY.playground,
  },

  /* ── Backdrops (used faint, behind sections) ───────────────────────────
     Downscaled and, where the design wants softness, pre-blurred files.
     Each stands in with its full-size sharp original if the derived file
     is ever missing. Regenerate with ImageMagick:
       magick hallway-lockers.jpg -resize 1200x -blur 0x5 -quality 68 hallway-lockers-soft.jpg
       magick playground.jpg      -resize 1000x -blur 0x4 -quality 68 playground-soft.jpg
       magick campus-trees.jpg    -resize 1200x -quality 70 campus-trees-bg.jpg */
  campusTrees: {
    src: "/images/landing/campus-trees-bg.jpg",
    alt: "",
    ratio: "3/2",
    standIn: READY.campusTrees,
  },
  hallwayLockersSoft: {
    src: "/images/landing/hallway-lockers-soft.jpg",
    alt: "",
    ratio: "3/2",
    standIn: READY.hallwayLockers,
  },
  playgroundSoft: {
    src: "/images/landing/playground-soft.jpg",
    alt: "",
    ratio: "1/1",
    standIn: READY.playground,
  },
} as const satisfies Record<string, LandingImage>;
