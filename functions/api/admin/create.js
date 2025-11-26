export async function onRequestPost(context) {
  const { request, env } = context;

  // 简单鉴权：实际使用建议加密码，这里为了演示省略
  // const url = new URL(request.url);
  // if (url.searchParams.get('secret') !== '你的密码') return new Response("Unauthorized", {status: 401});

  const body = await request.json();
  const codeId =
    body.codeId || Math.random().toString(36).substring(2, 12).toUpperCase(); // 随机生成 ID

  const newCodeData = {
    productId: body.productId || "default-product",
    scanLimit: body.scanLimit || 3,
    totalCount: 0,
    deviceCounts: {},
    config: body.config || {}, // 这里可以放你的产品名字、描述等
    createdAt: new Date().toISOString(),
  };

  // 存入 KV
  await env.CODES_KV.put(codeId, JSON.stringify(newCodeData));

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Created successfully",
      codeId: codeId,
      data: newCodeData,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
