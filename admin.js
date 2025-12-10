(function () {
  const LS_KEYS = {
    config: (pid) => `config:${pid}`,
    stats: (pid) => `scanStats:${pid}`,
    devices: (pid) => `scanDevices:${pid}`,
    scanCountsPrefix: (pid) => `scanCount:${pid}:`,
  };
  const DEFAULT_PID = "default-product";
  const API_DEFAULT = "";
  let latestCodeBatch = [];

  // 默认配置，与 index 页面一致（用作回填）- 使用英文内容
  const DEFAULT_CONFIG = {
    name: "Improved composition with finest ingredients.",
    specs:
      "Specifications:\n- Size: 120 x 80 x 60 mm\n- Weight: 450 g\n- Material: ABS + Aluminum\n- Type: Advanced Brightening Booster",
    features:
      "BRIGHTENS AND DIMINISHES DARK SPOTS\nOur advanced formula targets uneven skin tone, effectively reducing the appearance of dark spots and blemishes.\n\nPROTECTS AGAINST HYPERPIGMENTATION\nOur unique blend of ingredients creates a protective barrier against environmental factors that can cause hyperpigmentation.\n\nRESULTS SHOWN IN LESS THAN 7 DAYS\nUnlike other products that take weeks to show effects, Miracle White delivers visible improvements in under a week.",
    usage:
      "How to Use:\n1) Check accessories are complete after unboxing.\n2) Follow the instructions for connection and activation.\n3) Please read the safety notes before first use.",
    contact:
      "Customer Support:\n- Hotline: +1-000-000-0000\n- Email: support@example.com",
    purchaseLinks: [
      { text: "Official Site", url: "https://example.com" },
      { text: "Online Store", url: "https://example.com/shop" },
    ],
    couponText:
      "Thanks for being a returning customer! Click to claim your exclusive discount.",
    couponUrl: "https://example.com/coupon",
    scanLimit: 3,
  };

  // 简易登录（演示目的）
  const ADMIN = { username: "admin", password: "password123" };
  const el = (id) => document.getElementById(id);

  function show(id) {
    el(id).classList.remove("hidden");
  }
  function hide(id) {
    el(id).classList.add("hidden");
  }

  function loadConfig(pid) {
    const raw = localStorage.getItem(LS_KEYS.config(pid));
    const cfg = raw ? JSON.parse(raw) : DEFAULT_CONFIG;
    el("productId").value = pid;
    el("name").value = cfg.name || "";
    el("specs").value = cfg.specs || "";
    el("features").value = cfg.features || "";
    el("usage").value = cfg.usage || "";
    el("contact").value = cfg.contact || "";
    el("link1").value =
      cfg.purchaseLinks && cfg.purchaseLinks[0] ? cfg.purchaseLinks[0].url : "";
    el("link2").value =
      cfg.purchaseLinks && cfg.purchaseLinks[1] ? cfg.purchaseLinks[1].url : "";
    el("couponText").value = cfg.couponText || "";
    el("couponUrl").value = cfg.couponUrl || "";
    el("scanLimit").value = cfg.scanLimit || 2;
  }

  function currentConfigFromForm() {
    return {
      name: el("name").value.trim(),
      specs: el("specs").value,
      features: el("features").value,
      usage: el("usage").value,
      contact: el("contact").value,
      purchaseLinks: [
        { text: "Official Site", url: el("link1").value.trim() },
        { text: "Online Store", url: el("link2").value.trim() },
      ].filter((l) => !!l.url),
      couponText: el("couponText").value.trim(),
      couponUrl: el("couponUrl").value.trim(),
      scanLimit: Math.max(1, parseInt(el("scanLimit").value, 10) || 3),
    };
  }

  function save() {
    const pid = el("productId").value.trim() || DEFAULT_PID;
    const cfg = currentConfigFromForm();
    localStorage.setItem(LS_KEYS.config(pid), JSON.stringify(cfg));
    alert(
      "保存成功，立即生效。若要跨设备生效，请导出 JSON 并放到服务器目录 configs/" +
        pid +
        ".json"
    );
    refreshStats();
    updateQrUrl();
  }

  function readStats(pid) {
    const raw = localStorage.getItem(LS_KEYS.stats(pid));
    return raw
      ? JSON.parse(raw)
      : {
          total: 0,
          first: 0,
          second: 0,
          invalid: 0,
          byDeviceType: { android: 0, ios: 0, other: 0 },
          regions: {},
        };
  }
  function deviceCount(pid) {
    const raw = localStorage.getItem(LS_KEYS.devices(pid));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.length : 0;
  }

  function refreshStats() {
    const pid = el("productId").value.trim() || DEFAULT_PID;
    const stats = readStats(pid);
    el("totalScans").textContent = stats.total || 0;
    el("firstCount").textContent = stats.first || 0;
    el("secondCount").textContent = stats.second || 0;
    el("invalidCount").textContent = stats.invalid || 0;
    el("androidCount").textContent = stats.byDeviceType?.android || 0;
    el("iosCount").textContent = stats.byDeviceType?.ios || 0;
    el("otherCount").textContent = stats.byDeviceType?.other || 0;
    el("deviceCount").textContent = deviceCount(pid);
    const regions = stats.regions || {};
    el("regions").textContent = Object.keys(regions).length
      ? Object.entries(regions)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      : "暂无数据";
  }

  function resetStats() {
    const pid = el("productId").value.trim() || DEFAULT_PID;
    if (!confirm(`确认清除产品 ${pid} 的统计与计数？`)) return;
    localStorage.removeItem(LS_KEYS.stats(pid));
    localStorage.removeItem(LS_KEYS.devices(pid));
    // 清除该产品的所有设备计数
    const keys = Object.keys(localStorage);
    keys
      .filter((k) => k.startsWith(LS_KEYS.scanCountsPrefix(pid)))
      .forEach((k) => localStorage.removeItem(k));
    alert("已清除。");
    refreshStats();
  }

  let qrInstance = null;
  function resolveServerOrigin() {
    const hostInput = el("serverHost");
    const rawHost =
      hostInput && hostInput.value.trim()
        ? hostInput.value.trim()
        : location.host;
    let origin;
    if (/^https?:\/\//i.test(rawHost)) {
      origin = rawHost.replace(/\/$/, "");
    } else if (
      /^\d+\.\d+\.\d+\.\d+(?::\d+)?$/.test(rawHost) ||
      /:\d+$/.test(rawHost)
    ) {
      origin = `http://${rawHost}`; // IP 或含端口，默认 http
    } else {
      origin = `https://${rawHost}`; // 域名默认 https
    }
    return origin.replace(/\/$/, "");
  }

  function buildScanUrl(pid, codeId, token) {
    const origin = resolveServerOrigin();
    const base = `${origin}/index.html`;
    const params = new URLSearchParams({ id: pid });
    if (codeId) params.append("code", codeId);
    if (token) params.append("token", token);
    return `${base}?${params.toString()}`;
  }

  function updateQrUrl() {
    const pid = el("productId").value.trim() || DEFAULT_PID;
    // 如果配置了服务器重定向，可以使用根路径；否则使用 /index.html
    // 这里使用 /index.html 确保兼容性
    const url = buildScanUrl(pid);
    el("qr-url").textContent = url;
    return url;
  }

  function resolveApiBase() {
    const apiInput = el("apiBase");
    let raw =
      apiInput && apiInput.value.trim() ? apiInput.value.trim() : API_DEFAULT;

    // 如果仍然为空，说明走相对路径：/api/...
    if (!raw) {
      return ""; // 返回空，后面用相对路径
    }

    // 用户填了东西，再补 http/https
    if (!/^https?:\/\//i.test(raw)) {
      if (/^localhost|^\d+\.\d+\.\d+\.\d+/i.test(raw)) {
        raw = `http://${raw}`;
      } else {
        raw = `https://${raw}`;
      }
    }
    return raw.replace(/\/$/, "");
  }

  function genQr() {
    const url = updateQrUrl();
    const box = el("qrcode");
    box.innerHTML = "";
    qrInstance = new QRCode(box, {
      text: url,
      width: 1200,
      height: 1200,
      correctLevel: QRCode.CorrectLevel.H,
      colorDark: "#000000",
      colorLight: "#ffffff",
    });
  }
  function downloadQr() {
    if (!qrInstance) {
      alert("请先生成二维码");
      return;
    }
    const canvas = el("qrcode").querySelector("canvas");
    if (!canvas) {
      alert("未找到二维码图像");
      return;
    }
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qrcode_${el("productId").value.trim() || DEFAULT_PID}.png`;
    a.click();
  }
  function exportJson() {
    const pid = el("productId").value.trim() || DEFAULT_PID;
    const cfg = currentConfigFromForm();
    const blob = new Blob([JSON.stringify(cfg, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = pid + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ========== 离线二维码生成功能 ==========
  let uploadedImages = {}; // 存储上传的图片 {filename: base64}
  let offlineQrInstance = null;
  let offlineHtmlContent = "";

  // 图片上传处理
  function handleImageUpload(files) {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        alert(`${file.name} 不是图片文件`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        uploadedImages[file.name] = base64;
        updateImageList();
      };
      reader.readAsDataURL(file);
    });
  }

  function updateImageList() {
    const container = el("image-list");
    const wrapper = el("uploaded-images");
    if (Object.keys(uploadedImages).length === 0) {
      wrapper.style.display = "none";
      return;
    }
    wrapper.style.display = "block";
    container.innerHTML = "";
    Object.entries(uploadedImages).forEach(([name, base64]) => {
      const item = document.createElement("div");
      item.style.cssText =
        "position: relative; width: 80px; height: 80px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;";
      const img = document.createElement("img");
      img.src = base64;
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      const del = document.createElement("button");
      del.textContent = "×";
      del.style.cssText =
        "position: absolute; top: 2px; right: 2px; background: rgba(255,0,0,0.7); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 14px;";
      del.onclick = () => {
        delete uploadedImages[name];
        updateImageList();
      };
      item.appendChild(img);
      item.appendChild(del);
      container.appendChild(item);
    });
  }

  // HTML压缩（移除多余空白和注释）
  function minifyHtml(html) {
    return html
      .replace(/<!--[\s\S]*?-->/g, "") // 移除注释
      .replace(/>\s+</g, "><") // 移除标签间空白
      .replace(/\s+/g, " ") // 合并多个空白
      .trim();
  }

  // 生成完全自包含的离线HTML（基于index.html）
  async function generateOfflineHtml() {
    const pid = el("productId").value.trim() || DEFAULT_PID;
    const cfg = currentConfigFromForm();

    // 确保所有必需字段都有默认值
    const safeConfig = {
      productId: pid,
      name: cfg.name || DEFAULT_CONFIG.name || "商品详情",
      specs: cfg.specs || DEFAULT_CONFIG.specs || "",
      features: cfg.features || DEFAULT_CONFIG.features || "",
      usage: cfg.usage || DEFAULT_CONFIG.usage || "",
      contact: cfg.contact || DEFAULT_CONFIG.contact || "",
      purchaseLinks:
        Array.isArray(cfg.purchaseLinks) && cfg.purchaseLinks.length > 0
          ? cfg.purchaseLinks
          : DEFAULT_CONFIG.purchaseLinks || [],
      couponText: cfg.couponText || DEFAULT_CONFIG.couponText || "",
      couponUrl: cfg.couponUrl || DEFAULT_CONFIG.couponUrl || "",
      scanLimit: cfg.scanLimit || DEFAULT_CONFIG.scanLimit || 2,
    };

    // 获取图片Base64（优先使用上传的，支持文件名匹配）
    const getImageBase64 = (filename) => {
      // 精确匹配
      if (uploadedImages[filename]) return uploadedImages[filename];
      // 模糊匹配（查找包含文件名的键）
      const matchedKey = Object.keys(uploadedImages).find(
        (key) =>
          key.includes(filename) ||
          filename.includes(key.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, ""))
      );
      if (matchedKey) return uploadedImages[matchedKey];
      // 如果没有上传，返回一个小的占位图
      return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZTwvdGV4dD48L3N2Zz4=";
    };

    // 构建图片列表（按顺序匹配）
    const upImageNames = [
      "up_1.jpg",
      "up_2.jpg",
      "up_3.jpg",
      "up_4.jpg",
      "up_5.jpg",
      "up_6.jpg",
      "up_7.jpg",
    ];
    const downImageNames = [
      "down_1.jpg",
      "down_2.jpg",
      "down_3.jpg",
      "down_4.jpg",
      "down_5.jpg",
      "down_6.jpg",
    ];

    const uploadedKeys = Object.keys(uploadedImages);
    const upImages = upImageNames
      .map((name, index) => {
        try {
          const matched = uploadedKeys.find((key) => {
            const baseName = key.replace(/^.*[\\/]/, "").toLowerCase();
            return (
              baseName.includes(`up_${index + 1}`) ||
              baseName === name.toLowerCase()
            );
          });
          const result = matched
            ? uploadedImages[matched]
            : getImageBase64(name);
          return result || getImageBase64(name); // 确保总是返回有效值
        } catch (e) {
          console.error(`Error processing up image ${index + 1}:`, e);
          return getImageBase64(name);
        }
      })
      .filter((img) => img && typeof img === "string"); // 确保都是有效的字符串

    const downImages = downImageNames
      .map((name, index) => {
        try {
          const matched = uploadedKeys.find((key) => {
            const baseName = key.replace(/^.*[\\/]/, "").toLowerCase();
            return (
              baseName.includes(`down_${index + 1}`) ||
              baseName === name.toLowerCase()
            );
          });
          const result = matched
            ? uploadedImages[matched]
            : getImageBase64(name);
          return result || getImageBase64(name); // 确保总是返回有效值
        } catch (e) {
          console.error(`Error processing down image ${index + 1}:`, e);
          return getImageBase64(name);
        }
      })
      .filter((img) => img && typeof img === "string"); // 确保都是有效的字符串

    // 读取style.css内容（内联完整CSS）
    const cssContent = `* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #222; background: #f7f8fa; }
.header { position: sticky; top: 0; background: #ffffffcc; backdrop-filter: blur(6px); border-bottom: 1px solid #eee; z-index: 10; }
.header h1 { margin: 0; padding: 16px 20px; font-family: 'Playfair Display', serif; font-weight: 700; font-style: italic; font-size: 28px; letter-spacing: 0.6px; background: linear-gradient(90deg, #111, #444, #111); -webkit-background-clip: text; background-clip: text; color: transparent; }
.section-title { margin: 10px 20px; font-size: 16px; color: #333; }
.content { padding: 10px 16px; }
.card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 14px; margin: 10px 0; }
.text-block { white-space: pre-wrap; line-height: 1.6; color: #444; }
.links a { display: inline-block; margin-right: 10px; margin-bottom: 8px; color: #0b72ff; text-decoration: none; }
.links a:hover { text-decoration: underline; }
.footer { margin-top: 16px; padding: 20px; text-align: center; color: #777; }
.footer a { color: #0b72ff; }
.hidden { display: none !important; }
.invalid { text-align: center; color: #b00020; }
#loading-overlay { position: fixed; inset: 0; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 999; }
.spinner { width: 40px; height: 40px; border-radius: 50%; border: 4px solid #e6e6e6; border-top-color: #0b72ff; animation: spin 0.8s linear infinite; }
.loading-text { margin-top: 12px; color: #333; font-size: 14px; }
@keyframes spin { to { transform: rotate(360deg); } }
.carousel { position: relative; overflow: hidden; border-radius: 12px; margin: 10px 16px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.carousel-track { display: flex; transition: transform 0.5s ease; }
.carousel-item { min-width: 100%; height: 240px; display: flex; align-items: center; justify-content: center; background: #fff; }
.carousel-item img { max-width: 100%; max-height: 100%; object-fit: contain; }
.carousel.inline { float: right; width: min(60%, 360px); margin: 0 0 10px 12px; }
.carousel.inline.left { float: left; width: min(70%, 420px); margin: 0 14px 12px 0; }
.card::after { content: ""; display: block; clear: both; }
.carousel-nav { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; pointer-events: none; }
.carousel-btn { pointer-events: auto; background: #ffffffcc; backdrop-filter: blur(6px); border: none; border-radius: 50%; width: 36px; height: 36px; margin: 0 8px; font-size: 16px; cursor: pointer; box-shadow: 0 1px 6px rgba(0,0,0,0.15); }
.carousel-dots { position: absolute; left: 50%; transform: translateX(-50%); bottom: 8px; display: flex; gap: 6px; background: #00000040; padding: 6px 10px; border-radius: 999px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: #ddd; }
.dot.active { background: #0b72ff; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal-content { width: min(92%, 520px); background: #fff; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #eee; }
.modal-actions { padding: 12px 16px; border-top: 1px solid #eee; display: flex; gap: 8px; }
.icon-btn { border: none; background: transparent; font-size: 16px; cursor: pointer; }
.btn { padding: 10px 16px; border-radius: 10px; border: none; cursor: pointer; }
.btn.primary { background: #0b72ff; color: #fff; }
@media (max-width: 767px) { .carousel.inline { float: none; width: 92%; margin: 10px auto; } }
@media (min-width: 768px) { .carousel-item { height: 360px; } .header h1 { font-size: 40px; } }`;

    // 生成离线版本的app.js（移除网络请求，直接使用配置）
    // 确保safeConfig可以被安全序列化
    const configForJS = {
      productId: safeConfig.productId,
      name: String(safeConfig.name || ""),
      specs: String(safeConfig.specs || ""),
      features: String(safeConfig.features || ""),
      usage: String(safeConfig.usage || ""),
      contact: String(safeConfig.contact || ""),
      purchaseLinks: Array.isArray(safeConfig.purchaseLinks)
        ? safeConfig.purchaseLinks.map((l) => ({
            text: String(l.text || ""),
            url: String(l.url || ""),
          }))
        : [],
      couponText: String(safeConfig.couponText || ""),
      couponUrl: String(safeConfig.couponUrl || ""),
      scanLimit: Number(safeConfig.scanLimit) || 2,
    };

    // 确保图片数组可以被安全序列化
    const safeUpImages = Array.isArray(upImages)
      ? upImages.filter((img) => img && typeof img === "string")
      : [];
    const safeDownImages = Array.isArray(downImages)
      ? downImages.filter((img) => img && typeof img === "string")
      : [];

    const jsContent = `(function(){
  const PRODUCT_ID = '${pid}';
  const DEFAULT_CONFIG = ${JSON.stringify(configForJS)};
  const LS_KEYS = { config: (pid) => \`config:\${pid}\`, scanCount: (pid, did) => \`scanCount:\${pid}:\${did}\`, stats: (pid) => \`scanStats:\${pid}\`, devices: (pid) => \`scanDevices:\${pid}\` };
  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i); return (h >>> 0).toString(16); }
  function canvasFingerprint() { try { const c = document.createElement('canvas'); const ctx = c.getContext('2d'); c.width = 200; c.height = 50; ctx.textBaseline = 'top'; ctx.font = "14px 'Arial'"; ctx.fillStyle = '#f60'; ctx.fillRect(125,1,62,20); ctx.fillStyle = '#069'; ctx.fillText(navigator.userAgent, 2, 2); ctx.strokeStyle = '#f00'; ctx.arc(100, 30, 15, 0, Math.PI, true); ctx.stroke(); return hash(c.toDataURL()); } catch (e) { return 'nocanvas'; } }
  function getDeviceId(){ const parts = [navigator.userAgent, navigator.language, navigator.platform, (screen.width + 'x' + screen.height), Intl.DateTimeFormat().resolvedOptions().timeZone || 'notz', canvasFingerprint()]; return hash(parts.join('|')); }
  function getConfig(pid) { const raw = localStorage.getItem(LS_KEYS.config(pid)); if (!raw) return DEFAULT_CONFIG; try { const cfg = JSON.parse(raw); return { ...DEFAULT_CONFIG, ...cfg, productId: pid }; } catch (e) { return DEFAULT_CONFIG; } }
  function getScanCount(pid, did){ const v = localStorage.getItem(LS_KEYS.scanCount(pid, did)); return v ? parseInt(v, 10) : 0; }
  function setScanCount(pid, did, count){ localStorage.setItem(LS_KEYS.scanCount(pid, did), String(count)); }
  function getStats(pid){ const raw = localStorage.getItem(LS_KEYS.stats(pid)); if (!raw) return { total: 0, first: 0, second: 0, invalid: 0, byDeviceType:{ android:0, ios:0, other:0 }, regions:{} }; try { return JSON.parse(raw); } catch (e) { return { total:0, first:0, second:0, invalid:0, byDeviceType:{ android:0, ios:0, other:0 }, regions:{} }; } }
  function saveStats(pid, stats){ localStorage.setItem(LS_KEYS.stats(pid), JSON.stringify(stats)); }
  function addDevice(pid, did) { const raw = localStorage.getItem(LS_KEYS.devices(pid)); const set = raw ? new Set(JSON.parse(raw)) : new Set(); set.add(did); localStorage.setItem(LS_KEYS.devices(pid), JSON.stringify(Array.from(set))); }
  function detectDeviceType(){ const ua = navigator.userAgent.toLowerCase(); if (/android/.test(ua)) return 'android'; if (/iphone|ipad|ipod|ios/.test(ua)) return 'ios'; return 'other'; }
  async function detectRegion(){ try { const res = await fetch('https://ipapi.co/json/'); if (!res.ok) throw new Error('ipapi failed'); const data = await res.json(); return data.country_name || data.region || '未知'; } catch(e) { return navigator.language || '未知'; } }
  function renderCarousel(containerId, images, autoplayMs = 2800){ const container = document.getElementById(containerId); if (!container) return; const track = document.createElement('div'); track.className = 'carousel-track'; images.forEach(src => { const item = document.createElement('div'); item.className = 'carousel-item'; const img = document.createElement('img'); img.src = src; item.appendChild(img); track.appendChild(item); }); container.appendChild(track); const nav = document.createElement('div'); nav.className = 'carousel-nav'; const btnPrev = document.createElement('button'); btnPrev.className='carousel-btn'; btnPrev.textContent='‹'; const btnNext = document.createElement('button'); btnNext.className='carousel-btn'; btnNext.textContent='›'; nav.appendChild(btnPrev); nav.appendChild(btnNext); container.appendChild(nav); const dots = document.createElement('div'); dots.className='carousel-dots'; const dotEls = images.map((_,i)=>{ const d = document.createElement('div'); d.className='dot'+(i===0?' active':''); dots.appendChild(d); return d; }); container.appendChild(dots); let index = 0; const total = images.length; function update(){ track.style.transform = \`translateX(-\${index*100}%)\`; dotEls.forEach((d,i)=>{ d.className = 'dot' + (i===index?' active':''); }); } btnPrev.addEventListener('click', ()=>{ index = (index-1+total)%total; update(); }); btnNext.addEventListener('click', ()=>{ index = (index+1)%total; update(); }); let timer = setInterval(()=>{ index=(index+1)%total; update(); }, autoplayMs); container.addEventListener('mouseenter', ()=> clearInterval(timer)); container.addEventListener('mouseleave', ()=> timer = setInterval(()=>{ index=(index+1)%total; update(); }, autoplayMs)); update(); }
  function setText(id, text){ const el = document.getElementById(id); if (el) el.textContent = text; }
  function renderContent(cfg){ setText('product-name', cfg.name || ''); setText('product-specs', cfg.specs || ''); setText('product-features', cfg.features || ''); setText('product-usage', cfg.usage || ''); setText('product-contact', cfg.contact || ''); const linksWrap = document.querySelector('#purchase-links .links'); if (linksWrap && cfg.purchaseLinks && Array.isArray(cfg.purchaseLinks)) { linksWrap.innerHTML = ''; cfg.purchaseLinks.forEach(l => { if (l && l.url && l.text) { const a = document.createElement('a'); a.href = l.url; a.textContent = l.text; a.target = '_blank'; a.rel='noopener'; linksWrap.appendChild(a); } }); } }
  function showFirstScan(){ const el = (id) => document.getElementById(id); if (el('purchase-links')) el('purchase-links').classList.remove('hidden'); if (el('invalid-section')) el('invalid-section').classList.add('hidden'); if (el('coupon-modal')) el('coupon-modal').classList.add('hidden'); }
  function showSecondScan(cfg){ const el = (id) => document.getElementById(id); if (el('purchase-links')) el('purchase-links').classList.remove('hidden'); if (el('invalid-section')) el('invalid-section').classList.add('hidden'); if (el('coupon-modal')) { el('coupon-modal').classList.remove('hidden'); if (el('coupon-text')) el('coupon-text').textContent = cfg.couponText || ''; if (el('coupon-link')) el('coupon-link').href = cfg.couponUrl || '#'; } }
  function showInvalid(){ const el = (id) => document.getElementById(id); if (el('purchase-links')) el('purchase-links').classList.add('hidden'); if (el('coupon-modal')) el('coupon-modal').classList.add('hidden'); if (el('invalid-section')) el('invalid-section').classList.remove('hidden'); document.querySelectorAll('a').forEach(a => { if (a.id !== 'admin-link') { a.replaceWith(document.createTextNode(a.textContent)); } }); const adminLink = document.getElementById('admin-link'); if (adminLink) adminLink.closest('.footer').classList.add('hidden'); }
  async function updateStats(scanOrder){ const stats = getStats(PRODUCT_ID); stats.total += 1; if (scanOrder === 1) stats.first += 1; else if (scanOrder <= 3) stats.second += 1; else stats.invalid += 1; const dt = detectDeviceType(); stats.byDeviceType[dt] = (stats.byDeviceType[dt]||0) + 1; try { const region = await detectRegion(); stats.regions[region] = (stats.regions[region]||0) + 1; } catch(e) {} saveStats(PRODUCT_ID, stats); }
  async function main(){ try { const cfg = getConfig(PRODUCT_ID); renderContent(cfg); const upImgs = ${JSON.stringify(
    safeUpImages
  )}; const downImgs = ${JSON.stringify(
      safeDownImages
    )}; if (upImgs && Array.isArray(upImgs) && upImgs.length > 0) { renderCarousel('carousel-top', upImgs); } if (downImgs && Array.isArray(downImgs) && downImgs.length > 0) { renderCarousel('carousel-bottom', downImgs); } const did = getDeviceId(); addDevice(PRODUCT_ID, did); let count = getScanCount(PRODUCT_ID, did); count += 1; setScanCount(PRODUCT_ID, did, count); const limit = cfg.scanLimit || 2; if (count === 1) { showFirstScan(); updateStats(1); } else if (count === 2) { showSecondScan(cfg); updateStats(2); } else { showInvalid(); updateStats(3); } setTimeout(()=>{ const overlay = document.getElementById('loading-overlay'); if (overlay) { overlay.style.opacity = 0; setTimeout(()=>overlay.remove(), 300); } }, 300); } catch(e) { console.error('Main error:', e); const overlay = document.getElementById('loading-overlay'); if (overlay) overlay.remove(); } }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', main); } else { main(); }
})();`;

    // 构建完整的index.html结构（内联所有资源）
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>${(safeConfig.name || "商品扫码详情页")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap" rel="stylesheet">
  <style>${cssContent}</style>
</head>
<body>
  <div id="loading-overlay">
    <div class="spinner"></div>
    <div class="loading-text">Loading, please wait...</div>
  </div>
  <header class="header">
    <h1 id="product-name">${(safeConfig.name || "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</h1>
  </header>
  <section class="carousel-section hidden">
    <h2 class="section-title">Product Gallery</h2>
    <div id="carousel-top-removed" class="carousel"></div>
  </section>
  <main class="content">
    <section class="card">
      <h3>Specifications</h3>
      <div id="product-specs" class="text-block"></div>
    </section>
    <section class="card">
      <h3>Features</h3>
      <div id="carousel-top" class="carousel inline"></div>
      <div id="product-features" class="text-block"></div>
    </section>
    <section class="card">
      <h3>How to Use</h3>
      <div id="carousel-bottom" class="carousel inline left"></div>
      <div id="product-usage" class="text-block"></div>
    </section>
    <section class="card">
      <h3>Customer Support</h3>
      <div id="product-contact" class="text-block"></div>
    </section>
    <section id="purchase-links" class="card hidden">
      <h3>Purchase Options</h3>
      <div class="links"></div>
    </section>
    <div id="coupon-modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Returning Customer Offer</h3>
          <button id="close-coupon" class="icon-btn" aria-label="Close">✕</button>
        </div>
        <div id="coupon-text" class="text-block"></div>
        <div class="modal-actions">
          <a id="coupon-link" class="btn primary" href="#" target="_blank" rel="noopener">Claim Coupon</a>
        </div>
      </div>
    </div>
    <section id="invalid-section" class="invalid card hidden">
      <h3>This QR code is invalid</h3>
      <p>Please purchase a new product for a new code.</p>
    </section>
    <section class="card" id="support-bottom">
      <h3>Customer Support</h3>
      <div id="product-contact" class="text-block"></div>
    </section>
  </main>
  <section class="carousel-section hidden">
    <h2 class="section-title">More Details</h2>
    <div id="carousel-bottom-removed" class="carousel"></div>
  </section>
  <footer class="footer">
    <div class="footer-inner">
      <small>© Demo page.</small>
    </div>
  </footer>
  <script>
    (function(){
      const ts = Date.now();
      const link = document.querySelector('link[rel="stylesheet"]');
      if (link) link.href = link.href.replace('{{ts}}', ts);
    })();
  </script>
  <script>${jsContent}</script>
</body>
</html>`;

    return minifyHtml(html);
  }

  // 生成离线二维码
  async function genOfflineQr() {
    try {
      console.log("开始生成离线HTML...");
      offlineHtmlContent = await generateOfflineHtml();
      console.log("HTML生成成功，长度:", offlineHtmlContent.length);
      const htmlSize = new Blob([offlineHtmlContent]).size;
      const base64Content = btoa(
        unescape(encodeURIComponent(offlineHtmlContent))
      );
      const dataUrl = "data:text/html;base64," + base64Content;
      const base64Size = new Blob([dataUrl]).size;

      // 更新显示
      el("html-size").textContent = formatBytes(htmlSize);
      el("base64-size").textContent = formatBytes(base64Size);

      // 检查大小限制
      if (base64Size > 2 * 1024 * 1024) {
        if (
          !confirm(
            `警告：二维码内容大小 ${formatBytes(
              base64Size
            )} 超过2MB建议值，可能导致扫码失败。是否继续？`
          )
        ) {
          return;
        }
      }

      // 获取纠错等级
      const level = el("offline-qr-level").value;
      const correctLevel =
        {
          L: QRCode.CorrectLevel.L,
          M: QRCode.CorrectLevel.M,
          Q: QRCode.CorrectLevel.Q,
          H: QRCode.CorrectLevel.H,
        }[level] || QRCode.CorrectLevel.Q;

      // 生成二维码
      const box = el("offline-qrcode");
      box.innerHTML = "";
      offlineQrInstance = new QRCode(box, {
        text: dataUrl,
        width: 1200,
        height: 1200,
        correctLevel: correctLevel,
        colorDark: "#000000",
        colorLight: "#ffffff",
      });

      // 估算二维码版本（简化版）
      const version = Math.ceil(Math.sqrt(base64Size / 100));
      el("qr-version").textContent = `约 ${version}x${version}`;

      alert("离线二维码生成成功！");
    } catch (e) {
      alert("生成失败：" + e.message);
      console.error(e);
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function downloadOfflineQr() {
    if (!offlineQrInstance) {
      alert("请先生成离线二维码");
      return;
    }
    const canvas = el("offline-qrcode").querySelector("canvas");
    if (!canvas) {
      alert("未找到二维码图像");
      return;
    }
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `offline_qrcode_${
      el("productId").value.trim() || DEFAULT_PID
    }.png`;
    a.click();
  }

  function downloadOfflineHtml() {
    if (!offlineHtmlContent) {
      alert("请先生成离线二维码");
      return;
    }
    const blob = new Blob([offlineHtmlContent], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `offline_${el("productId").value.trim() || DEFAULT_PID}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function previewOfflineHtml() {
    if (!offlineHtmlContent) {
      alert("请先生成离线二维码");
      return;
    }
    try {
      // 创建data URL并在新窗口打开，模拟扫码后的效果
      const base64Content = btoa(
        unescape(encodeURIComponent(offlineHtmlContent))
      );
      const dataUrl = "data:text/html;base64," + base64Content;
      const previewWindow = window.open(dataUrl, "_blank");
      if (!previewWindow) {
        alert(
          "无法打开预览窗口，请检查浏览器弹窗设置。您也可以下载HTML文件后在浏览器中打开查看。"
        );
      }
    } catch (e) {
      alert("预览失败：" + e.message);
      console.error(e);
    }
  }

  function activeProductId() {
    return el("productId").value.trim() || DEFAULT_PID;
  }

  function codeProductTarget() {
    const overrideInput = el("codeProductId");
    if (overrideInput && overrideInput.value.trim()) {
      return overrideInput.value.trim();
    }
    return activeProductId();
  }

  function maybeSyncProductHint() {
    const codeInput = el("codeProductId");
    if (!codeInput) return;
    if (!codeInput.value.trim()) {
      codeInput.placeholder = `留空则使用：${activeProductId()}`;
    }
  }

  function formatDate(iso) {
    if (!iso) return "-";
    try {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      return date.toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function fallbackScanUrl(item) {
    const pid = item.productId || codeProductTarget();
    return buildScanUrl(pid, item.codeId, item.token);
  }

  function renderLatestBatch(codes) {
    const wrapper = el("latest-code-batch");
    if (!wrapper) return;
    if (!codes || codes.length === 0) {
      wrapper.classList.add("hidden");
      return;
    }
    el("latest-code-count").textContent = codes.length;
    const body = el("latest-code-body");
    body.innerHTML = "";
    codes.forEach((item, index) => {
      const url = item.scanUrl || fallbackScanUrl(item);
      const tokenValue = item.token || "";
      const tr = document.createElement("tr");

      // 创建二维码容器
      const qrCell = document.createElement("td");
      qrCell.style.cssText = "text-align: center; padding: 8px;";
      const qrContainer = document.createElement("div");
      qrContainer.id = `qr-${item.codeId}`;
      qrContainer.style.cssText =
        "width: 100px; height: 100px; margin: 0 auto 8px;";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn";
      downloadBtn.textContent = "下载";
      downloadBtn.style.cssText = "padding: 4px 8px; font-size: 12px;";
      downloadBtn.onclick = () => {
        setTimeout(() => {
          const qrBox = document.getElementById(`qr-${item.codeId}`);
          if (qrBox) {
            const canvas = qrBox.querySelector("canvas");
            if (canvas) {
              const a = document.createElement("a");
              a.href = canvas.toDataURL("image/png");
              a.download = `qrcode_${item.codeId}.png`;
              a.click();
            } else {
              alert("二维码尚未生成完成，请稍候再试");
            }
          }
        }, 200);
      };
      qrCell.appendChild(qrContainer);
      qrCell.appendChild(downloadBtn);

      // 生成二维码
      setTimeout(() => {
        const qrBox = document.getElementById(`qr-${item.codeId}`);
        if (qrBox) {
          qrBox.innerHTML = ""; // 清空容器
          new QRCode(qrBox, {
            text: url,
            width: 100,
            height: 100,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M,
          });
        }
      }, 100 * index); // 延迟生成，避免同时生成太多

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>
          <code>${item.codeId}</code>
          <button class="btn" data-copy-value="${
            item.codeId
          }" style="margin-left:6px;padding:4px 8px;">
            复制
          </button>
        </td>
        <td style="max-width:280px;word-break:break-all;">
          <code>${tokenValue || "-"}</code>
          ${
            tokenValue
              ? `<button class="btn" data-copy-value="${tokenValue}" style="margin-left:6px;padding:4px 8px;">复制</button>`
              : ""
          }
        </td>
        <td>
          <a href="${url}" target="_blank" rel="noopener">打开</a>
          <button class="btn" data-copy-value="${url}" style="margin-left:6px;padding:4px 8px;">
            复制链接
          </button>
        </td>
        <td>${formatDate(item.createdAt)}</td>
      `;

      // 将二维码单元格插入到第二个位置
      const cells = tr.querySelectorAll("td");
      if (cells.length > 0) {
        tr.insertBefore(qrCell, cells[0].nextSibling);
      }

      body.appendChild(tr);
    });
    wrapper.classList.remove("hidden");
  }

  function renderCodeTable(codes) {
    const body = el("code-table-body");
    const empty = el("code-empty");
    if (!body) return;
    body.innerHTML = "";
    if (!codes || codes.length === 0) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    codes.forEach((item) => {
      const url = item.scanUrl || fallbackScanUrl(item);
      const status =
        item.disabled || item.totalCount >= item.scanLimit ? "失效" : "可用";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${item.codeId}</code></td>
        <td>${status}</td>
        <td>${item.totalCount || 0}</td>
        <td>${item.scanLimit || 0}</td>
        <td>${formatDate(item.createdAt)}</td>
        <td>${formatDate(item.lastScanAt)}</td>
        <td>
          <button class="btn" data-copy-value="${
            item.codeId
          }" style="padding:4px 8px;">复制Code</button>
          <button class="btn" data-copy-value="${url}" style="padding:4px 8px;margin-left:6px;">复制链接</button>
        </td>
      `;
      body.appendChild(tr);
    });
  }

  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          console.log("已复制:", text);
        })
        .catch(() => {
          alert("复制失败，请手动复制。");
        });
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        alert("复制失败，请手动复制。");
      }
      document.body.removeChild(textarea);
    }
  }

  function handleCodeTableClick(event) {
    const target = event.target.closest("[data-copy-value]");
    if (!target) return;
    const value = target.getAttribute("data-copy-value");
    copyToClipboard(value);
    if (!target.dataset.originalText) {
      target.dataset.originalText = target.textContent;
    }
    target.textContent = "已复制";
    setTimeout(() => {
      target.textContent = target.dataset.originalText || "复制";
    }, 1500);
  }

  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function exportLatestBatchCsv() {
    if (!latestCodeBatch.length) {
      alert("暂无可导出的记录");
      return;
    }
    const rows = [
      [
        "codeId",
        "productId",
        "scanLimit",
        "totalCount",
        "createdAt",
        "scanUrl",
        "token",
      ],
      ...latestCodeBatch.map((item) => [
        item.codeId,
        item.productId || codeProductTarget(),
        item.scanLimit,
        item.totalCount || 0,
        item.createdAt || "",
        item.scanUrl || fallbackScanUrl(item),
        item.token || "",
      ]),
    ];
    const csv = rows
      .map((cols) => cols.map((c) => csvEscape(c)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codes_${codeProductTarget()}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleGenerateCodes() {
    const pid = codeProductTarget();
    const quantity = Math.max(
      1,
      Math.min(10000, parseInt(el("codeQuantity").value, 10) || 1)
    );
    const limit =
      Math.max(1, parseInt(el("codeScanLimit").value, 10)) ||
      Math.max(1, parseInt(el("scanLimit").value, 10) || 3);
    const apiBase = resolveApiBase();
    const baseUrl = `${resolveServerOrigin()}/index.html`;
    // 如果 API 地址是 localhost，给出警告
    if (
      apiBase &&
      (apiBase.includes("localhost") || apiBase.includes("127.0.0.1"))
    ) {
      const confirmMsg = `警告：您配置的 API 地址是 ${apiBase}，这是本地地址。\n\n如果您的 API 部署在远程服务器上，请使用实际的 API 地址（如 Cloudflare Workers URL 或您的 API 域名）。\n\n如果 API 部署在同一个域名下，可以留空此字段使用相对路径。\n\n是否继续使用 ${apiBase}？`;
      if (!confirm(confirmMsg)) {
        return; // 用户取消，不生成二维码
      }
    }
    // 确保URL包含apiBase参数，这样扫描时才能正确调用API
    // 如果 apiBase 为空，不添加 api 参数，使用相对路径
    const baseUrlWithApi =
      apiBase &&
      !apiBase.includes("localhost") &&
      !apiBase.includes("127.0.0.1")
        ? `${baseUrl}${
            baseUrl.includes("?") ? "&" : "?"
          }api=${encodeURIComponent(apiBase)}`
        : baseUrl;
    const payload = {
      productId: pid,
      quantity,
      scanLimit: limit,
      config: currentConfigFromForm(),
      baseUrl: baseUrlWithApi,
    };
    const bulkUrl = apiBase
      ? `${apiBase}/api/admin/codes/bulk` // 填了完整 API 地址
      : `/api/admin/codes/bulk`; // 留空 → 同域名

    const resp = await fetch(bulkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      throw new Error("生成失败，请检查 API 服务是否可用");
    }
    const data = await resp.json();
    if (!data.ok) {
      throw new Error(data.error || "生成失败");
    }
    latestCodeBatch = data.codes || [];
    renderLatestBatch(latestCodeBatch);
    await refreshCodeTable();
    alert(`生成成功，共 ${latestCodeBatch.length} 个二维码`);
  }

  async function refreshCodeTable() {
    const pid = codeProductTarget();
    const apiBase = resolveApiBase();
    const params = new URLSearchParams({
      productId: pid,
      baseUrl: `${resolveServerOrigin()}/index.html`,
    });
    const listUrl = apiBase
      ? `${apiBase}/api/admin/codes?${params.toString()}`
      : `/api/admin/codes?${params.toString()}`;

    const resp = await fetch(listUrl, { cache: "no-store" });

    if (!resp.ok) {
      throw new Error("获取二维码列表失败，请确认 API 服务可访问");
    }
    const data = await resp.json();
    if (!data.ok) {
      throw new Error(data.error || "获取二维码列表失败");
    }
    renderCodeTable(data.codes || []);
  }

  function bind() {
    el("login-btn").addEventListener("click", () => {
      const u = el("username").value.trim();
      const p = el("password").value.trim();
      if (u === ADMIN.username && p === ADMIN.password) {
        hide("login-section");
        show("admin-section");
        // 默认填入你的域名
        const hostInput = el("serverHost");
        if (hostInput && !hostInput.value) hostInput.value = "miraclewhite.top";
        const apiInput = el("apiBase");
        // 不设置默认值，让用户手动配置，或者留空使用相对路径
        // 如果留空，API 会使用相对路径（假设部署在同一个域名下）
        // 如果填写了 localhost，说明是本地开发，需要用户手动修改为实际的 API 地址
        if (apiInput && !apiInput.value) {
          // 提示用户：如果 API 部署在同一个域名下，可以留空；否则填写完整的 API 地址
          apiInput.placeholder =
            "留空则使用相对路径 (/api/...)，或填写完整 API 地址";
        }
        loadConfig(DEFAULT_PID);
        refreshStats();
        updateQrUrl();
        maybeSyncProductHint();
        refreshCodeTable().catch((err) =>
          console.warn("加载二维码列表失败", err)
        );
      } else {
        alert("用户名或密码错误");
      }
    });
    el("save-btn").addEventListener("click", save);
    el("refresh-stats").addEventListener("click", refreshStats);
    el("reset-stats").addEventListener("click", resetStats);
    el("gen-qr").addEventListener("click", genQr);
    el("download-qr").addEventListener("click", downloadQr);
    el("productId").addEventListener("input", () => {
      updateQrUrl();
      refreshStats();
      loadConfig(el("productId").value.trim() || DEFAULT_PID);
      maybeSyncProductHint();
    });
    const hostInput = el("serverHost");
    if (hostInput) hostInput.addEventListener("input", updateQrUrl);
    el("export-json").addEventListener("click", exportJson);

    // 离线二维码功能绑定
    el("upload-images-btn").addEventListener("click", () =>
      el("image-upload").click()
    );
    el("image-upload").addEventListener("change", (e) =>
      handleImageUpload(e.target.files)
    );
    el("gen-offline-qr").addEventListener("click", genOfflineQr);
    el("preview-offline-html").addEventListener("click", previewOfflineHtml);
    el("download-offline-qr").addEventListener("click", downloadOfflineQr);
    el("download-offline-html").addEventListener("click", downloadOfflineHtml);
    const codeProductInput = el("codeProductId");
    if (codeProductInput) {
      codeProductInput.addEventListener("input", () => {
        maybeSyncProductHint();
      });
    }
    el("generate-codes").addEventListener("click", () =>
      handleGenerateCodes().catch((err) => alert(err.message || err))
    );
    el("refresh-code-list").addEventListener("click", () =>
      refreshCodeTable().catch((err) => alert(err.message || err))
    );
    el("download-latest-csv").addEventListener("click", () =>
      exportLatestBatchCsv()
    );
    const codeTable = el("code-table");
    if (codeTable) {
      codeTable.addEventListener("click", handleCodeTableClick);
    }
    const latestBody = el("latest-code-body");
    if (latestBody) {
      latestBody.addEventListener("click", handleCodeTableClick);
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
