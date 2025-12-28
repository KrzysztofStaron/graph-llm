import { useEffect, useRef } from "react";

type ParticleEffectProps = {
  x: number;
  y: number;
  onComplete?: () => void;
};

export const ParticleEffect = ({ x, y, onComplete }: ParticleEffectProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const size = 200;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    // Create particles
    const particleCount = 8;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
    }> = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.3;
      const speed = 15 + Math.random() * 20;
      particles.push({
        x: size / 2,
        y: size / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
      });
    }

    let animationFrame: number;
    const startTime = Date.now();
    const duration = 200; // ms

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Clear canvas
      ctx.clearRect(0, 0, size, size);

      // Update and draw particles
      particles.forEach((particle) => {
        particle.x += particle.vx * 0.1;
        particle.y += particle.vy * 0.1;
        particle.life = 1 - progress;

        const alpha = particle.life * 0.4; // More subtle opacity
        const particleSize = 2 * particle.life;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particleSize, 0, Math.PI * 2);
        ctx.fill();
      });

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animate();

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute"
      style={{
        left: `${x - 100}px`,
        top: `${y - 100}px`,
        zIndex: 1000,
      }}
    />
  );
};
