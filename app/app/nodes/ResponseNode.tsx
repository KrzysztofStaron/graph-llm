import { ResponseNode as ResponseNodeType } from "@/app/types/graph";

export const ResponseNode = ({ node }: { node: ResponseNodeType }) => {
  const content = node.value;
  const isLoading = content.length === 0;

  return (
    <div className="w-[400px]">
      <div className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
        <div className="block resize-none py-5 pl-4 pr-4 w-full rounded-3xl border-none bg-[#0a0a0a] text-white">
          {isLoading ? (
            <div className="flex items-center gap-3 text-white/70">
              <div className="size-4 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
              <p className="text-sm font-mono">Loading…</p>
            </div>
          ) : (
            <p>{content}</p>
          )}
        </div>
      </div>
    </div>
  );
};
