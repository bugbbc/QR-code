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

// 生成唯一的二维码ID
function generateId(length, productId = "") {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);

  let randomPart = "";
  const randomLength = length - timestamp.length - 2;
  for (let i = 0; i < randomLength; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  let productHash = "";
  if (productId) {
    let hash = 0;
    for (let i = 0; i < productId.length; i++) {
      const char = productId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    productHash = Math.abs(hash)
      .toString(36)
      .toUpperCase()
      .slice(0, 2)
      .padStart(2, "0");
  } else {
    productHash = randomPart.slice(0, 2);
  }

  const result = (timestamp + productHash + randomPart).slice(0, length);

  if (result.length < length) {
    const padding = length - result.length;
    let paddingStr = "";
    for (let i = 0; i < padding; i++) {
      paddingStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result + paddingStr;
  }

  return result;
}

// 统一入口：处理所有方法
export async function onRequest(context) {
  const { request } = context;

  // 只允许 POST，其余方法直接 405
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  // 真正的业务逻辑
  return handlePost(context);
}

async function handlePost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();

    const productId = body.productId || "default-product";
    const quantity = Math.max(1, Math.min(parseInt(body.quantity) || 1, 1000));
    const scanLimit = Math.max(1, parseInt(body.scanLimit) || 3);
    const baseUrl = body.baseUrl;
    const config = body.config || {};
    const tokenSecret = env.TOKEN_SECRET || "dev-secret-key";

    const created = [];
    const usedIds = new Set();

    for (let i = 0; i < quantity; i++) {
      let codeId;
      let attempts = 0;
      const maxAttempts = 100;

      const baseTimestamp = Date.now();
      const microTimestamp = baseTimestamp + i;
      const randomSuffix1 = Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase();
      const randomSuffix2 = Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase();
      const uniqueSeed = `${productId}-${microTimestamp}-${i}-${randomSuffix1}-${randomSuffix2}`;

      do {
        const attemptRandom = Math.random()
          .toString(36)
          .substring(2, 4)
          .toUpperCase();
        codeId = generateId(12, `${uniqueSeed}-${attemptRandom}-${attempts}`);
        attempts++;

        if (attempts > 10) {
          const extraRandom = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();
          const nanoTime = performance
            .now()
            .toString(36)
            .toUpperCase()
            .slice(-4);
          codeId = generateId(12, `${uniqueSeed}-${extraRandom}-${nanoTime}`);
        }
      } while (usedIds.has(codeId) && attempts < maxAttempts);

      if (usedIds.has(codeId)) {
        const timestampStr = microTimestamp
          .toString(36)
          .toUpperCase()
          .slice(-6);
        const randomStr = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
        const indexStr = i.toString(36).toUpperCase().padStart(2, "0");
        codeId = (timestampStr + indexStr + randomStr)
          .substring(0, 12)
          .padEnd(12, "0");
      }

      usedIds.add(codeId);

      const createdAt = new Date().toISOString();
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

      const tokenPayload = {
        codeId,
        productId,
        remaining: scanLimit,
        scanLimit,
        issuedAt: createdAt,
      };

      const token = await signPayload(tokenPayload, tokenSecret);

      // 这里依赖 CODES_KV 绑定
      await env.CODES_KV.put(codeId, JSON.stringify(codeData));

      const row = {
        codeId,
        productId,
        scanLimit,
        totalCount: 0,
        createdAt,
        token,
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
    return new Response(
      JSON.stringify({ ok: false, error: err.message || "INTERNAL_ERROR" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
