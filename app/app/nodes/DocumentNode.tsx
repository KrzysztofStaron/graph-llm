import { memo } from "react";
import { DocumentNode as DocumentNodeType } from "@/app/types/graph";
import { FaRegFilePdf } from "react-icons/fa";
import { BsFiletypeDocx } from "react-icons/bs";
import { BsFileEarmarkSpreadsheet } from "react-icons/bs";
import { BsFiletypePptx } from "react-icons/bs";
import { BsFiletypeTxt } from "react-icons/bs";
import { BsFiletypeMd } from "react-icons/bs";
import { LuFileJson } from "react-icons/lu";
import { BsFiletypeCsv } from "react-icons/bs";
import { FaHtml5 } from "react-icons/fa";
import { FileText } from "lucide-react";
import { FiFileText } from "react-icons/fi";

type DocumentNodeProps = {
  node: DocumentNodeType;
  isSelected?: boolean;
};

function arraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Extract filename from node value or use a default
const getFilename = (value: string): string => {
  // Check if value contains metadata in format: "filename:actual_content"
  // For now, we'll store just the filename as a prefix in the value
  // Format: "FILENAME:filename.pdf\n\ncontent..."
  if (value.startsWith("FILENAME:")) {
    const lines = value.split("\n");
    const filenameLine = lines[0];
    return filenameLine.replace("FILENAME:", "");
  }
  return "document";
};

const truncateFilename = (filename: string, maxLength: number = 30): string => {
  if (filename.length <= maxLength) return filename;
  return filename.slice(0, maxLength - 3) + "...";
};

// Get icon component based on file extension
const getFileIcon = (filename: string) => {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.endsWith(".pdf")) {
    return <FaRegFilePdf className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".docx")) {
    return <BsFiletypeDocx className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".xlsx")) {
    return <BsFileEarmarkSpreadsheet className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".pptx")) {
    return <BsFiletypePptx className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".html") || lowerFilename.endsWith(".htm")) {
    return <FaHtml5 className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".txt")) {
    return <FiFileText className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".md")) {
    return <BsFiletypeMd className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".json")) {
    return <LuFileJson className="size-8 mb-1" />;
  }
  if (lowerFilename.endsWith(".csv")) {
    return <BsFiletypeCsv className="size-8 mb-1" />;
  }

  // Default icon for other file types
  return <FileText className="size-8 mb-1" />;
};

const DocumentNodeContent = ({
  node,
  isSelected = false,
}: DocumentNodeProps) => {
  const filename = getFilename(node.value);
  const truncatedFilename = truncateFilename(filename);

  return (
    <div className="flex items-center group">
      <div
        className="w-24 h-24 flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-linear-to-tr p-px from-white/5 to-white/20"
        style={{
          boxShadow: isSelected
            ? "0 0 0 2px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)"
            : undefined,
          transition: "box-shadow 0.2s ease",
        }}
      >
        <div className="w-full h-full flex flex-col items-center justify-center rounded-3xl border-none bg-[#0a0a0a] text-white">
          {getFileIcon(filename)}
          <span className="text-xs text-white/70 px-2 text-center truncate w-full">
            {truncatedFilename}
          </span>
        </div>
      </div>
    </div>
  );
};

export const DocumentNode = memo(
  (props: DocumentNodeProps) => <DocumentNodeContent {...props} />,
  (prev, next) =>
    prev.node.value === next.node.value &&
    arraysEqual(prev.node.parentIds, next.node.parentIds) &&
    arraysEqual(prev.node.childrenIds, next.node.childrenIds) &&
    prev.isSelected === next.isSelected
);

DocumentNode.displayName = "DocumentNode";
