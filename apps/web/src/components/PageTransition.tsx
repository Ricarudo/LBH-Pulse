"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { routeMotionDirection } from "@/lib/navigation";
import type { MotionMode } from "@/types/settings";

type PageTransitionProps = {
  children: React.ReactNode;
  motionMode: MotionMode;
};

export function PageTransition({ children, motionMode }: PageTransitionProps) {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const reduceMotion = useReducedMotion();
  const direction = routeMotionDirection(previousPathRef.current, pathname);

  useEffect(() => {
    previousPathRef.current = pathname;
  }, [pathname]);

  const subtle = motionMode === "subtle" || reduceMotion;
  const distance = reduceMotion ? 0 : subtle ? 5 : 22;
  const duration = reduceMotion ? 0.01 : subtle ? 0.17 : 0.34;

  return (
    <AnimatePresence initial={false} mode="popLayout" custom={direction}>
      <m.div
        key={pathname}
        className="page-transition"
        custom={direction}
        variants={{
          enter: (travelDirection: number) => ({
            opacity: 0,
            x: travelDirection * distance,
            y: subtle ? 3 : 8,
            scale: reduceMotion ? 1 : subtle ? 0.998 : 0.992
          }),
          center: {
            opacity: 1,
            x: 0,
            y: 0,
            scale: 1
          },
          exit: (travelDirection: number) => ({
            opacity: 0,
            x: travelDirection * -Math.max(3, distance * 0.45),
            y: reduceMotion ? 0 : -3,
            scale: reduceMotion ? 1 : 0.997
          })
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{
          duration,
          ease: [0.22, 1, 0.36, 1]
        }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
