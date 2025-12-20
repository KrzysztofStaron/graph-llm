"use client";

import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { useEffect, useState } from "react";
import ArrowButton from "./components/ArrowButton";
import MonoLabel from "./components/MonoLabel";

export default function Home() {
  return (
    <>
      <div className="flex flex-col items-center justify-center h-screen relative z-10 max-w-[1024px] mx-auto">
        <h1 className="text-4xl font-bold">Understand the universe </h1>

        <MonoLabel text="WITH AI" />

        <div className="mt-10 min-w-lg border-l-2 rounded-bl-full border-white/10 px-24 p-10 pb-[200px] relative overflow-hidden">
          <h3 className="text-2xl relative z-10">Graph UX</h3>
          <p className="text-secondary mt-2 relative z-10">
            Free yourself from contrains of linearity, embrace exploration. <br />
            Avalible now on web
          </p>
          <ArrowButton text="USE NOW" />
        </div>
      </div>

      <ParticlesBackground />
    </>
  );
}

const BezierCurve = () => {
  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="bezierGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M 0 0 Q 0 100, 80 100"
        fill="none"
        stroke="url(#bezierGradient)"
        strokeWidth="1"
        className="text-white/10"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const ParticlesBackground = () => {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async engine => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) return null;

  return (
    <div
      className="absolute inset-0 -z-10"
      style={{
        maskImage: "radial-gradient(ellipse 600px 450px at center, transparent 0%, transparent 60%, black 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 600px 450px at center, transparent 0%, transparent 60%, black 100%)",
      }}
    >
      <Particles
        id="tsparticles"
        className="absolute inset-0"
        options={{
          background: {
            color: {
              value: "transparent",
            },
          },
          fpsLimit: 120,

          particles: {
            color: {
              value: "#ffffff",
            },
            links: {
              color: "#ffffff",
              distance: 150,
              enable: true,
              opacity: 0.1,
              width: 1,
            },
            move: {
              direction: "bottom-right",
              enable: true,
              outModes: {
                default: "out",
              },
              random: false,
              speed: 1,
              straight: false,
            },
            number: {
              density: {
                enable: true,
              },
              value: 80,
            },
            opacity: {
              value: 0.2,
            },
            shape: {
              type: "circle",
            },
            size: {
              value: { min: 1, max: 3 },
            },
          },
          detectRetina: true,
        }}
      />
    </div>
  );
};
