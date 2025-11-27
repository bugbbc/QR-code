// functions/api/admin/codes/index.js

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const baseUrl = url.searchParams.get("baseUrl");

  try {
    const list = await env.CODES_KV.list({ limit: 1000 });
    const codes = [];

    for (const key of list.keys) {
      const val = await env.CODES_KV.get(key.name);
      if (val) {
        const data = JSON.parse(val);
        if (productId && data.productId !== productId) continue;

        const row = {
          codeId: key.name,
          productId: data.productId,
          scanLimit: data.scanLimit,
          totalCount: data.totalCount,
          createdAt: data.createdAt,
          lastScanAt: data.lastScanAt,
          disabled: data.disabled,
        };

        // 简单重构 scanUrl，注意这里没有 Token，因为 Token 是生成的
        if (baseUrl) {
          row.scanUrl = `${baseUrl}?id=${data.productId}&code=${key.name}`;
        }

        codes.push(row);
      }
    }

    // 按时间倒序
    codes.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return new Response(
      JSON.stringify({
        ok: true,
        codes: codes,
        count: codes.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
    });
  }
}
