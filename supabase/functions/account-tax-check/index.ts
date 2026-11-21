// Edge Function: account-tax-check
//
// Lê um certificado de TAX EXEMPTION / RESALE enviado por um dealer
// (public.account_documents, kind 'tax_exempt', arquivo no bucket privado
// account-docs) e grava em ai_reading o que achou: tipo, estado, número, nome
// da empresa, datas — e uma validade PROPOSTA.
//
// Matt, 20/11/2026: "ele precisa enviar o Taxexemption atualizado do ano,
// quero uma IA leia e veja se está valendo, e agende a validade e bloqueie
// sem pedir a renovação."
//
// A IA SÓ PROPÕE. Quem torna o certificado válido é a fábrica, na tela
// Dealers do ERP (RPC admin_set_tax_exempt, migration 307) — ela vê a
// leitura já preenchida e confirma com 1 clique. O bloqueio no vencimento é
// do banco (account_tax_exempt_ok / accounts_tax_exempt_sweep).
//
// Regra da validade proposta:
//   · o certificado traz data de validade  -> essa data;
//   · não traz                              -> 31/12 do ano de emissão (ou do
//     ano corrente, se não tiver data de emissão) — regra do Matt de
//     "atualizado do ano".
//
// Quem pode chamar: admin, ou dono/gerente/financeiro da empresa dona do
// documento (confere com a RPC account_doc_access usando o token de quem
// chamou). O arquivo é lido com a service_role.
//
// Body: { document_id: uuid }
// Resposta: { ok: true, reading: {...} }
//
// Secret: GEMINI_API_KEY (o mesmo das outras funções).
// Publicar: dois cliques em publicar-funcao-tax-exempt.bat
//   (ou: supabase functions deploy account-tax-check)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];
const MAX_BYTES = 18 * 1024 * 1024; // limite do pedido inline do Gemini é 20 MB

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}
function isoDate(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}
function normName(s: unknown): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(llc|l\.l\.c\.|inc|inc\.|corp|corp\.|corporation|co|co\.|company|ltd|ltd\.|dba)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    is_tax_certificate: { type: "BOOLEAN", description: "true only if the document is a sales tax resale / exemption certificate or permit" },
    certificate_type: { type: "STRING", description: "e.g. 'Florida Annual Resale Certificate (DR-13)', 'Multistate Uniform Sales Tax Certificate', 'Texas Resale Certificate 01-339'" },
    state: { type: "STRING", description: "2-letter US state that issued it or that it is addressed to; empty if multistate/unknown" },
    certificate_number: { type: "STRING", description: "certificate / permit / registration number as printed; empty if none" },
    business_name: { type: "STRING", description: "legal name of the business the certificate was issued to (the purchaser)" },
    issue_date: { type: "STRING", description: "YYYY-MM-DD, or empty" },
    effective_date: { type: "STRING", description: "YYYY-MM-DD the certificate becomes valid, or empty" },
    expiration_date: { type: "STRING", description: "YYYY-MM-DD the certificate expires, exactly as printed; empty when the document shows no expiration" },
    is_signed: { type: "BOOLEAN", description: "true if a signature is visible where one is required" },
    legible: { type: "BOOLEAN", description: "false if the scan/photo is too poor to trust the reading" },
    confidence: { type: "NUMBER", description: "0 to 1, how sure you are of the dates and the number" },
    notes: { type: "STRING", description: "one or two short sentences in English: anything a reviewer must check" },
  },
  required: ["is_tax_certificate", "legible", "confidence"],
};

async function askGemini(apiKey: string, mime: string, b64: string, legalName: string, today: string) {
  const prompt = [
    "You are checking a US sales tax RESALE / EXEMPTION certificate uploaded by a cabinet dealer to its supplier.",
    "Read the document and fill the schema. Copy numbers and dates exactly as printed; never guess a date that is not on the document.",
    "Florida Annual Resale Certificates (DR-13) expire on December 31 of the year printed on them: use that as expiration_date.",
    "If the document shows no expiration date at all, leave expiration_date empty.",
    `Today is ${today}. The dealer's legal name on file is: "${legalName || "(not informed)"}".`,
    "In notes, say if the business name on the certificate differs from the name on file, if it looks expired, unsigned, incomplete, or is not a tax certificate.",
  ].join("\n");
  let lastErr = "";
  for (const model of MODELS) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) { lastErr = `${model}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`; continue; }
      const out = await res.json();
      const txt = out?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      if (!txt) { lastErr = `${model}: resposta vazia`; continue; }
      return { model, data: JSON.parse(txt) };
    } catch (e) {
      lastErr = `${model}: ${(e as Error).message}`;
    }
  }
  throw new Error(lastErr || "IA indisponível");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const URL_ = Deno.env.get("SUPABASE_URL");
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const GEMINI = Deno.env.get("GEMINI_API_KEY");
    if (!URL_ || !SERVICE || !ANON) return json(500, { error: "Configuração do projeto incompleta." });
    if (!GEMINI) return json(500, { error: "GEMINI_API_KEY não configurada nos secrets da função.", code: "no_key" });

    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json(401, { error: "Não autenticado." });

    const body = await req.json().catch(() => null);
    const docId = body && typeof body.document_id === "string" ? body.document_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(docId)) return json(400, { error: "document_id inválido." });

    const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

    // 1) documento (service role) --------------------------------------------
    const dRes = await fetch(`${URL_}/rest/v1/account_documents?id=eq.${docId}&select=id,account_id,kind,storage_path,mime,size_bytes,status`, { headers: svc });
    const dRows = dRes.ok ? await dRes.json() : [];
    const doc = Array.isArray(dRows) ? dRows[0] : null;
    if (!doc || doc.kind !== "tax_exempt") return json(404, { error: "Documento não encontrado." });

    // 2) quem chamou pode ver os documentos dessa empresa? -------------------
    const aRes = await fetch(`${URL_}/rest/v1/rpc/account_doc_access`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_account: doc.account_id }),
    });
    const allowed = aRes.ok ? await aRes.json() : false;
    if (allowed !== true) return json(403, { error: "Sem acesso a este documento." });

    // 3) empresa e arquivo ---------------------------------------------------
    const accRes = await fetch(`${URL_}/rest/v1/accounts?id=eq.${doc.account_id}&select=legal_name,trade_name`, { headers: svc });
    const acc = accRes.ok ? (await accRes.json())[0] : null;
    const legalName = (acc && (acc.legal_name || acc.trade_name)) || "";

    const path = String(doc.storage_path).split("/").map(encodeURIComponent).join("/");
    const fRes = await fetch(`${URL_}/storage/v1/object/account-docs/${path}`, { headers: svc });
    if (!fRes.ok) return json(404, { error: "Arquivo não encontrado no storage." });
    const bytes = new Uint8Array(await fRes.arrayBuffer());
    if (bytes.length > MAX_BYTES) return json(413, { error: "Arquivo grande demais pra leitura automática." });
    const mime = doc.mime || fRes.headers.get("content-type") || "application/pdf";

    // 4) IA ------------------------------------------------------------------
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    let reading: Record<string, unknown>;
    try {
      const { model, data } = await askGemini(GEMINI, mime, toBase64(bytes), legalName, today);
      const exp = isoDate(data.expiration_date);
      const issue = isoDate(data.issue_date) || isoDate(data.effective_date);
      // sem validade impressa: 31/12 do ano de emissão (ou do ano corrente)
      const year = issue ? Number(issue.slice(0, 4)) : now.getUTCFullYear();
      const proposed = data.is_tax_certificate ? (exp || `${year}-12-31`) : null;
      const a = normName(data.business_name), b = normName(legalName);
      const nameMatches = !!a && !!b && (a === b || a.includes(b) || b.includes(a));
      reading = {
        ok: true, model, read_at: now.toISOString(),
        is_tax_certificate: data.is_tax_certificate === true,
        certificate_type: String(data.certificate_type || "").slice(0, 160),
        state: String(data.state || "").toUpperCase().slice(0, 2),
        certificate_number: String(data.certificate_number || "").slice(0, 60),
        business_name: String(data.business_name || "").slice(0, 200),
        name_on_file: legalName,
        name_matches: nameMatches,
        issue_date: issue,
        expiration_date: exp,
        expiration_printed: !!exp,
        proposed_valid_until: proposed,
        already_expired: !!proposed && proposed < today,
        is_signed: data.is_signed === true,
        legible: data.legible !== false,
        confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
        notes: String(data.notes || "").slice(0, 600),
      };
    } catch (e) {
      reading = { ok: false, read_at: now.toISOString(), error: (e as Error).message.slice(0, 300) };
    }

    // 5) grava a leitura (service role: passa pelo gatilho do documento) ------
    await fetch(`${URL_}/rest/v1/account_documents?id=eq.${docId}`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ai_reading: reading }),
    });

    return json(200, { ok: reading.ok === true, reading });
  } catch (e) {
    return json(500, { error: (e as Error).message || "Erro inesperado." });
  }
});
