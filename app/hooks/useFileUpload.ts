import { useRef } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas/GraphCanvas";
import { createNode } from "../interfaces/TreeManager";
import { storageService } from "../interfaces/storageService";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { parseDocumentWithFallback } from "../utils/documentParserClient";
import logger from "../utils/logger";
import { compressImageToDataUrl } from "../utils/imageCompression";

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

      // Image specific logic

      // Start compression and upload in parallel
      // Compression creates a smaller data URL for immediate display (especially important on mobile)
      const compressedDataUrlPromise = compressImageToDataUrl(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        maxSizeBytes: 500 * 1024, // 500KB max for data URLs
      }).catch((err) => {
        // Fallback to raw FileReader if compression fails
        logger.warn("Image compression failed, using raw data URL", { error: String(err) });
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      });

      const uploadPromise = storageService.uploadFile(file);

      // Wait for compressed data URL to complete, then create node immediately
      const dataUrl = await compressedDataUrlPromise;

      const newImageContextNode = createNode("image-context", freePos.x, freePos.y);

      const nodeWithValue = { ...newImageContextNode, value: dataUrl };

      treeManager.addNode(nodeWithValue);
      workingNodes[nodeWithValue.id] = nodeWithValue;

      logger.info("Created image-context node", {
        nodeId: nodeWithValue.id.substring(0, 8),
        originalSize: `${Math.round(file.size / 1024)}KB`,
        dataUrlSize: `${Math.round(dataUrl.length / 1024)}KB`,
        compressionRatio: `${((1 - dataUrl.length / file.size) * 100).toFixed(1)}%`,
      });

      // Update with hosted URL when upload completes (fetch continues in parallel)
      const uploadData = await uploadPromise;
      
      if (uploadData?.url) {
        treeManager.patchNode(nodeWithValue.id, { value: uploadData.url });
        logger.info("Updated image-context node with hosted URL", {
          nodeId: nodeWithValue.id.substring(0, 8),
          url: uploadData.url.substring(0, 50),
        });
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
