# Deploy do JPvano na Vercel

Este projeto é uma aplicação TanStack Start (SSR) com backend Supabase. Pode ser publicado fora da Lovable em qualquer provedor que rode Nitro — abaixo está o passo-a-passo para Vercel.

## 1. Preparar o repositório

1. Faça download/export do código pela Lovable (ou conecte ao GitHub direto no botão GitHub do editor).
2. Suba para um repositório GitHub/GitLab.

## 2. Criar o projeto na Vercel

1. Em https://vercel.com/new escolha o repositório.
2. Framework Preset: **Other** (a Vercel detecta Vite automaticamente).
3. Build Command: `npm run build`
4. Output Directory: `.output/public` (Nitro)
5. Install Command: `npm install` (ou `bun install` / `pnpm install`).

## 3. Variáveis de ambiente (Settings → Environment Variables)

Adicione em **Production** e **Preview**:

```
NITRO_PRESET=vercel
VITE_SUPABASE_URL=https://yabttnmdovbofhxprhii.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mdwPndThIitycOaNwVnLfg_vPQ6qdNk
VITE_SUPABASE_PROJECT_ID=yabttnmdovbofhxprhii
SUPABASE_URL=https://yabttnmdovbofhxprhii.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_mdwPndThIitycOaNwVnLfg_vPQ6qdNk
```

A variável `NITRO_PRESET=vercel` faz o build gerar a pasta serverless que a Vercel entende. Sem ela o output sai no formato Cloudflare.

> Os segredos do servidor (Service Role e similares) **não** ficam no front. Se você criar Edge Functions/Webhooks novos, configure-os pelo painel Supabase ou via Vercel apenas dentro do contexto server.

## 4. Configurar URL no Supabase

No painel da Lovable Cloud / Supabase, em **Authentication → URL Configuration**, adicione a URL da Vercel (ex.: `https://jpvano.vercel.app`) tanto em **Site URL** quanto em **Redirect URLs** para o login Google funcionar.

## 5. Deploy

Clique **Deploy**. O primeiro build leva ~2 minutos. Depois disso, todo push em `main` redepoia automaticamente.

## 6. Domínio próprio

Em **Settings → Domains** aponte seu domínio para o projeto. Atualize também o Site URL no Supabase.

## Pronto

O app fica 100% funcional fora da Lovable. Banco, auth, storage e realtime continuam servidos pela Lovable Cloud (Supabase) — só a camada web roda na Vercel.
