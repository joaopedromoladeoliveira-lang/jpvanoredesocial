import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/nexano-check")({
  server: {
    handlers: {
      GET: async () => {
        const pub = process.env.NEXANO_PUBLIC_KEY;
        const sec = process.env.NEXANO_SECRET_KEY;
        const wh = process.env.NEXANO_WEBHOOK_SECRET;
        const presence = {
          NEXANO_PUBLIC_KEY: !!pub,
          NEXANO_SECRET_KEY: !!sec,
          NEXANO_WEBHOOK_SECRET: !!wh,
          public_key_len: pub?.length ?? 0,
          secret_key_len: sec?.length ?? 0,
          webhook_secret_len: wh?.length ?? 0,
        };
        if (!pub || !sec) return Response.json({ ok: false, presence, error: "missing keys" }, { status: 200 });

        const probes: Record<string, { status: number; ok: boolean; sample: string }> = {};
        const paths = [
          "/api/v1/gateway/producer/credentials",
          "/api/v1/gateway/producer",
          "/api/v1/gateway/producer/balance",
          "/api/v1/gateway/status",
        ];
        for (const p of paths) {
          try {
            const r = await fetch(`https://app.nexano.com.br${p}`, {
              method: "GET",
              headers: { "x-public-key": pub, "x-secret-key": sec, "Content-Type": "application/json" },
            });
            const txt = await r.text();
            probes[p] = { status: r.status, ok: r.ok, sample: txt.slice(0, 400) };
          } catch (e) {
            probes[p] = { status: 0, ok: false, sample: (e as Error).message };
          }
        }
        return Response.json({ ok: true, presence, probes });
      },
    },
  },
});
