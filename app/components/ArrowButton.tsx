import { ArrowUpRight } from "lucide-react";
import React from "react";

const ArrowButton = ({ text }: { text: string }) => {
  return (
    <button className="cursor-pointer absolute bottom-30 left-1/2 transform -translate-x-1/2 flex rounded-full bg-black/90 px-8 py-2 font-mono text-sm items-center gap-2 border border-white/10 hover:bg-white/10 transition-all duration-100">
      {text}
      <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
    </button>
  );
};

export default ArrowButton;
