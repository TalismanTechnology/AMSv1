"use client";

import {
  motion,
  useInView,
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

export { motion };
export { fadeInUp };
export { metallicReveal, shineFlash, metallicCardEntrance, slideInLeft, slideInRight, slideInScale } from "@/lib/motion";
