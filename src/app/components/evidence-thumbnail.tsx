"use client";

import Image from "next/image";
import { useState } from "react";

/** Use the small derivative when available without downloading the full image after a failed request. */
export function EvidenceThumbnail({ thumbnailSrc, originalSrc, alt, width, height }: {
  thumbnailSrc?: string;
  originalSrc: string;
  alt: string;
  width: number;
  height: number;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photoKey = JSON.stringify([thumbnailSrc, originalSrc]);
  if (thumbnailSrc && failedPhoto === photoKey) {
    return <span role="img" aria-label={`${alt} indisponível`} style={{ width, height }} className="evidence-thumbnail-unavailable" />;
  }
  const src = thumbnailSrc ?? originalSrc;
  return <Image key={src} src={src} alt={alt} width={width} height={height} unoptimized
    onError={thumbnailSrc ? () => setFailedPhoto(photoKey) : undefined} />;
}
