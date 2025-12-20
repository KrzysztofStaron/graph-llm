import { ContextNode as ContextNodeType } from "@/app/types/graph";
import { FileText } from "lucide-react";

export const ContextNode = ({ node }: { node: ContextNodeType }) => {
  return (
    <div
      className="w-24 h-24 flex items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20"
      data-node-id={node.id}
    >
      <div className="w-full h-full flex items-center justify-center rounded-3xl border-none bg-[#0a0a0a] text-white">
        <FileText className="size-8" />
      </div>
    </div>
  );
};
