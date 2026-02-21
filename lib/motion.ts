import type { Variants, Transition } from "framer-motion";

// Easing curves
export const ease = {
  smooth: [0.25, 0.1, 0.25, 1.0] as const,
  out: [0.0, 0.0, 0.2, 1.0] as const,
  inOut: [0.4, 0.0, 0.2, 1.0] as const,
};

// Duration scale (seconds)
export const duration = {
  fast: 0.1,
  normal: 0.2,
  slow: 0.3,
  page: 0.25,
  stagger: 0.04,
};

// Common animation variants
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.normal, ease: ease.smooth },
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: ease.out },
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.normal, ease: ease.out },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: duration.stagger,
      delayChildren: 0.03,
    },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

// Page transition
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.page, ease: ease.out },
  },
};

// Chat message entrance
export const messageEntrance: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: duration.normal,
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },
};

// Metallic reveal — fade in with brightness flash
export const metallicReveal: Variants = {
  hidden: { opacity: 0, scale: 0.97, filter: "brightness(0.8)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "brightness(1)",
    transition: {
      duration: duration.slow,
      ease: ease.out,
    },
  },
};

// Shine flash — brightness pulse on appearance
export const shineFlash: Variants = {
  hidden: { opacity: 0, filter: "brightness(0.7)" },
  visible: {
    opacity: 1,
    filter: ["brightness(0.7)", "brightness(1.15)", "brightness(1)"],
    transition: {
      duration: 0.4,
      ease: ease.out,
      filter: {
        duration: 0.5,
        times: [0, 0.4, 1],
      },
    },
  },
};

// Metallic card entrance — subtle tilt perspective
export const metallicCardEntrance: Variants = {
  hidden: { opacity: 0, y: 20, rotateX: 2 },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: {
      duration: duration.slow,
      ease: ease.out,
    },
  },
};

// Slide in from the left
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.slow, ease: ease.out },
  },
};

// Slide in from the right
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: duration.slow, ease: ease.out },
  },
};

// Slide in with scale (for CTA sections)
export const slideInScale: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: ease.out },
  },
};

// Sidebar animation
export const sidebarVariants: Variants = {
  expanded: {
    width: 256,
    transition: { duration: duration.normal, ease: ease.smooth },
  },
  collapsed: {
    width: 64,
    transition: { duration: duration.normal, ease: ease.smooth },
  },
};
