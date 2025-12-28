import { InputNode } from "@/app/types/graph";
import { ArrowUp, ChevronRight, Pencil } from "lucide-react";
import { memo, useRef, useState } from "react";

enum Mode {
  ASK = "ask",
  DISPLAY = "display",
}

type InputFieldNodeProps = {
  node: InputNode;
  onInputSubmit: (query: string) => void;
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const InputFieldNode = memo(
  function InputFieldNode({ node, onInputSubmit }: InputFieldNodeProps) {
    const [mode, setMode] = useState<Mode>(Mode.ASK);
    const [query, setQuery] = useState("");
    const [previousQuery, setPreviousQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    const handleSubmit = () => {
      const trimmedQuery = query.trim();
      if (trimmedQuery === "") return;

      setPreviousQuery(trimmedQuery);
      onInputSubmit(trimmedQuery);
      setQuery(trimmedQuery);
      setMode(Mode.DISPLAY);
    };

    const performCancel = () => {
      if (previousQuery) {
        setQuery(previousQuery);
        setMode(Mode.DISPLAY);
      }
    };

    const handleOnBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && containerRef.current?.contains(relatedTarget)) {
        return;
      }

      performCancel();
    };

    const handleEdit = () => {
      // Ask mode allows for free text input
      setMode(Mode.ASK);
    };

    return (
      <div
        ref={containerRef}
        className="w-[400px] group"
        data-node-id={node.id}
      >
        <div className="relative w-full items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-tr p-px from-white/5 to-white/20">
          {mode === Mode.DISPLAY ? (
            <div className="py-5 pl-4 pr-4 w-full rounded-3xl border-none bg-[#0a0a0a] text-white flex justify-between items-center gap-2 cursor-move">
              <span className="flex items-center gap-2">
                <ChevronRight className="size-4" />
                <p className="text-sm text-secondary font-mono">{query}</p>
              </span>

              {/* Edit Icon */}
              <button
                onClick={handleEdit}
                className="cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Pencil className="size-4 hidden group-hover:block opacity-50 hover:opacity-100 transition-opacity" />
              </button>
            </div>
          ) : (
            <div className="relative rounded-3xl bg-[#0a0a0a]">
              {/* Drag handle bar */}
              <div className="h-8 w-full rounded-t-3xl cursor-move flex items-center justify-center">
                <div className="w-12 h-1 rounded-full bg-white/20" />
              </div>
              <textarea
                name="query"
                className="block resize-none px-4 pb-14 w-full border-none focus:outline-none bg-transparent text-white placeholder:text-white/50 cursor-text"
                placeholder="What do you want to know?"
                aria-label="Query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => {
                  e.stopPropagation();
                }}
                onBlur={handleOnBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    performCancel();
                  }
                }}
                autoFocus
              />
              <div className="absolute bottom-2.5 right-2.5 flex items-center">
                <button
                  aria-label="Submit query"
                  className="aspect-square rounded-full p-2.5 bg-white text-black hover:bg-white/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  disabled={query.trim().length === 0}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSubmit();
                  }}
                >
                  <ArrowUp strokeWidth={2} className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => {
    // Only re-render when value, parentIds, or childrenIds change
    return (
      prev.node.value === next.node.value &&
      arraysEqual(prev.node.parentIds, next.node.parentIds) &&
      arraysEqual(prev.node.childrenIds, next.node.childrenIds)
    );
  }
);
