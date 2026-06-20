import { useEffect, useState } from "react";
import { resolveMedia } from "@/lib/storage";
import { User } from "lucide-react";

export function Avatar({ path, className = "", alt = "" }: { path?: string | null; className?: string; alt?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    if (!path) { setUrl(""); return; }
    resolveMedia(path).then(u => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [path]);
  if (!url) return <div className={`flex items-center justify-center bg-muted ${className}`}><User className="h-1/2 w-1/2 text-muted-foreground" /></div>;
  return <img src={url} alt={alt} className={`object-cover ${className}`} />;
}
