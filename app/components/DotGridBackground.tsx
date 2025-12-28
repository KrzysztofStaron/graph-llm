const DotGridBackground = () => {
  return (
    <div
      className="dot-grid-background fixed inset-0 -z-20"
      style={{
        backgroundSize: "40px 40px",
        backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
        backgroundColor: "#0a0a0a",
        opacity: 0.8,
        backgroundPosition: "0 0",
      }}
    />
  );
};

export default DotGridBackground;
