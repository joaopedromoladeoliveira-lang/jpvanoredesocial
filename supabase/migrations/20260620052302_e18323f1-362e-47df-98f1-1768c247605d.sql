
-- 1) Advertisers
CREATE TABLE public.advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  email text NOT NULL,
  tax_id text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advertisers TO authenticated;
GRANT SELECT ON public.advertisers TO anon;
GRANT ALL ON public.advertisers TO service_role;
ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advertisers read all" ON public.advertisers FOR SELECT USING (true);
CREATE POLICY "advertisers insert own" ON public.advertisers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "advertisers update own" ON public.advertisers FOR UPDATE USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "advertisers delete own" ON public.advertisers FOR DELETE USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE TRIGGER advertisers_updated BEFORE UPDATE ON public.advertisers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Campaigns
CREATE TYPE public.ad_status AS ENUM ('draft','pending_payment','active','paused','completed','rejected');

CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  title text NOT NULL,
  caption text,
  media_url text NOT NULL,
  cta_label text DEFAULT 'Saiba mais',
  cta_url text NOT NULL,
  budget_cents integer NOT NULL CHECK (budget_cents > 0),
  amount_paid_cents integer NOT NULL DEFAULT 0,
  status public.ad_status NOT NULL DEFAULT 'draft',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_campaigns_active_idx ON public.ad_campaigns(status, starts_at DESC) WHERE status='active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_campaigns TO authenticated;
GRANT SELECT ON public.ad_campaigns TO anon;
GRANT ALL ON public.ad_campaigns TO service_role;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns read active or own" ON public.ad_campaigns FOR SELECT
  USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM public.advertisers a WHERE a.id = advertiser_id AND a.user_id = auth.uid())
    OR has_role(auth.uid(),'admin')
  );
CREATE POLICY "campaigns insert own" ON public.ad_campaigns FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.advertisers a WHERE a.id = advertiser_id AND a.user_id = auth.uid()));
CREATE POLICY "campaigns update own" ON public.ad_campaigns FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.advertisers a WHERE a.id = advertiser_id AND a.user_id = auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "campaigns delete own" ON public.ad_campaigns FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.advertisers a WHERE a.id = advertiser_id AND a.user_id = auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE TRIGGER campaigns_updated BEFORE UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Payments
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded','expired');

CREATE TABLE public.ad_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'nexano',
  provider_tx_id text,
  amount_cents integer NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL DEFAULT 'pix',
  pix_qr_code text,
  pix_qr_image text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ad_payments_provider_tx_idx ON public.ad_payments(provider, provider_tx_id) WHERE provider_tx_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_payments TO authenticated;
GRANT ALL ON public.ad_payments TO service_role;
ALTER TABLE public.ad_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read own" ON public.ad_payments FOR SELECT USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "payments insert own" ON public.ad_payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payments update own or admin" ON public.ad_payments FOR UPDATE USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE TRIGGER payments_updated BEFORE UPDATE ON public.ad_payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Impressions (engagement metrics)
CREATE TABLE public.ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('view','click')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_impressions_campaign_idx ON public.ad_impressions(campaign_id, created_at DESC);
GRANT INSERT ON public.ad_impressions TO authenticated, anon;
GRANT SELECT ON public.ad_impressions TO authenticated;
GRANT ALL ON public.ad_impressions TO service_role;
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impr insert anyone" ON public.ad_impressions FOR INSERT WITH CHECK (true);
CREATE POLICY "impr read own campaign" ON public.ad_impressions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.ad_campaigns c JOIN public.advertisers a ON a.id = c.advertiser_id
          WHERE c.id = campaign_id AND (a.user_id = auth.uid() OR has_role(auth.uid(),'admin')))
);

-- aggregate counts trigger
CREATE OR REPLACE FUNCTION public.tg_ad_impression()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.kind = 'view' THEN
    UPDATE public.ad_campaigns SET impressions = impressions + 1 WHERE id = NEW.campaign_id;
  ELSIF NEW.kind = 'click' THEN
    UPDATE public.ad_campaigns SET clicks = clicks + 1 WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ad_impression_aggregate AFTER INSERT ON public.ad_impressions FOR EACH ROW EXECUTE FUNCTION public.tg_ad_impression();

-- 5) Sample seed advertiser + active campaigns (visible to everyone)
INSERT INTO public.advertisers (id, user_id, brand_name, email, logo_url)
VALUES (
  '00000000-0000-0000-0000-00000000ad01',
  NULL,
  'JPvano Demo Brand',
  'demo@jpvano.app',
  'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=200&h=200&fit=crop'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ad_campaigns (advertiser_id, title, caption, media_url, cta_label, cta_url, budget_cents, amount_paid_cents, status)
VALUES
  ('00000000-0000-0000-0000-00000000ad01',
   'Coleção Verão 2026 — JPvano Wear',
   '✨ Lançamento oficial da nossa coleção verão. Frete grátis pra todo Brasil nas primeiras 48h!',
   'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1080&h=1080&fit=crop',
   'Comprar agora',
   'https://example.com/jpvano-wear',
   5000000, 5000000, 'active'),
  ('00000000-0000-0000-0000-00000000ad01',
   'Café Vano — torrado na hora',
   '☕ Receba em casa o melhor grão arábica do Brasil. Use cupom JPVANO15 para 15% off.',
   'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1080&h=1080&fit=crop',
   'Pedir cupom',
   'https://example.com/cafe-vano',
   2500000, 2500000, 'active')
ON CONFLICT DO NOTHING;
