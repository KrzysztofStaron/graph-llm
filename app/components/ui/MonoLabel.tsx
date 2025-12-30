const MonoLabel = ({
  text,
  className,
}: {
  text: string;
  className?: string;
}) => {
  return (
    <div className={`flex gap-3 text-sm text-secondary ${className}`}>
      <span className="font-mono">[</span>
      <span className="font-mono">{text}</span>
      <span className="font-mono">]</span>
    </div>
  );
};

export default MonoLabel;
