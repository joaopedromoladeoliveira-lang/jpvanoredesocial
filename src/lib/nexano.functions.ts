import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Cria um depósito Pix na Nexano para pagar uma campanha publicitária.
 *
 * Endpoint base: https://app.nexano.com.br/api/v1
 * Headers exigidos: x-public-key, x-secret-key
 *
 * O body padrão segue o formato de "depósito Pix" da Nexano. Caso a sua conta exija
 * campos adicionais (ex.: split, postback, descrição customizada), ajuste em NEXANO_BODY abaixo.
 */

const NEXANO_BASE = "https://app.nexano.com.br/api/v1";
// Caminho do endpoint de criação de Pix. Ajustável via env caso a Nexano use outro path na sua conta.
const NEXANO_PIX_PATH = process.env.NEXANO_PIX_PATH || "/deposits";

const Input = z.object({
  campaignId: z.string().uuid(),
});

type NexanoResponse = {
  id?: string;
  transaction_id?: string;
  pix?: { qr_code?: string; qr_code_image?: string; expires_at?: string };
  qr_code?: string;
  qr_code_image?: string;
  expires_at?: string;
  [k: string]: unknown;
};

export const createNexanoPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const publicKey = process.env.NEXANO_PUBLIC_KEY;
    const secretKey = process.env.NEXANO_SECRET_KEY;
    if (!publicKey || !secretKey) {
      throw new Error("Credenciais da Nexano não configuradas (NEXANO_PUBLIC_KEY / NEXANO_SECRET_KEY).");
    }

    const { supabase, userId } = context;

    // Busca a campanha + dono
    const { data: campaign, error: cErr } = await supabase
      .from("ad_campaigns")
      .select("id, advertiser_id, title, budget_cents, status, advertiser:advertisers!ad_campaigns_advertiser_id_fkey(user_id, email, brand_name, tax_id)")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (cErr || !campaign) throw new Error("Campanha não encontrada");
    const advertiser = (campaign as { advertiser: { user_id: string; email: string; brand_name: string; tax_id: string | null } | null }).advertiser;
    if (!advertiser || advertiser.user_id !== userId) throw new Error("Sem permissão");

    const amountCents = (campaign as { budget_cents: number }).budget_cents;
    const amountReais = amountCents / 100;

    // Body padrão da Nexano para depósito Pix. Ajuste se a sua conta exigir outros campos.
    const body = {
      amount: amountReais,                    // em BRL
      payment_method: "pix",
      description: `JPvano — Campanha ${(campaign as { title: string }).title}`.slice(0, 200),
      customer: {
        name: advertiser.brand_name,
        email: advertiser.email,
        document: advertiser.tax_id ?? undefined,
      },
      metadata: {
        campaign_id: data.campaignId,
        user_id: userId,
      },
    };

    const res = await fetch(`${NEXANO_BASE}${NEXANO_PIX_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-public-key": publicKey,
        "x-secret-key": secretKey,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("Nexano error", res.status, text);
      throw new Error(`Nexano retornou ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = JSON.parse(text) as NexanoResponse;

    const providerTxId = json.id ?? json.transaction_id ?? null;
    const qrCode = json.pix?.qr_code ?? json.qr_code ?? null;
    const qrImage = json.pix?.qr_code_image ?? json.qr_code_image ?? null;
    const expiresAt = json.pix?.expires_at ?? json.expires_at ?? null;

    // Persiste pagamento + marca campanha como aguardando pagamento
    const { data: payment, error: pErr } = await supabase
      .from("ad_payments")
      .insert({
        campaign_id: data.campaignId,
        user_id: userId,
        provider: "nexano",
        provider_tx_id: providerTxId,
        amount_cents: amountCents,
        status: "pending",
        payment_method: "pix",
        pix_qr_code: qrCode,
        pix_qr_image: qrImage,
        expires_at: expiresAt,
        raw_payload: json as unknown as never,
      })
      .select("id, pix_qr_code, pix_qr_image, expires_at")
      .single();
    if (pErr) throw new Error(pErr.message);

    await supabase
      .from("ad_campaigns")
      .update({ status: "pending_payment" })
      .eq("id", data.campaignId);

    return payment;
  });
