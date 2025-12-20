import { InputNode } from "@/app/types/graph";
import { ArrowUp, ChevronRight, Pencil } from "lucide-react";
import { useState } from "react";

type Mode = "ask" | "display";

export const InputFieldNode = ({
  node,
  onInputSubmit,
}: {
  node: InputNode;
  onInputSubmit: (query: string) => void;
}) => {
  const [mode, setMode] = useState<Mode>("ask");
  const [query, setQuery] = useState("");

  const handleSubmit = () => {
    if (query.trim() === "") return;
    onInputSubmit(query);

    setMode("display");
  };

  const handleEdit = () => {
    setMode("ask");
  };

  return (
    <div className="w-[400px] group" data-node-id={node.id}>
      <div className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
        {mode === "display" ? (
          <div className="py-5 pl-4 pr-4 w-full rounded-3xl border-none bg-[#0a0a0a] text-white flex justify-between items-center gap-2 cursor-pointer">
            <span className="flex items-center gap-2">
              <ChevronRight className="size-4" />
              <p className="text-sm text-secondary font-mono">{query}</p>
            </span>

            {/* Edit Icon */}
            <button onClick={handleEdit} className="cursor-text">
              <Pencil className="size-4 hidden group-hover:block opacity-50 hover:opacity-100 transition-opacity" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <textarea
              name="query"
              className="block resize-none py-5 pl-4 pr-16 h-[120px] w-full rounded-3xl border-none focus:outline-none focus:ring-2 focus:ring-zinc-500 bg-[#0a0a0a] text-white placeholder:text-white/50 cursor-text"
              placeholder="What do you want to know?"
              aria-label="Query"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              autoFocus
            />
            <div className="absolute bottom-2.5 right-2.5 flex items-center">
              <button
                aria-label="Submit query"
                className="aspect-square rounded-full p-2.5 bg-white text-black hover:bg-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                disabled={query.trim().length === 0}
                onMouseDown={e => e.stopPropagation()}
                onClick={handleSubmit}
              >
                <ArrowUp strokeWidth={2} className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
