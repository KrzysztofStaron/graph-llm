import React from "react";
import { ParticleEffect } from "../../../components/ui/ParticleEffect";
import { Vector2 } from "@/app/types/graph";

const ParticleRenderer = ({
  positions,
  setPositions,
}: {
  positions: Record<string, Vector2>;
  setPositions: React.Dispatch<React.SetStateAction<Record<string, Vector2>>>;
}) => {
  return (
    positions &&
    Object.entries(positions).map(([nodeId, position]) => (
      <ParticleEffect
        key={nodeId}
        x={position.x}
        y={position.y}
        onComplete={() => {
          setPositions((prev) => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
        }}
      />
    ))
  );
};

export default ParticleRenderer;
