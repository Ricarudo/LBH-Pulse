"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  m,
  type AnimationDefinition,
  useReducedMotion
} from "motion/react";
import { routeMotionProfile, type RouteMotionProfile } from "@/lib/navigation";
import type { MotionMode } from "@pulse/contracts/settings";

type PageTransitionProps = {
  children: React.ReactNode;
  header?: React.ReactNode;
  isNavigating?: boolean;
  motionMode: MotionMode;
};

const enterEase: [number, number, number, number] = [0.16, 1, 0.3, 1];
const exitEase: [number, number, number, number] = [0.4, 0, 1, 1];
const frameEase: [number, number, number, number] = [0.2, 0, 0, 1];

function enterState(
  profile: RouteMotionProfile,
  subtle: boolean,
  reduceMotion: boolean
): Record<string, number | string> {
  if (reduceMotion) {
    return { opacity: 0, x: 0, y: 0, scale: 1, filter: "none", zIndex: 3 };
  }

  if (subtle) {
    const distance = profile.kind === "lateral" ? profile.direction * 4 : 0;
    return { opacity: 0, x: distance, y: 2, scale: 1, filter: "none", zIndex: 3 };
  }

  if (profile.kind === "drill-in") {
    return { opacity: 0, x: 0, y: 16, scale: 0.985, filter: "blur(5px)", zIndex: 3 };
  }

  if (profile.kind === "drill-out") {
    return { opacity: 0, x: 0, y: -10, scale: 1.006, filter: "blur(4px)", zIndex: 3 };
  }

  if (profile.kind === "lateral") {
    return {
      opacity: 0,
      x: profile.direction * 24,
      y: 4,
      scale: 0.992,
      filter: "blur(3px)",
      zIndex: 3
    };
  }

  return { opacity: 0, x: 0, y: 8, scale: 0.992, filter: "blur(3px)", zIndex: 3 };
}

function exitState(
  profile: RouteMotionProfile,
  subtle: boolean,
  reduceMotion: boolean,
  duration: number
) {
  if (reduceMotion) {
    return {
      opacity: 0,
      x: 0,
      y: 0,
      scale: 1,
      filter: "none",
      zIndex: 1,
      transition: { duration: 0.01, ease: exitEase }
    };
  }

  if (subtle) {
    const distance = profile.kind === "lateral" ? profile.direction * -3 : 0;
    return {
      opacity: 0,
      x: distance,
      y: -1,
      scale: 1,
      filter: "none",
      zIndex: 1,
      transition: { duration, ease: exitEase }
    };
  }

  if (profile.kind === "drill-in") {
    return {
      opacity: 0,
      x: 0,
      y: -8,
      scale: 1.006,
      filter: "blur(2px)",
      zIndex: 1,
      transition: { duration, ease: exitEase }
    };
  }

  if (profile.kind === "drill-out") {
    return {
      opacity: 0,
      x: 0,
      y: 10,
      scale: 0.99,
      filter: "blur(2px)",
      zIndex: 1,
      transition: { duration, ease: exitEase }
    };
  }

  return {
    opacity: 0,
    x: profile.kind === "lateral" ? profile.direction * -11 : 0,
    y: -3,
    scale: 0.997,
    filter: "blur(2px)",
    zIndex: 1,
    transition: { duration, ease: exitEase }
  };
}

export function PageTransition({
  children,
  header,
  isNavigating = false,
  motionMode
}: PageTransitionProps) {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const reduceMotionPreference = useReducedMotion();
  const reduceMotion = reduceMotionPreference === true;
  const [frameVisible, setFrameVisible] = useState(false);
  const profile = routeMotionProfile(previousPathRef.current, pathname);

  useEffect(() => {
    if (previousPathRef.current !== pathname && !reduceMotion) {
      setFrameVisible(true);
    }
    previousPathRef.current = pathname;
  }, [pathname, reduceMotion]);

  useEffect(() => {
    if (isNavigating && !reduceMotion) {
      setFrameVisible(true);
    }
  }, [isNavigating, reduceMotion]);

  const subtle = motionMode === "subtle" || reduceMotion;
  const enterDuration = reduceMotion ? 0.01 : subtle ? 0.13 : 0.34;
  const exitDuration = reduceMotion ? 0.01 : subtle ? 0.07 : 0.12;
  const frameDuration = subtle ? 0.08 : 0.14;

  useEffect(() => {
    if (!frameVisible || isNavigating) return;
    const timeout = window.setTimeout(() => {
      setFrameVisible(false);
    }, subtle ? 260 : 700);
    return () => window.clearTimeout(timeout);
  }, [frameVisible, isNavigating, subtle, pathname]);

  return (
    <section className="page-transition-stage" aria-busy={isNavigating}>
      <AnimatePresence>
        {frameVisible && !reduceMotion ? (
          <m.div
            aria-hidden="true"
            className="route-transition-frame"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: frameDuration, ease: frameEase }}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false} mode="wait" custom={profile}>
        <m.div
          key={pathname}
          className="page-transition"
          custom={profile}
          variants={{
            enter: (routeProfile: RouteMotionProfile) =>
              enterState(routeProfile, subtle, reduceMotion),
            center: {
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              filter: "none",
              zIndex: 3
            },
            exit: (routeProfile: RouteMotionProfile) =>
              exitState(routeProfile, subtle, reduceMotion, exitDuration)
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            duration: enterDuration,
            ease: enterEase
          }}
          onAnimationComplete={(definition: AnimationDefinition) => {
            if (definition === "center" && !isNavigating) {
              setFrameVisible(false);
            }
          }}
        >
          {header}
          {children}
        </m.div>
      </AnimatePresence>
    </section>
  );
}
