import { useRef, useCallback } from "react";
import { GraphCanvasRef } from "../app/GraphCanvas";
import { createNode } from "../interfaces/TreeManager";
import { findFreePosition, getDefaultNodeDimensions } from "../utils/placement";
import { compressImage } from "../utils/imageCompression";
import { parseDocumentWithFallback } from "../utils/documentParserClient";

interface UseFileUploadProps {
  graphCanvasRef: React.RefObject<GraphCanvasRef | null>;
}

interface UseFileUploadReturn {
  onDropFilesAsContext: (
    files: FileList,
    canvasPoint: { x: number; y: number }
  ) => Promise<void>;
  handleUploadContext: (canvasPoint: { x: number; y: number }) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".json", ".csv"];
const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".pptx", ".xlsx", ".html", ".htm"];

export function useFileUpload({
  graphCanvasRef,
}: UseFileUploadProps): UseFileUploadReturn {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadContextCanvasPointRef = useRef<{ x: number; y: number } | null>(
    null
  );

  const onDropFilesAsContext = useCallback(
    async (files: FileList, canvasPoint: { x: number; y: number }) => {
      const nodesRef = graphCanvasRef.current?.nodesRef;
      const nodeDimensionsRef = graphCanvasRef.current?.nodeDimensionsRef;
      const treeManager = graphCanvasRef.current?.treeManager;
      if (!nodesRef || !nodeDimensionsRef || !treeManager) return;

      const fileArray = Array.from(files);

      // Separate file types
      const imageFiles = fileArray.filter((file) =>
        file.type.startsWith("image/")
      );
      // Include plain text files in document files now
      const documentFiles = fileArray.filter(
        (file) =>
          ACCEPTED_EXTENSIONS.some((ext) =>
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

      if (imageFiles.length === 0 && documentFiles.length === 0) return;

      let nodeIndex = 0;

      // Keep track of nodes as we create them for collision detection
      const workingNodes = { ...nodesRef.current };

      // Create image context nodes
      for (const file of imageFiles) {
        // Compress image before converting to data URL
        const dataUrl = await compressImage(file);

        // Stagger positions: prefer stacking vertically below, slight horizontal offset
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

        const newImageContextNode = createNode(
          "image-context",
          freePos.x,
          freePos.y
        );
        const nodeWithValue = { ...newImageContextNode, value: dataUrl };
        treeManager.addNode(nodeWithValue);
        workingNodes[nodeWithValue.id] = nodeWithValue;
        nodeIndex++;
      }

      // Create document nodes (includes plain text files now)
      for (const file of documentFiles) {
        // For plain text files (.txt, .md, .json, .csv), parse directly
        // For other document types, use the parser with fallback
        let parseResult;
        const isPlainText = ACCEPTED_EXTENSIONS.some((ext) =>
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
          console.error(`Failed to parse ${file.name}:`, parseResult.error);
          continue;
        }

        // Stagger positions: prefer stacking vertically below, slight horizontal offset
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

        const newDocumentNode = createNode("document", freePos.x, freePos.y);
        const nodeWithValue = {
          ...newDocumentNode,
          value: parseResult.text,
        };
        treeManager.addNode(nodeWithValue);
        workingNodes[nodeWithValue.id] = nodeWithValue;
        nodeIndex++;
      }
    },
    [graphCanvasRef]
  );

  const handleUploadContext = useCallback(
    (canvasPoint: { x: number; y: number }) => {
      // Store canvas coordinates before opening file dialog
      uploadContextCanvasPointRef.current = canvasPoint;
      fileInputRef.current?.click();
    },
    []
  );

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [onDropFilesAsContext]
  );

  return {
    onDropFilesAsContext,
    handleUploadContext,
    fileInputRef,
    handleFileInputChange,
  };
}
