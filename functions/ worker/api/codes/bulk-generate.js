// functions/worker/api/codes/bulk-generate.js

// 简单生成一个随机 ID
function genId(len = 12) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  try {
    const body = await request.json();

    const productId = body.productId || "default-product";
    const quantity = Math.max(1, Math.min(parseInt(body.quantity) || 1, 1000));
    const scanLimit = Math.max(1, parseInt(body.scanLimit) || 3);
    const baseUrl = body.baseUrl;
    const config = body.config || {};

    const created = [];

    for (let i = 0; i < quantity; i++) {
      const codeId = genId(12);
      const createdAt = new Date().toISOString();

      // 存 KV（你已经绑定了 CODES_KV）
      const codeData = {
        productId,
        scanLimit,
        totalCount: 0,
        deviceCounts: {},
        config,
        createdAt,
        lastScanAt: null,
        disabled: false,
      };
      await env.CODES_KV.put(codeId, JSON.stringify(codeData));

      const row = {
        codeId,
        productId,
        scanLimit,
        totalCount: 0,
        createdAt,
      };

      if (baseUrl) {
        const u = new URL(baseUrl);
        u.searchParams.set("id", productId);
        u.searchParams.set("code", codeId);
        row.scanUrl = u.toString();
      }

      created.push(row);
    }

    return new Response(
      JSON.stringify({ ok: true, created: created.length, codes: created }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || "INTERNAL_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
