export async function onRequestGet(context) {
  const { params, env } = context;
  const codeId = params.id;

  // 从 KV 读取
  const rawData = await env.CODES_KV.get(codeId);

  if (!rawData) {
    return new Response(
      JSON.stringify({ ok: false, error: "CODE_NOT_FOUND" }),
      { status: 404 }
    );
  }

  const codeData = JSON.parse(rawData);

  return new Response(
    JSON.stringify({
      ok: true,
      config: codeData.config || {},
      scanLimit: codeData.scanLimit || 3,
      productId: codeData.productId || "default-product",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
