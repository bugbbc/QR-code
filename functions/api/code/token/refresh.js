// functions/api/code/token/refresh.js

async function verifyToken(token, secret) {
  if (!token || !token.includes(".")) throw new Error("INVALID_TOKEN");
  const [bodyB64, sigHex] = token.split(".");

  // Base64Url decode
  const bodyStr = atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/"));

  // 重新计算签名
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(bodyStr)
  );
  const hashArray = Array.from(new Uint8Array(signature));
  const expectedSig = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 简单比较 (生产环境建议用时序安全比较，但在 CF Workers 这种短生命周期下风险可控)
  if (sigHex !== expectedSig) throw new Error("INVALID_SIGNATURE");

  return JSON.parse(bodyStr);
}

async function signPayload(payload, secret) {
  // ... (同 bulk.js 中的签名逻辑，为了独立性这里需要再写一遍或提取成公共文件)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const body = JSON.stringify(payload);
  const bodyB64 = btoa(body)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hashArray = Array.from(new Uint8Array(signature));
  const sigHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${bodyB64}.${sigHex}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const { codeId, token } = body;
    const tokenSecret = env.TOKEN_SECRET || "dev-secret-key";

    if (!codeId || !token)
      return new Response(
        JSON.stringify({ ok: false, error: "MISSING_PARAMS" }),
        { status: 400 }
      );

    const rawData = await env.CODES_KV.get(codeId);
    if (!rawData)
      return new Response(
        JSON.stringify({ ok: false, error: "CODE_NOT_FOUND" }),
        { status: 404 }
      );
    const code = JSON.parse(rawData);

    // 验证旧 Token
    let payload;
    try {
      payload = await verifyToken(token, tokenSecret);
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 400,
      });
    }

    if (payload.codeId !== codeId)
      return new Response(
        JSON.stringify({ ok: false, error: "TOKEN_CODE_MISMATCH" }),
        { status: 400 }
      );

    const remaining = parseInt(payload.remaining || 0);
    const scanLimit = parseInt(code.scanLimit || 3);

    // 如果还有剩余次数，减一并颁发新Token
    if (remaining > 0) {
      const newPayload = {
        ...payload,
        remaining: remaining - 1,
        issuedAt: new Date().toISOString(),
      };
      const newToken = await signPayload(newPayload, tokenSecret);

      return new Response(
        JSON.stringify({
          ok: true,
          status: "active",
          remaining: newPayload.remaining,
          scanLimit: scanLimit,
          token: newToken,
          payload: newPayload,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          ok: true,
          status: "limit",
          remaining: 0,
          scanLimit: scanLimit,
          token: token,
          payload: payload,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
    });
  }
}
