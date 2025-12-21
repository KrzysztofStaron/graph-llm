interface DotGridBackgroundProps {
  canvasOffset?: { x: number; y: number };
}

const DotGridBackground = ({ canvasOffset = { x: 0, y: 0 } }: DotGridBackgroundProps) => {
  return (
    <div
      className="dot-grid-background fixed inset-0 -z-20"
      style={{
        backgroundSize: "40px 40px",
        backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
        backgroundColor: "#0a0a0a",
        opacity: 0.8,
        backgroundPosition: `${canvasOffset.x % 40}px ${canvasOffset.y % 40}px`,
      }}
    />
  );
};

export default DotGridBackground;
