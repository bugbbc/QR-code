// functions/api/admin/codes/bulk.js

// 辅助函数：生成 Token (Web Crypto API 实现)
async function signPayload(payload, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // 规范化 JSON (简单版)
  const body = JSON.stringify(payload); // 注意：Python版做了key排序，JS通常不需要严格一致，只要解签时一致即可
  const bodyB64 = btoa(body)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  // 转 hex
  const hashArray = Array.from(new Uint8Array(signature));
  const sigHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return `${bodyB64}.${sigHex}`;
}

function generateId(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const productId = body.productId || "default-product";
    const quantity = Math.max(1, Math.min(parseInt(body.quantity) || 1, 1000));
    const scanLimit = Math.max(1, parseInt(body.scanLimit) || 3);
    const baseUrl = body.baseUrl;
    const config = body.config || {};
    const tokenSecret = env.TOKEN_SECRET || "dev-secret-key"; // 建议在后台设置环境变量

    const created = [];

    for (let i = 0; i < quantity; i++) {
      const codeId = generateId(12);

      const codeData = {
        productId,
        scanLimit,
        totalCount: 0,
        deviceCounts: {},
        config,
        createdAt: new Date().toISOString(),
        lastScanAt: null,
        disabled: false,
      };

      // 生成 Token Payload
      const tokenPayload = {
        codeId,
        productId,
        remaining: scanLimit,
        scanLimit,
        issuedAt: codeData.createdAt,
      };

      // 签名 Token
      const token = await signPayload(tokenPayload, tokenSecret);

      // 存入 KV
      await env.CODES_KV.put(codeId, JSON.stringify(codeData));

      const row = {
        codeId,
        productId,
        scanLimit,
        totalCount: 0,
        createdAt: codeData.createdAt,
        token: token,
        payload: tokenPayload,
      };

      if (baseUrl) {
        const urlObj = new URL(baseUrl);
        urlObj.searchParams.set("id", productId);
        urlObj.searchParams.set("code", codeId);
        urlObj.searchParams.set("token", token);
        row.scanUrl = urlObj.toString();
      }

      created.push(row);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        codes: created,
        created: created.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
    });
  }
}
