import { useState, useRef } from "react";
import type { GraphNode, GraphNodes } from "../types/";
import { audioService } from "../interfaces/audioService";

/**
 * Extract text content from a node, handling FILENAME prefix for document nodes
 */
const extractTextFromNode = (node: GraphNode): string => {
  let text = node.value || "";

  // For document nodes, remove the FILENAME: prefix
  if (node.type === "document" && text.startsWith("FILENAME:")) {
    const lines = text.split("\n");
    // Skip the first line (FILENAME:...) and join the rest
    text = lines.slice(1).join("\n").trim();
  }

  return text;
};

/**
 * Calculate the maximum depth of a node in the tree
 * Depth is measured by counting ancestors (parentIds)
 * Nodes with no parents have depth 0
 */
const calculateNodeDepth = (
  nodeId: string,
  nodes: GraphNodes,
  cache: Map<string, number> = new Map()
): number => {
  // Check cache first
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }

  const node = nodes[nodeId];
  if (!node || node.parentIds.length === 0) {
    cache.set(nodeId, 0);
    return 0;
  }

  // Return the maximum depth among all parents + 1
  const parentDepths = node.parentIds.map((parentId) =>
    calculateNodeDepth(parentId, nodes, cache)
  );
  const depth = Math.max(...parentDepths, 0) + 1;
  cache.set(nodeId, depth);
  return depth;
};

/**
 * Sort nodes by their depth in the tree
 * Nodes with lower depth (closer to root) come first
 * Nodes with higher depth (deeper in tree) come last
 */
const sortNodesByTreeDepth = (
  nodeIds: string[],
  nodes: GraphNodes
): string[] => {
  return [...nodeIds].sort((a, b) => {
    const depthA = calculateNodeDepth(a, nodes);
    const depthB = calculateNodeDepth(b, nodes);
    return depthA - depthB;
  });
};

/**
 * Extract and combine text from nodes, sorted by tree depth
 */
const extractTextFromNodes = (nodeIds: string[], nodes: GraphNodes): string => {
  // Sort nodes by tree depth (lower depth first, higher depth last)
  const sortedNodeIds = sortNodesByTreeDepth(nodeIds, nodes);

  // Extract text from sorted nodes
  const textParts: string[] = [];
  for (const nodeId of sortedNodeIds) {
    const node = nodes[nodeId];
    if (node) {
      const text = extractTextFromNode(node);
      if (text) {
        textParts.push(text);
      }
    }
  }

  return textParts.join("\n\n");
};

export const useAudioPlayer = () => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);
  const [words, setWords] = useState<
    Array<{ word: string; start: number; end: number }>
  >([]);

  const playAudio = async (
    nodeIds: string[],
    nodes: GraphNodes,
    includeTimestamps = false
  ) => {
    if (nodeIds.length === 0) return;

    setIsLoadingAudio(true);
    setCurrentWordIndex(null);
    setWords([]);

    // Extract and combine text from nodes (sorted by tree depth)
    const combinedText = extractTextFromNodes(nodeIds, nodes);

    if (!combinedText) {
      console.warn("No text content found in selected nodes");
      setIsLoadingAudio(false);
      return;
    }

    // Call TTS service with optional timestamps
    let audioResult: {
      audio: HTMLAudioElement;
      audioUrl: string;
      words?: Array<{ word: string; start: number; end: number }>;
      duration?: number;
    };
    try {
      audioResult = await audioService.textToSpeech(
        combinedText,
        includeTimestamps
      );
    } catch (error) {
      console.error("Failed to generate speech:", error);
      setIsLoadingAudio(false);
      return;
    }

    const { audio, audioUrl, words: wordsData } = audioResult;
    if (wordsData) {
      console.log("wordsData", wordsData);

      setWords(wordsData);
    }

    // Store audio reference and URL
    audioRef.current = audio;
    audioUrlRef.current = audioUrl;

    setIsLoadingAudio(false);
    setIsPlayingAudio(true);

    // Set up word tracking if we have timestamps
    let updateCurrentWordHandler: (() => void) | null = null;
    if (wordsData && wordsData.length > 0) {
      updateCurrentWordHandler = () => {
        if (!audioRef.current) return;
        const currentTime = audioRef.current.currentTime;
        const wordIndex = wordsData.findIndex(
          (w) => currentTime >= w.start && currentTime <= w.end
        );
        setCurrentWordIndex(wordIndex >= 0 ? wordIndex : null);
      };

      audio.addEventListener("timeupdate", updateCurrentWordHandler);
    }

    const cleanup = () => {
      setIsPlayingAudio(false);
      setIsLoadingAudio(false);
      setCurrentWordIndex(null);
      setWords([]);
      if (updateCurrentWordHandler) {
        audio.removeEventListener("timeupdate", updateCurrentWordHandler);
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      audioRef.current = null;
    };

    audio.play().catch((error) => {
      console.error("Failed to play audio:", error);
      cleanup();
    });

    // Clean up when audio finishes
    audio.addEventListener("ended", cleanup);

    // Clean up on error
    audio.addEventListener("error", cleanup);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    audioRef.current = null;
    setIsPlayingAudio(false);
    setIsLoadingAudio(false);
    setCurrentWordIndex(null);
    setWords([]);
  };

  return {
    isPlayingAudio,
    isLoadingAudio,
    playAudio,
    stopAudio,
    currentWordIndex,
    words,
  };
};
