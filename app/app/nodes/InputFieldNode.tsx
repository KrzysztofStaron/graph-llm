import { ArrowUp } from "lucide-react";
import { useState } from "react";

export const InputFieldNode = () => {
  const [query, setQuery] = useState("");

  return (
    <div className="w-[400px]">
      <div className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
        <textarea
          name="query"
          className="block resize-none py-5 pl-4 pr-16 h-[120px] w-full rounded-3xl border-none focus:outline-none focus:ring-2 focus:ring-zinc-500 bg-[#0a0a0a] text-white placeholder:text-white/50 cursor-text"
          placeholder="What do you want to know?"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
        />
        <div className="absolute bottom-2.5 right-2.5 flex items-center">
          <button
            aria-label="Submit query"
            className="aspect-square rounded-full p-2.5 bg-white text-black hover:bg-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            disabled={query.length === 0}
            onMouseDown={e => e.stopPropagation()}
          >
            <ArrowUp strokeWidth={2} className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

