import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type SponsoredAd = {
  id: string;
  title: string;
  caption: string | null;
  media_url: string;
  cta_label: string | null;
  cta_url: string;
  advertiser?: { brand_name: string; logo_url: string | null } | null;
};

export function SponsoredCard({ ad }: { ad: SponsoredAd }) {
  const seenRef = useRef(false);

  useEffect(() => {
    if (seenRef.current) return;
    seenRef.current = true;
    supabase.from("ad_impressions" as never).insert({ campaign_id: ad.id, kind: "view" } as never);
  }, [ad.id]);

  const onClick = () => {
    supabase.from("ad_impressions" as never).insert({ campaign_id: ad.id, kind: "click" } as never);
  };

  return (
    <article className="rounded-2xl border border-[var(--brand-pink)]/30 bg-card overflow-hidden shadow-glow/20">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-brand p-[2px]">
            <div className="h-full w-full rounded-full bg-card overflow-hidden">
              {ad.advertiser?.logo_url && <img src={ad.advertiser.logo_url} alt="" className="h-full w-full object-cover" />}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">{ad.advertiser?.brand_name ?? "Anunciante"}</div>
            <div className="text-[11px] uppercase tracking-wider text-gradient-brand font-bold">Patrocinado</div>
          </div>
        </div>
        <Link to="/ads" className="text-xs text-muted-foreground hover:text-foreground">Anuncie aqui →</Link>
      </header>
      <a href={ad.cta_url} target="_blank" rel="noreferrer sponsored" onClick={onClick} className="block">
        <img src={ad.media_url} alt={ad.title} className="w-full max-h-[600px] object-cover" />
      </a>
      <div className="px-4 py-3 space-y-2">
        <h3 className="font-display font-bold">{ad.title}</h3>
        {ad.caption && <p className="text-sm text-muted-foreground">{ad.caption}</p>}
        <a href={ad.cta_url} target="_blank" rel="noreferrer sponsored" onClick={onClick}
           className="inline-block mt-1 rounded-lg bg-gradient-brand text-white px-4 py-2 text-sm font-semibold shadow-glow">
          {ad.cta_label ?? "Saiba mais"}
        </a>
      </div>
    </article>
  );
}
