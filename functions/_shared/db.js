// functions/_shared/db.js

const INDEX_KEY = "__ALL_CODES__"; // 存一个索引列表，方便 admin 列表用

export async function getCode(env, codeId) {
  const raw = await env.CODES_KV.get(codeId);
  return raw ? JSON.parse(raw) : null;
}

export async function putCode(env, codeId, data) {
  await env.CODES_KV.put(codeId, JSON.stringify(data));
  // 更新索引（简易做法）
  const idxRaw = await env.CODES_KV.get(INDEX_KEY);
  const idx = idxRaw ? JSON.parse(idxRaw) : [];
  if (!idx.includes(codeId)) {
    idx.push(codeId);
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
