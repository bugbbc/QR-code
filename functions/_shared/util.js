// functions/_shared/util.js
export function nowIso() {
  return new Date().toISOString();
}

export function generateCode(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let res = "";
  for (let i = 0; i < length; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}
