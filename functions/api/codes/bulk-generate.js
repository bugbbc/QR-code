import { putCode } from "../../_shared/db.js";

const MAX_BATCH = 500;

function randomCodeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => n.toString(16).padStart(8, "0")).join("");
}

function buildScanUrl(baseUrl, productId, codeId) {
  if (!baseUrl) return "";
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}id=${encodeURIComponent(productId)}&code=${encodeURIComponent(codeId)}`;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { productId, quantity, scanLimit, config, baseUrl } = await request.json();

    if (!env?.CODES_KV) {
      return new Response(JSON.stringify({ ok: false, error: "MISSING_KV_BINDING" }), {
        status: 500,
      });
    }

    const pid = productId || "default-product";
    const count = Math.max(1, Math.min(MAX_BATCH, parseInt(quantity, 10) || 1));
    const limit = Math.max(1, parseInt(scanLimit, 10) || 3);
    const createdAt = new Date().toISOString();

    const codes = [];
    for (let i = 0; i < count; i++) {
      const codeId = randomCodeId();
      const record = {
        productId: pid,
        scanLimit: limit,
        totalCount: 0,
        deviceCounts: {},
        createdAt,
        config: config || {},
        disabled: false,
      };
      await putCode(env, codeId, record);
      codes.push({
        codeId,
        productId: pid,
        scanLimit: limit,
        totalCount: 0,
        createdAt,
        scanUrl: buildScanUrl(baseUrl, pid, codeId),
      });
    }

    return new Response(JSON.stringify({ ok: true, codes }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "INTERNAL_ERROR" }), {
      status: 500,
    });
  }
}
