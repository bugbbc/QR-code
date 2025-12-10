import { listCodes } from "../../_shared/db.js";

function buildScanUrl(baseUrl, productId, codeId) {
  if (!baseUrl) return "";
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}id=${encodeURIComponent(productId)}&code=${encodeURIComponent(codeId)}`;
}

export async function onRequestGet(context) {
  try {
    const { env, request } = context;
    if (!env?.CODES_KV) {
      return new Response(JSON.stringify({ ok: false, error: "MISSING_KV_BINDING" }), {
        status: 500,
      });
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const baseUrl = url.searchParams.get("baseUrl") || "";

    const all = await listCodes(env);
    const filtered = productId ? all.filter((c) => c.productId === productId) : all;

    const codes = filtered.map((c) => ({
      codeId: c.id,
      productId: c.productId,
      scanLimit: c.scanLimit || 3,
      totalCount: c.totalCount || 0,
      createdAt: c.createdAt || "",
      lastScanAt: c.lastScanAt || "",
      disabled: !!c.disabled,
      scanUrl: buildScanUrl(baseUrl, c.productId, c.id),
    }));

    return new Response(JSON.stringify({ ok: true, codes }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "INTERNAL_ERROR" }), {
      status: 500,
    });
  }
}
