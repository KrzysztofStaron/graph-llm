export const IMAGE_LAYOUT_MIN_PX = 20;

export type ImageLayoutProbe = {
  shellWidth: number;
  shellHeight: number;
  revealWidth?: number;
  revealHeight?: number;
  img?: {
    complete: boolean;
    naturalWidth: number;
    offsetWidth: number;
  };
};

export function imageCardHasLayoutSize(probe: ImageLayoutProbe): boolean {
  if (probe.shellWidth <= IMAGE_LAYOUT_MIN_PX || probe.shellHeight <= IMAGE_LAYOUT_MIN_PX) {
    return false;
  }
  if (probe.revealWidth !== undefined && probe.revealHeight !== undefined) {
    return (
      probe.revealWidth > IMAGE_LAYOUT_MIN_PX && probe.revealHeight > IMAGE_LAYOUT_MIN_PX
    );
  }
  if (!probe.img) {
    return false;
  }
  return (
    probe.img.complete &&
    probe.img.naturalWidth > 0 &&
    probe.img.offsetWidth > IMAGE_LAYOUT_MIN_PX
  );
}

export function imageHasLayoutSize(nodeId: string): boolean {
  const shell = document.querySelector(`[data-node-id="${nodeId}"]`);
  if (!(shell instanceof HTMLElement)) {
    return false;
  }
  const reveal = shell.querySelector("[data-slot='grid-reveal']");
  const img = shell.querySelector("img");
  return imageCardHasLayoutSize({
    shellWidth: shell.offsetWidth,
    shellHeight: shell.offsetHeight,
    revealWidth: reveal instanceof HTMLElement ? reveal.offsetWidth : undefined,
    revealHeight: reveal instanceof HTMLElement ? reveal.offsetHeight : undefined,
    img:
      img instanceof HTMLImageElement
        ? {
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            offsetWidth: img.offsetWidth,
          }
        : undefined,
  });
}
