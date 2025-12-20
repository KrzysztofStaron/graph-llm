"use client";

import { useState } from "react";
import { motion, useAnimate } from "framer-motion";
import LandingPage from "./components/LandingPage";
import ParticlesBackground from "./components/ParticlesBackground";
import DotGridBackground from "./components/DotGridBackground";
import AppPage from "./components/AppPage";

export default function Home() {
  const [scope, animate] = useAnimate();
  const [showApp, setShowApp] = useState(false);

  const handleStart = async () => {
    const hideAnims = [
      animate("main", { opacity: 0, y: -20 }, { duration: 0.25 }),
      animate(".particles-background", { opacity: 0 }, { duration: 0.5 }),
      animate(".dot-grid-background", { opacity: 1 }, { duration: 0.5 }),
    ];

    await Promise.all(hideAnims);

    setShowApp(true);
    await new Promise(resolve => requestAnimationFrame(resolve));
    await animate(".app-page-container", { opacity: 1 }, { duration: 0.25 });
  };

  return (
    <motion.div
      ref={scope}
      className="relative min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <DotGridBackground />
      <LandingPage onStart={handleStart} />
      <ParticlesBackground />

      <div className="app-page-container absolute inset-0 z-20 pointer-events-none">{showApp && <AppPage />}</div>
    </motion.div>
  );
}
