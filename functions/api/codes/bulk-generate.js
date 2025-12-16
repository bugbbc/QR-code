import { appendToIndex, putCode } from "../../_shared/db.js";

const MAX_BATCH = 500;
const WRITE_BATCH_SIZE = 20; // 控制并发写入，兼顾速度与稳定性
const MAX_RETRY = 3; // KV 写入重试次数
const BASE_BACKOFF_MS = 120; // 429 时的初始退避

function randomCodeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => n.toString(16).padStart(8, "0")).join("");
}

function buildScanUrl(baseUrl, productId, codeId) {
  if (!baseUrl) return "";
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}id=${encodeURIComponent(productId)}&code=${encodeURIComponent(codeId)}`;
}

async function writeWithRetry(fn) {
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      return await fn();
    } catch (err) {
      // KV PUT 429 表示写入限速，退避重试
      const isRateLimited =
        err?.message?.includes("429") || err?.toString()?.includes("429");
      if (!isRateLimited || i === MAX_RETRY) {
        throw err;
      }
      const backoff = BASE_BACKOFF_MS * Math.pow(2, i) + Math.random() * 80;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { productId, quantity, scanLimit, config, baseUrl } = await request.json();

    if (!env?.CODES_KV) {
      return new Response(JSON.stringify({ ok: false, error: "MISSING_KV_BINDING" }), {
        status: 500,
      });
    }

    const pid = productId || "default-product";
    const count = Math.max(1, Math.min(MAX_BATCH, parseInt(quantity, 10) || 1));
    const limit = Math.max(1, parseInt(scanLimit, 10) || 3);
    const createdAt = new Date().toISOString();

    const codes = [];
    const writes = [];
    const newIds = [];

    for (let i = 0; i < count; i++) {
      const codeId = randomCodeId();
      const record = {
        productId: pid,
        scanLimit: limit,
        totalCount: 0,
        deviceCounts: {},
        createdAt,
        config: config || {},
        disabled: false,
      };
      // 跳过索引更新，批量完成后再统一写入，避免重复读写 KV
      writes.push(() => putCode(env, codeId, record, { skipIndex: true }));
      newIds.push(codeId);
      codes.push({
        codeId,
        productId: pid,
        scanLimit: limit,
        totalCount: 0,
        createdAt,
        scanUrl: buildScanUrl(baseUrl, pid, codeId),
      });
    }

    // 分批并发写入，避免一次性 100+ KV 写入导致超时或 429
    for (let i = 0; i < writes.length; i += WRITE_BATCH_SIZE) {
      const batch = writes.slice(i, i + WRITE_BATCH_SIZE);
      await Promise.all(batch.map((fn) => writeWithRetry(fn)));
    }
    await writeWithRetry(() => appendToIndex(env, newIds));

    return new Response(JSON.stringify({ ok: true, codes }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "INTERNAL_ERROR" }), {
      status: 500,
    });
  }
}
