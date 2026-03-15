"use client";

import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useMotionValueEvent,
  animate,
} from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  fadeInUp,
  staggerContainer,
  pageTransition,
} from "@/lib/motion";
import { useSchoolMaybe } from "@/components/shared/school-context";

export function RevealOnScroll({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: 0, y: 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: [0, 0, 0.2, 1], delay },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerChildren({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedNumber({
  value,
  className,
  duration = 1.5,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(0, value, {
      duration,
      ease: [0, 0, 0.2, 1],
      onUpdate: (v) => setDisplayValue(Math.round(v)),
    });
    return controls.stop;
  }, [value, isInView, duration]);

  return (
    <span ref={ref} className={className}>
      {displayValue.toLocaleString()}
    </span>
  );
}

export function RevealOnScrollDirectional({
  children,
  className,
  direction = "left",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  direction?: "left" | "right";
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const xOffset = direction === "left" ? -60 : 60;

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: 0, x: xOffset },
        visible: {
          opacity: 1,
          x: 0,
          transition: { duration: 0.3, ease: [0, 0, 0.2, 1], delay },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const school = useSchoolMaybe();
  if (school?.disableAnimations) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageTransition}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Parallax — element moves at a different rate than scroll
export function Parallax({
  children,
  className,
  speed = 0.3,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  direction?: "up" | "down";
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const multiplier = direction === "up" ? -1 : 1;
  const y = useTransform(scrollYProgress, [0, 1], [multiplier * speed * 150, multiplier * -speed * 150]);

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

// Scale on scroll — element scales up as it enters viewport
export function ScaleOnScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end 0.7"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [0.85, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);

  return (
    <motion.div ref={ref} style={{ scale, opacity }} className={className}>
      {children}
    </motion.div>
  );
}

// Scroll progress bar at top of page
export function ScrollProgressBar({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      style={{ scaleX: scrollYProgress, transformOrigin: "left" }}
      className={className ?? "fixed top-0 left-0 right-0 z-[100] h-[2px] bg-primary shadow-[0_0_10px_var(--glow-primary)]"}
    />
  );
}

// Header that gains background on scroll
export function ScrollHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 50);
  });

  return (
    <motion.header
      className={className}
      animate={{
        backgroundColor: scrolled ? "hsl(var(--background) / 0.8)" : "hsl(var(--background) / 0)",
        backdropFilter: scrolled ? "blur(12px)" : "blur(0px)",
        borderBottomColor: scrolled ? "hsl(var(--border) / 0.5)" : "hsl(var(--border) / 0)",
        borderBottomWidth: scrolled ? 1 : 0,
      }}
      transition={{ duration: 0.3 }}
      style={{ borderBottomStyle: "solid" }}
    >
      {children}
    </motion.header>
  );
}

// Fade + blur reveal on scroll
export function BlurReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
      animate={isInView ? { opacity: 1, filter: "blur(0px)", y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0, 0, 0.2, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Slot machine hero — words slam down from above with heavy bounce
export function SlotMachineHero({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (isInView && !shouldAnimate) {
      requestAnimationFrame(() => setShouldAnimate(true));
    }
  }, [isInView, shouldAnimate]);

  const text = typeof children === "string" ? children : "";
  const lines = text.split("\n").filter(Boolean);

  let globalIdx = 0;
  const allWords: { word: string; lineIdx: number; idx: number }[] = [];
  lines.forEach((line, lineIdx) => {
    line.split(/\s+/).filter(Boolean).forEach((word) => {
      allWords.push({ word, lineIdx, idx: globalIdx++ });
    });
  });

  // Group by line
  const lineGroups = lines.map((_, lineIdx) =>
    allWords.filter((w) => w.lineIdx === lineIdx)
  );

  const totalWords = allWords.length;
  const lastWordLands = totalWords * 0.12 + 0.15;

  return (
    <div ref={ref} className={`relative overflow-hidden ${className ?? ""}`}>
      {lineGroups.map((group, lineIdx) => (
        <div key={lineIdx} className="flex flex-wrap justify-center gap-x-[0.3em]">
          {group.map((wd) => {
            const wordDelay = wd.idx * 0.12 + 0.15;
            return (
              <motion.span
                key={wd.idx}
                className="inline-block"
                initial={{ y: "-300%", opacity: 0, scaleY: 1.5 }}
                animate={
                  shouldAnimate
                    ? { y: 0, opacity: 1, scaleY: 1 }
                    : {}
                }
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                  mass: 1.2,
                  delay: wordDelay,
                  opacity: { duration: 0.15, delay: wordDelay },
                }}
              >
                {wd.word}
              </motion.span>
            );
          })}
        </div>
      ))}

      {/* Impact flash when last word lands */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, oklch(1 0 0 / 25%) 0%, transparent 70%)",
        }}
        initial={{ opacity: 0 }}
        animate={shouldAnimate ? { opacity: [0, 0, 1, 0] } : {}}
        transition={{
          duration: 0.6,
          times: [0, 0.01, 0.15, 1],
          delay: lastWordLands + 0.4,
          ease: "easeOut",
        }}
      />
    </div>
  );
}

export { motion };
export { fadeInUp };
export { metallicReveal, shineFlash, metallicCardEntrance, slideInLeft, slideInRight, slideInScale } from "@/lib/motion";
