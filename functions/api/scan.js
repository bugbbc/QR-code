// functions/api/scan.js

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 1. 获取 POST 传来的 JSON
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: "INVALID_JSON" }),
        { status: 400 }
      );
    }

    const { codeId, deviceId } = body;

    if (!codeId || !deviceId) {
      return new Response(
        JSON.stringify({ ok: false, error: "MISSING_PARAMS" }),
        { status: 400 }
      );
    }

    // 2. 从 KV 读取二维码数据
    const rawData = await env.CODES_KV.get(codeId);
    if (!rawData) {
      return new Response(
        JSON.stringify({ ok: false, error: "CODE_NOT_FOUND" }),
        { status: 404 }
      );
    }

    let codeData = {};
    try {
      codeData = JSON.parse(rawData);
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: "INVALID_DB_DATA" }),
        { status: 500 }
      );
    }

    // 3. 设置默认值
    const limit = parseInt(codeData.scanLimit) || 3;
    let total = parseInt(codeData.totalCount) || 0;
    const deviceCounts = codeData.deviceCounts || {};

    // 4. 扫描计数逻辑
    if (total < limit) {
      total += 1;
      deviceCounts[deviceId] = (deviceCounts[deviceId] || 0) + 1;

      codeData.totalCount = total;
      codeData.deviceCounts = deviceCounts;
      codeData.lastScanAt = new Date().toISOString();

      await env.CODES_KV.put(codeId, JSON.stringify(codeData));
    }

    // 5. 返回状态
    let status = "valid";
    if (total >= limit) status = "invalid";
    else if (total === 1) status = "first";
    else if (total === 2) status = "second";

    return new Response(
      JSON.stringify({
        ok: true,
        status,
        totalCount: total,
        scanLimit: limit,
        config: codeData.config || {},
        productId: codeData.productId || "default-product",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err.message || "INTERNAL_ERROR",
      }),
      { status: 500 }
    );
  }
}
