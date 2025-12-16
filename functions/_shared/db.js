// functions/_shared/db.js

const INDEX_KEY = "__ALL_CODES__"; // 存一个索引列表，方便 admin 列表用

export async function getCode(env, codeId) {
  const raw = await env.CODES_KV.get(codeId);
  return raw ? JSON.parse(raw) : null;
}

/**
 * 保存单个 code；默认会维护索引，可通过 skipIndex 跳过（用于批量写入）。
 */
export async function putCode(env, codeId, data, { skipIndex = false } = {}) {
  await env.CODES_KV.put(codeId, JSON.stringify(data));
  if (skipIndex) return;

  const idxRaw = await env.CODES_KV.get(INDEX_KEY);
  const idx = idxRaw ? JSON.parse(idxRaw) : [];
  if (!idx.includes(codeId)) {
    idx.push(codeId);
    await env.CODES_KV.put(INDEX_KEY, JSON.stringify(idx));
  }
}

/**
 * 一次性把多个 codeId 追加到索引，避免批量生成时频繁读写 KV。
 */
export async function appendToIndex(env, codeIds = []) {
  if (!codeIds.length) return;
  const idxRaw = await env.CODES_KV.get(INDEX_KEY);
  const idx = idxRaw ? JSON.parse(idxRaw) : [];
  const set = new Set(idx);
  let changed = false;
  for (const id of codeIds) {
    if (set.has(id)) continue;
    idx.push(id);
    set.add(id);
    changed = true;
  }
  if (changed) {
    await env.CODES_KV.put(INDEX_KEY, JSON.stringify(idx));
  }
}

export async function listCodes(env) {
  const idxRaw = await env.CODES_KV.get(INDEX_KEY);
  if (!idxRaw) return [];
  const ids = JSON.parse(idxRaw);
  const results = [];
  for (const id of ids) {
    const code = await getCode(env, id);
    if (code) results.push({ id, ...code });
  }
  return results;
}
