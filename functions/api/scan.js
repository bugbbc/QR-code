export async function onRequestPost(context) {
  try {
    // 1. 获取请求数据
    const { request, env } = context;
    const body = await request.json();
    const { codeId, deviceId } = body;

    if (!codeId || !deviceId) {
      return new Response(
        JSON.stringify({ ok: false, error: "MISSING_PARAMS" }),
        { status: 400 }
      );
    }

    // 2. 从 KV 数据库读取数据 (替代 load_db)
    const rawData = await env.CODES_KV.get(codeId);
    if (!rawData) {
      return new Response(
        JSON.stringify({ ok: false, error: "CODE_NOT_FOUND" }),
        { status: 404 }
      );
    }

    let codeData = JSON.parse(rawData);

    // 3. 检查逻辑 (对应 Python 中的 scan 函数)
    // 确保默认值存在
    const limit = parseInt(codeData.scanLimit) || 3;
    let total = parseInt(codeData.totalCount) || 0;
    let deviceCounts = codeData.deviceCounts || {};

    // 只有当未达到限制时才增加计数
    if (total < limit) {
      total += 1;
      // 记录该设备的扫描
      deviceCounts[deviceId] = (deviceCounts[deviceId] || 0) + 1;

      // 更新数据对象
      codeData.totalCount = total;
      codeData.deviceCounts = deviceCounts;
      codeData.lastScanAt = new Date().toISOString();

      // 4. 将更新后的数据写回 KV 数据库 (替代 save_db)
      await env.CODES_KV.put(codeId, JSON.stringify(codeData));
    }

    // 5. 确定状态
    let status = "valid";
    if (total >= limit) {
      status = "invalid"; // 或者前端逻辑里的 'limit'
    } else if (total === 1) {
      status = "first";
    } else if (total === 2) {
      status = "second";
    }

    // 6. 返回结果给前端
    return new Response(
      JSON.stringify({
        ok: true,
        status: status,
        totalCount: total,
        scanLimit: limit,
        config: codeData.config || {},
        productId: codeData.productId || "default-product",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
    });
  }
}
