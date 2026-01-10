import { useState, useEffect, useCallback } from "react";
import { GraphNode } from "../types/GraphCanvas.types";

export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64 or text content
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedItems));
    } catch (error) {
      console.error("Failed to save context storage:", error);
    }
  }, [storedItems]);

  const addFile = useCallback(async (file: File) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let data: string;
    if (file.type.startsWith("image/")) {
      // Convert image to base64
      const reader = new FileReader();
      data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("Failed to read image"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else {
      // Read as text
      data = await file.text();
    }

    const storedFile: StoredItem = {
      type: "file",
      id,
      name: file.name,
      mimeType: file.type,
      data,
      uploadedAt: Date.now(),
    };

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

