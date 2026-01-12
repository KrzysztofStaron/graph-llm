"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion, useAnimate, useReducedMotion } from "framer-motion";
import LandingPage from "./components/LandingPage";
import ParticlesBackground from "./components/ParticlesBackground";
import DotGridBackground from "./components/DotGridBackground";
import AppRoute from "./app/page";

export default function Home() {
  const [scope, animate] = useAnimate();
  const pathname = usePathname();
  const router = useRouter();
  const showApp = pathname === "/app";
  const shouldReduceMotion = useReducedMotion();

  const handleStart = async () => {
    const duration = shouldReduceMotion ? 0 : undefined;
    const hideAnims = [
      animate("main", { opacity: 0, ...(shouldReduceMotion ? {} : { y: -20 }) }, { duration: duration ?? 0.125 }),
      animate(".particles-background", { opacity: 0 }, { duration: duration ?? 0.25 }),
      animate(".dot-grid-background", { opacity: 1 }, { duration: duration ?? 0.25 }),
    ];

    await Promise.all(hideAnims);

    router.push("/app");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await animate(".app-page-container", { opacity: 1 }, { duration: duration ?? 0.125 });
  };

  return (
    <motion.div
      ref={scope}
      className="relative min-h-dvh"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.1 }}
    >
      <div className="opacity-50">
        <DotGridBackground />
      </div>
      <LandingPage onStart={handleStart} />
      <ParticlesBackground />

      <div className="app-page-container absolute inset-0 z-20 pointer-events-none">
        {showApp && <AppRoute />}
      </div>
    </motion.div>
  );
}
