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

// 生成唯一的二维码ID
// 使用时间戳 + 随机数 + 产品ID哈希，确保每个产品都有唯一的二维码
function generateId(length, productId = "") {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  // 使用时间戳（毫秒）的后6位作为基础
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);

  // 生成随机部分
  let randomPart = "";
  const randomLength = length - timestamp.length - 2; // 保留2位给产品ID哈希
  for (let i = 0; i < randomLength; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // 如果有产品ID，添加产品ID的哈希值（取前2位）
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

  // 组合：时间戳 + 产品哈希 + 随机数
  const result = (timestamp + productHash + randomPart).slice(0, length);

  // 如果长度不够，用随机字符填充
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
    const usedIds = new Set(); // 用于检查重复

    for (let i = 0; i < quantity; i++) {
      let codeId;
      let attempts = 0;
      const maxAttempts = 100; // 最多尝试100次

      // 生成唯一ID，确保不重复
      // 使用时间戳（微秒级）+ 产品ID + 索引 + 随机数确保唯一性
      // 每次循环都重新获取时间戳，确保不同
      const baseTimestamp = Date.now();
      const microTimestamp = baseTimestamp + i; // 为每个索引添加偏移，确保不同
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
        // 每次尝试都使用新的随机数和尝试次数
        const attemptRandom = Math.random()
          .toString(36)
          .substring(2, 4)
          .toUpperCase();
        codeId = generateId(12, `${uniqueSeed}-${attemptRandom}-${attempts}`);
        attempts++;

        // 如果尝试次数过多，使用更强的唯一性保证
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

      // 如果还是重复（理论上不应该发生），使用时间戳+随机数强制唯一
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
