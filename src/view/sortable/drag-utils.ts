export function getDragX(
  event: {
    originalEvent?: {
      clientX?: number;
      x?: number;
      pageX?: number;
      touches?: Array<{ clientX?: number }>;
      changedTouches?: Array<{ clientX?: number }>;
      targetTouches?: Array<{ clientX?: number }>;
    };
    clientX?: number;
    x?: number;
    pageX?: number;
    touches?: Array<{ clientX?: number }>;
    changedTouches?: Array<{ clientX?: number }>;
    targetTouches?: Array<{ clientX?: number }>;
  } | null | undefined
): number {
  const source = event?.originalEvent ?? event;
  if (!source) {
    return 0;
  }

  const candidate =
    source.clientX ??
    source.x ??
    source.pageX ??
    source.touches?.[0]?.clientX ??
    source.changedTouches?.[0]?.clientX ??
    source.targetTouches?.[0]?.clientX ??
    0;

  return Number.isFinite(candidate) ? Number(candidate) : 0;
}
