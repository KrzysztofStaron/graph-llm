const MonoLabel = ({ text }: { text: string }) => {
  return (
    <div className="flex gap-3 text-sm text-secondary">
      <span className="font-mono">[</span>
      <span className="font-mono">{text}</span>
      <span className="font-mono">]</span>
    </div>
  );
};

export default MonoLabel;
