import logoAsset from "@/assets/jpvano-logo.png.asset.json";

export function Logo({ size = 32, withText = false, className = "" }: { size?: number; withText?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logoAsset.url} alt="JPvano" width={size} height={size} className="rounded-xl" style={{ width: size, height: size }} />
      {withText && <span className="font-display text-xl font-bold text-gradient-brand tracking-tight">JPvano</span>}
    </div>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold text-gradient-brand tracking-tight ${className}`}>
      JPvano
    </span>
  );
}
