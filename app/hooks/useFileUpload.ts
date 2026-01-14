import { useRef } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { createNode } from "../interfaces/TreeManager";
import { storageService } from "../interfaces/storageService";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { parseDocumentWithFallback } from "../utils/documentParserClient";
import logger from "../utils/logger";

interface UseFileUploadProps {
  graphCanvasRef: React.RefObject<GraphCanvasRef | null>;
}

interface UseFileUploadReturn {
  onDropFilesAsContext: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => Promise<void>;
  handleUploadContext: (canvasPoint: { x: number; y: number }) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const PLAIN_TEXT_EXTENSIONS = [".txt", ".md", ".json", ".csv"];

export const DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
  ".html",
  ".htm",
];

export const UPLOAD_CONTEXT_ACCEPT = [
  "image/*",
  ...PLAIN_TEXT_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
].join(",");

const isDocumentFile = (file: File): boolean => {
  return (
    PLAIN_TEXT_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    ) ||
    DOCUMENT_EXTENSIONS.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    ) ||
    file.type === "application/pdf" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "text/html" ||
    file.type.startsWith("text/")
  );
}

export function useFileUpload({
  graphCanvasRef,
}: UseFileUploadProps): UseFileUploadReturn {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadContextCanvasPointRef = useRef<{ x: number; y: number } | null>(
    null
  );

  const onDropFilesAsContext = async (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => {
    const nodesRef = graphCanvasRef.current?.nodesRef;
    const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
    const treeManager = graphCanvasRef.current?.treeManager;

    if (!nodesRef || !nodeDimensionsRef || !treeManager) return;

    const fileArray = Array.from(files);

    // Separate file types
    const imageFiles = fileArray.filter((file) =>
      file.type.startsWith("image/")
    );
   
    const documentFiles = fileArray.filter(isDocumentFile);

    if (imageFiles.length === 0 && documentFiles.length === 0) return;

    // Keep track of nodes as we create them for collision detection
    const workingNodes = { ...nodesRef.current };

    // Process image files in parallel
    const imagePromises = imageFiles.map(async (file, imageIndex) => {
      const nodeIndex = imageIndex;
      const targetX = canvasPoint.x + nodeIndex * 40;
      const targetY = canvasPoint.y + nodeIndex * 120;

      const newNodeDim = getDefaultNodeDimensions("image-context");
      const freePos = findFreePosition(
        targetX,
        targetY,
        newNodeDim.width,
        newNodeDim.height,
        workingNodes,
        nodeDimensionsRef.current,
        "below"
      );

      // Image specyfic logic

      // Start FileReader and fetch in parallel
      const dataUrlPromise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      const uploadPromise = storageService.uploadFile(file);

      // Wait for FileReader to complete, then create node immediately
      const dataUrl = await dataUrlPromise;

      const newImageContextNode = createNode("image-context", freePos.x, freePos.y);

      const nodeWithValue = { ...newImageContextNode, value: dataUrl };

      treeManager.addNode(nodeWithValue);
      workingNodes[nodeWithValue.id] = nodeWithValue;

      // Update with URL when upload completes (fetch continues in parallel)
      const uploadData = await uploadPromise;
      
      if (uploadData?.url) {
        treeManager.patchNode(nodeWithValue.id, { value: uploadData.url });
      }
    });
    
    // Process document files in parallel
    const documentPromises = documentFiles.map(async (file, docIndex) => {
      const nodeIndex = imageFiles.length + docIndex;
      const targetX = canvasPoint.x + nodeIndex * 40;
      const targetY = canvasPoint.y + nodeIndex * 120;

      const newNodeDim = getDefaultNodeDimensions("document");
      const freePos = findFreePosition(
        targetX,
        targetY,
        newNodeDim.width,
        newNodeDim.height,
        workingNodes,
        nodeDimensionsRef.current,
        "below"
      );

      // Document specyfic logic

      // For plain text files (.txt, .md, .json, .csv), parse directly
      // For other document types, use the parser with fallback
      let parseResult;
      const isPlainText = PLAIN_TEXT_EXTENSIONS.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (isPlainText) {
        // Parse plain text files directly and format with filename
        const text = await file.text();
        parseResult = {
          text: `FILENAME:${file.name}\n\n${text}`,
          filename: file.name,
        };
      } else {
        // Use parser with fallback for other document types
        parseResult = await parseDocumentWithFallback(file);
      }

      if (parseResult.error) {
        logger.error(`Failed to parse ${file.name}:`, { error: parseResult.error });
        return;
      }

      const newDocumentNode = createNode("document", freePos.x, freePos.y);
      const nodeWithValue = {
        ...newDocumentNode,
        value: parseResult.text,
      };
      treeManager.addNode(nodeWithValue);
      workingNodes[nodeWithValue.id] = nodeWithValue;
    });

    await Promise.all([...imagePromises, ...documentPromises]);
  };

  const handleUploadContext = (canvasPoint: { x: number; y: number }) => {
    // Store canvas coordinates before opening file dialog
    uploadContextCanvasPointRef.current = canvasPoint;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Use stored canvas coordinates
    const canvasPoint = uploadContextCanvasPointRef.current;
    if (!canvasPoint) return;

    await onDropFilesAsContext(files, canvasPoint);

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    // Clear the stored coordinates
    uploadContextCanvasPointRef.current = null;
  };

  return {
    onDropFilesAsContext,
    handleUploadContext,
    fileInputRef,
    handleFileInputChange,
  };
}
