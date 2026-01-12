import { useState, useEffect, useCallback } from "react";
import { GraphNode } from "../types/GraphCanvas.types";
import logger from "../utils/logger";
import { globals } from "../globals";

export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  data?: string; // text content for non-images
  url?: string; // URL for images hosted on backend
  uploadedAt: number;
}

export interface StoredNode {
  id: string;
  node: GraphNode;
  storedAt: number;
}

export type StoredItem = 
  | ({ type: "file" } & StoredFile)
  | ({ type: "node" } & StoredNode);

const STORAGE_KEY = "graph-llm-context-storage";

interface UseContextStorageReturn {
  storedItems: StoredItem[];
  addFile: (file: File) => Promise<void>;
  addNode: (node: GraphNode) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
}

export function useContextStorage(): UseContextStorageReturn {
  const [storedItems, setStoredItems] = useState<StoredItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredItem[];
        setStoredItems(parsed);
      }
    } catch (error) {
      console.error("Failed to load context storage:", error);
    }
  }, []);

  // Save to localStorage whenever storedItems changes
  useEffect(() => {
    const serialized = JSON.stringify(storedItems);
    const sizeInMB = new Blob([serialized]).size / 1024 / 1024;
    
    if (sizeInMB > 4) {
      logger.warn("Context storage data is very large", {
        sizeInMB: sizeInMB.toFixed(2),
        itemCount: storedItems.length,
      });
    }
    
    const error = (() => {
      try {
        localStorage.setItem(STORAGE_KEY, serialized);
        return null;
      } catch (e) {
        if (e instanceof Error && e.name === "QuotaExceededError") {
          return { type: "quota", message: e.message };
        }
        return { type: "unknown", message: e instanceof Error ? e.message : String(e) };
      }
    })();
    
    if (error) {
      logger.error("Failed to save context storage to localStorage", {
        errorType: error.type,
        sizeInMB: sizeInMB.toFixed(2),
        itemCount: storedItems.length,
        message: error.message,
      });
      
      if (error.type === "quota") {
        logger.error("localStorage quota exceeded. Consider removing some stored files or nodes.", {
          itemCount: storedItems.length,
        });
      }
    }
  }, [storedItems]);

  const addFile = useCallback(async (file: File) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let storedFile: StoredItem;
    
    if (file.type.startsWith("image/")) {
      // Upload image to backend
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch(`${globals.graphLLMBackendUrl}/api/v1/storage/upload`, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload image");
      }
      
      const { url } = await response.json();
      
      storedFile = {
        type: "file",
        id,
        name: file.name,
        mimeType: file.type,
        url,
        uploadedAt: Date.now(),
      };
    } else {
      // Read text files as before
      const data = await file.text();
      
      storedFile = {
        type: "file",
        id,
        name: file.name,
        mimeType: file.type,
        data,
        uploadedAt: Date.now(),
      };
    }

    setStoredItems((prev) => [...prev, storedFile]);
  }, []);

  const addNode = useCallback((node: GraphNode) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const storedNode: StoredItem = {
      type: "node",
      id,
      node,
      storedAt: Date.now(),
    };

    setStoredItems((prev) => [...prev, storedNode]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setStoredItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setStoredItems([]);
  }, []);

  return {
    storedItems,
    addFile,
    addNode,
    removeItem,
    clearAll,
  };
}

