import { getCode } from "../../_shared/db.js";

export async function onRequestGet(context) {
  try {
    const { env, params } = context;
    if (!env?.CODES_KV) {
      return new Response(JSON.stringify({ ok: false, error: "MISSING_KV_BINDING" }), {
        status: 500,
      });
    }

    const codeId = params?.codeId;
    if (!codeId) {
      return new Response(JSON.stringify({ ok: false, error: "MISSING_CODE_ID" }), {
        status: 400,
      });
    }

    const record = await getCode(env, codeId);
    if (!record) {
      return new Response(JSON.stringify({ ok: false, error: "NOT_FOUND" }), { status: 404 });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        codeId,
        productId: record.productId || "default-product",
        scanLimit: record.scanLimit || 3,
        totalCount: record.totalCount || 0,
        config: record.config || {},
        lastScanAt: record.lastScanAt || "",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "INTERNAL_ERROR" }), {
      status: 500,
    });
  }
}
