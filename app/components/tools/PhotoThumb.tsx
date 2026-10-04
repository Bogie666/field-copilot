"use client";

import { useEffect, useState } from "react";
import { useJob } from "../JobProvider";

export default function PhotoThumb({ photoId, alt }: { photoId: string; alt: string }) {
  const { getPhotoUrl } = useJob();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPhotoUrl(photoId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [getPhotoUrl, photoId]);
  return url ? <img src={url} alt={alt} /> : <span className="hint" style={{ padding: 6 }}>Loading</span>;
}
