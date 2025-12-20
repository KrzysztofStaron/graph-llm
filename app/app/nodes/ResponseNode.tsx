interface ResponseNodeProps {
  content?: string;
}

export const ResponseNode = ({ content }: ResponseNodeProps) => {
  return (
    <div className="w-[400px]">
      <div className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
        <div className="block resize-none py-5 pl-4 pr-4 w-full rounded-3xl border-none bg-[#0a0a0a] text-white">
          <p>{content || "Response content..."}</p>
        </div>
      </div>
    </div>
  );
};

