"use client";

import Image from "next/image";
import { useState } from "react";

export function TournamentCover({ src, name }: { src: string; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return null;

  return (
    <div className="mt-8 aspect-[16/7] overflow-hidden rounded-2xl bg-surface-container sm:aspect-[16/5]">
      <Image
        src={src}
        alt={`${name} tournament cover`}
        width={1200}
        height={440}
        unoptimized
        className="h-full w-full object-cover"
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
