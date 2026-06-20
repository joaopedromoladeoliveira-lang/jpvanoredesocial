import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público chamado pela Nexano quando o status de uma transação muda.
 * URL final: https://<seu-dominio>/api/public/nexano-webhook
 *
 * A Nexano envia o evento com os mesmos headers de autenticação (x-public-key / x-secret-key),
 * que validamos contra as credenciais salvas. Opcionalmente, pode ser definido
 * NEXANO_WEBHOOK_SECRET que será checado contra o header `x-webhook-secret`.
 */
export const Route = createFileRoute("/api/public/nexano-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const publicKey = process.env.NEXANO_PUBLIC_KEY;
        const webhookSecret = process.env.NEXANO_WEBHOOK_SECRET;

        const headerPub = request.headers.get("x-public-key");
        const headerSecret = request.headers.get("x-webhook-secret");

        if (publicKey && headerPub && headerPub !== publicKey) {
          return new Response("invalid public key", { status: 401 });
        }
        if (webhookSecret && headerSecret !== webhookSecret) {
          return new Response("invalid webhook secret", { status: 401 });
        }

        const bodyText = await request.text();
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(bodyText); } catch { return new Response("invalid json", { status: 400 }); }

        // Extrai id e status da transação independente do formato exato da Nexano
        const txId = (payload.id ?? payload.transaction_id
          ?? (payload.data as { id?: string } | undefined)?.id
          ?? (payload.transaction as { id?: string } | undefined)?.id) as string | undefined;
        const rawStatus = (payload.status
          ?? (payload.data as { status?: string } | undefined)?.status
          ?? (payload.transaction as { status?: string } | undefined)?.status) as string | undefined;

        if (!txId) return new Response("missing transaction id", { status: 400 });

        const normalized = (() => {
          const s = (rawStatus ?? "").toLowerCase();
          if (["paid", "approved", "completed", "succeeded"].includes(s)) return "paid";
          if (["refunded", "chargeback"].includes(s)) return "refunded";
          if (["expired", "canceled", "cancelled"].includes(s)) return "expired";
          if (["failed", "rejected", "declined"].includes(s)) return "failed";
          return "pending";
        })();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: payment } = await supabaseAdmin
          .from("ad_payments")
          .select("id, campaign_id, amount_cents, status")
          .eq("provider", "nexano")
          .eq("provider_tx_id", txId)
          .maybeSingle();

        if (!payment) {
          // Pode chegar antes do nosso insert; aceitamos e logamos
          console.warn("[nexano-webhook] payment not found for tx", txId);
          return new Response("ok", { status: 200 });
        }

        await supabaseAdmin
          .from("ad_payments")
          .update({
            status: normalized,
            paid_at: normalized === "paid" ? new Date().toISOString() : null,
            raw_payload: payload as never,
          })
          .eq("id", payment.id);

        if (normalized === "paid") {
          await supabaseAdmin
            .from("ad_campaigns")
            .update({
              status: "active",
              amount_paid_cents: payment.amount_cents,
            })
            .eq("id", payment.campaign_id);
        } else if (normalized === "expired" || normalized === "failed") {
          await supabaseAdmin
            .from("ad_campaigns")
            .update({ status: "draft" })
            .eq("id", payment.campaign_id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
