"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimate } from "framer-motion";
import ParticlesBackground from "../components/ParticlesBackground";
import DotGridBackground from "../components/DotGridBackground";
import AppPage from "../components/AppPage";

export default function AppRoute() {
  const [scope, animate] = useAnimate();
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      await animate(".dot-grid-background", { opacity: 1 }, { duration: 0 });
      await animate(".app-page-container", { opacity: 1 }, { duration: 0 });
    };
    init();
  }, [animate]);

  return (
    <motion.div
      ref={scope}
      className="relative min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <DotGridBackground />

      <div className="app-page-container absolute inset-0 z-20 pointer-events-none">
        <AppPage />
      </div>
    </motion.div>
  );
}
