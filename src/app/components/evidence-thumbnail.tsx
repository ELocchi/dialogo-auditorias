"use client";

import Image from "next/image";
import { useState } from "react";

/** Prefer the small derivative; a decode or request failure falls back once. */
export function EvidenceThumbnail({ thumbnailSrc, originalSrc, alt, width, height }: {
  thumbnailSrc?: string;
  originalSrc: string;
  alt: string;
  width: number;
  height: number;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photoKey = JSON.stringify([thumbnailSrc, originalSrc]);
  const usingThumbnail = !!thumbnailSrc && failedPhoto !== photoKey;
  const src = usingThumbnail ? thumbnailSrc : originalSrc;
  return <Image key={src} src={src} alt={alt} width={width} height={height} unoptimized
    onError={usingThumbnail ? () => setFailedPhoto(photoKey) : undefined} />;
}
