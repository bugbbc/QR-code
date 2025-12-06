(function () {
  // 取消可能存在的 service worker，减少缓存影响
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()));
  }

  const qs = new URLSearchParams(location.search);
  const PRODUCT_ID = qs.get("id") || "default-product";
  const CODE_ID = qs.get("code") || null;
  const TOKEN_PARAM = qs.get("token") || null;
  const API_BASE_PARAM = qs.get("api") || qs.get("apiBase") || "";
  const API_BASE = API_BASE_PARAM ? API_BASE_PARAM.replace(/\/$/, "") : "";

  function apiPath(path) {
    if (!path) return "/";
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (!API_BASE) return normalized;
    return `${API_BASE}${normalized}`;
  }

  let productMainEl;
  let limitViewEl;
  let limitCodeEl;
  let limitCodeValueEl;
  let limitRetryBtn;
  let limitSupportLink;
  let counterRemainingEl;
  let counterDetailEl;

  // 默认产品内容，可在后台修改
  const DEFAULT_CONFIG = {
    productId: PRODUCT_ID,
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

  const STORAGE_SCOPE = CODE_ID ? `${PRODUCT_ID}:${CODE_ID}` : PRODUCT_ID;

  const LS_KEYS = {
    config: (pid) => `config:${pid}`,
    scanCount: (scope, did) => `scanCount:${scope}:${did}`,
    stats: (pid) => `scanStats:${pid}`,
    devices: (scope) => `scanDevices:${scope}`,
    token: (scope, did) => `scanToken:${scope}:${did}`,
  };

  // 简易哈希函数（djb2）
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h << 5) + h + str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  // Canvas 指纹
  function canvasFingerprint() {
    try {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      c.width = 200;
      c.height = 50;
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText(navigator.userAgent, 2, 2);
      ctx.strokeStyle = "#f00";
      ctx.arc(100, 30, 15, 0, Math.PI, true);
      ctx.stroke();
      return hash(c.toDataURL());
    } catch (e) {
      return "nocanvas";
    }
  }

  // 设备指纹组合
  function getDeviceId() {
    const parts = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      screen.width + "x" + screen.height,
      Intl.DateTimeFormat().resolvedOptions().timeZone || "notz",
      canvasFingerprint(),
    ];
    return hash(parts.join("|"));
  }

  function base64UrlDecode(input) {
    if (!input) return null;
    try {
      let normalized = input.replace(/-/g, "+").replace(/_/g, "/");
      const padding = normalized.length % 4;
      if (padding) {
        normalized += "=".repeat(4 - padding);
      }
      const decoded = atob(normalized);
      return decoded;
    } catch (e) {
      return null;
    }
  }

  function decodeSignedToken(token) {
    if (!token) return null;
    const dotIndex = token.indexOf(".");
    if (dotIndex === -1) return null;
    const bodyB64 = token.slice(0, dotIndex);
    const body = base64UrlDecode(bodyB64);
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch (e) {
      return null;
    }
  }

  function loadStoredTokenBundle(scope, did) {
    const raw = localStorage.getItem(LS_KEYS.token(scope, did));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.token && parsed.payload) return parsed;
    } catch (e) {
      return null;
    }
    return null;
  }

  function persistTokenBundle(scope, did, token, payload) {
    if (!token || !payload) return;
    localStorage.setItem(
      LS_KEYS.token(scope, did),
      JSON.stringify({ token, payload })
    );
  }

  function statsFromPayload(payload) {
    if (!payload) return null;
    const limit = Math.max(1, parseInt(payload.scanLimit, 10) || 3);
    const remaining = Math.max(
      0,
      Math.min(limit, parseInt(payload.remaining, 10) || 0)
    );
    const used = Math.min(limit, Math.max(0, limit - remaining));
    let order = 3;
    if (remaining <= 0) {
      order = 4;
    } else if (used === 0) {
      order = 1;
    } else if (used === 1) {
      order = 2;
    }
    return { limit, remaining, used, order };
  }

  // 加载或保存配置
  async function fetchRemoteConfig(pid) {
    try {
      const res = await fetch(`./configs/${pid}.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        // 配置文件不存在是正常情况，不输出错误
        return null;
      }
      const data = await res.json();
      return data;
    } catch (e) {
      // 静默处理错误，配置文件不存在是正常情况
      return null;
    }
  }
  function getConfig(pid) {
    const raw = localStorage.getItem(LS_KEYS.config(pid));
    if (!raw) return DEFAULT_CONFIG;
    try {
      const cfg = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...cfg, productId: pid };
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }
  function saveConfig(pid, cfg) {
    localStorage.setItem(LS_KEYS.config(pid), JSON.stringify(cfg));
  }

  // 扫描计数
  function getScanCount(scope, did) {
    const v = localStorage.getItem(LS_KEYS.scanCount(scope, did));
    return v ? parseInt(v, 10) : 0;
  }
  function setScanCount(scope, did, count) {
    localStorage.setItem(LS_KEYS.scanCount(scope, did), String(count));
  }

  // 统计
  function getStats(pid) {
    const raw = localStorage.getItem(LS_KEYS.stats(pid));
    if (!raw)
      return {
        total: 0,
        first: 0,
        second: 0,
        invalid: 0,
        byDeviceType: { android: 0, ios: 0, other: 0 },
        regions: {},
      };
    try {
      return JSON.parse(raw);
    } catch (e) {
      return {
        total: 0,
        first: 0,
        second: 0,
        invalid: 0,
        byDeviceType: { android: 0, ios: 0, other: 0 },
        regions: {},
      };
    }
  }
  function saveStats(pid, stats) {
    localStorage.setItem(LS_KEYS.stats(pid), JSON.stringify(stats));
  }
  function addDevice(scope, did) {
    const raw = localStorage.getItem(LS_KEYS.devices(scope));
    const set = raw ? new Set(JSON.parse(raw)) : new Set();
    set.add(did);
    localStorage.setItem(
      LS_KEYS.devices(scope),
      JSON.stringify(Array.from(set))
    );
  }
  function deviceCount(scope) {
    const raw = localStorage.getItem(LS_KEYS.devices(scope));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.length : 0;
  }

  function detectDeviceType() {
    const ua = navigator.userAgent.toLowerCase();
    if (/android/.test(ua)) return "android";
    if (/iphone|ipad|ipod|ios/.test(ua)) return "ios";
    return "other";
  }

  async function detectRegion() {
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (!res.ok) throw new Error("ipapi failed");
      const data = await res.json();
      return data.country_name || data.region || "未知";
    } catch (e) {
      return navigator.language || "未知";
    }
  }

  // 渲染轮播
  function renderCarousel(containerId, images, autoplayMs = 2800) {
    const container = document.getElementById(containerId);
    const track = document.createElement("div");
    track.className = "carousel-track";
    images.forEach((src) => {
      const item = document.createElement("div");
      item.className = "carousel-item";
      const img = document.createElement("img");
      img.src = src + `?t=${Date.now()}`; // cache bust
      item.appendChild(img);
      track.appendChild(item);
    });
    container.appendChild(track);
    const nav = document.createElement("div");
    nav.className = "carousel-nav";
    const btnPrev = document.createElement("button");
    btnPrev.className = "carousel-btn";
    btnPrev.textContent = "‹";
    const btnNext = document.createElement("button");
    btnNext.className = "carousel-btn";
    btnNext.textContent = "›";
    nav.appendChild(btnPrev);
    nav.appendChild(btnNext);
    container.appendChild(nav);
    const dots = document.createElement("div");
    dots.className = "carousel-dots";
    const dotEls = images.map((_, i) => {
      const d = document.createElement("div");
      d.className = "dot" + (i === 0 ? " active" : "");
      dots.appendChild(d);
      return d;
    });
    container.appendChild(dots);
    let index = 0;
    const total = images.length;
    function update() {
      track.style.transform = `translateX(-${index * 100}%)`;
      dotEls.forEach((d, i) => {
        d.className = "dot" + (i === index ? " active" : "");
      });
    }
    btnPrev.addEventListener("click", () => {
      index = (index - 1 + total) % total;
      update();
    });
    btnNext.addEventListener("click", () => {
      index = (index + 1) % total;
      update();
    });
    let timer = setInterval(() => {
      index = (index + 1) % total;
      update();
    }, autoplayMs);
    container.addEventListener("mouseenter", () => clearInterval(timer));
    container.addEventListener(
      "mouseleave",
      () =>
        (timer = setInterval(() => {
          index = (index + 1) % total;
          update();
        }, autoplayMs))
    );
    update();
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  async function fetchCodeConfig(codeId) {
    try {
      const resp = await fetch(
        apiPath(`/api/code/${encodeURIComponent(codeId)}`)
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data && data.ok ? data.config : null;
    } catch (e) {
      return null;
    }
  }

  async function refreshTokenRemote(codeId, token) {
    if (!codeId || !token) throw new Error("MISSING_TOKEN");
    const resp = await fetch(apiPath("/api/code/token/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeId, token }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || "REFRESH_FAILED");
    }
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "REFRESH_FAILED");
    return data;
  }

  async function recordScanRemote(codeId, deviceId) {
    if (!codeId || !deviceId) throw new Error("MISSING_PARAMS");
    const resp = await fetch(apiPath("/api/scan"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeId, deviceId }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || "SCAN_FAILED");
    }
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "SCAN_FAILED");
    return data;
  }

  function renderContent(cfg) {
    // 1. 保持顶部标题不变，使用HTML格式支持换行和斜体
    setHTML(
      "product-name",
      "Improved composition with<br/><em>finest ingredients.</em>"
    );
    setText("hero-art", "Premium • Elegant • Reliable");

    // 2. 智能渲染规格 (Specs) - 让它变成漂亮的列表，而不是一段死板的文字
    const specsEl = document.getElementById("product-specs");
    if (specsEl && cfg.specs) {
      // 把文本按行分割，过滤掉空行
      const lines = cfg.specs.split("\n").filter((line) => line.trim());
      // 生成带图标样式的 HTML
      specsEl.innerHTML = lines
        .map((line) => {
          // 去掉原本可能存在的 "- " 符号，让样式更统一
          const cleanLine = line.replace(/^-\s*/, "").replace(/^[•]\s*/, "");
          return `
          <div class="spec-item" style="display: flex; align-items: flex-start; margin-bottom: 8px;">
            <div style="min-width: 6px; height: 6px; border-radius: 50%; background: #c7a878; margin-top: 9px; margin-right: 10px;"></div>
            <span style="color: #555;">${cleanLine}</span>
          </div>
        `;
        })
        .join("");
    }

    // 3. 智能渲染功能 (Features) - 同样处理换行
    const featuresEl = document.getElementById("product-features");
    if (featuresEl && cfg.features) {
      // 将换行符转换为 HTML 的换行，增加段落间距
      featuresEl.innerHTML = cfg.features.replace(/\n/g, "<br/>");
    }

    // 4. 其他部分保持原样
    setText("product-usage", cfg.usage);

    // 如果想要联系方式也好看点，可以把换行转为 <br>
    const contactEl = document.getElementById("product-contact");
    if (contactEl && cfg.contact) {
      contactEl.innerHTML = (cfg.contact || "").replace(/\n/g, "<br/>");
    }

    // 底部联系方式同理
    const contactBottomEl = document.getElementById("product-contact-bottom");
    if (contactBottomEl) {
      contactBottomEl.innerHTML = (cfg.contact || "").replace(/\n/g, "<br/>");
    }

    // 5. 购买链接渲染 (保持不变)
    const linksWrap = document.querySelector("#purchase-links .links");
    if (linksWrap && cfg.purchaseLinks) {
      linksWrap.innerHTML = "";
      cfg.purchaseLinks.forEach((l) => {
        const a = document.createElement("a");
        a.href = l.url;
        a.textContent = l.text;
        a.target = "_blank";
        a.rel = "noopener";
        // 确保样式类名匹配新 CSS
        a.className = "btn primary";
        a.style.margin = "0 8px 8px 0"; // 增加一点间距
        linksWrap.appendChild(a);
      });
    }
  }

  // 生成条形码（基于二维码ID，实现一物一码）
  function generateBarcode(codeId) {
    if (!codeId) {
      // 如果没有codeId，生成一个基于时间戳的临时ID
      codeId = `TEMP-${Date.now()}`;
    }

    // 将codeId转换为条形码数字（EAN-13格式：13位数字）
    // 使用哈希函数将codeId转换为数字字符串
    function codeIdToBarcodeNumber(codeId) {
      // 简单的哈希函数，将字符串转换为数字
      let hash = 0;
      for (let i = 0; i < codeId.length; i++) {
        const char = codeId.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // 转换为32位整数
      }

      // 取绝对值并转换为字符串
      const numStr = Math.abs(hash).toString();

      // 生成13位EAN-13格式的条形码数字
      // 格式：前缀(1位) + 厂商代码(6位) + 产品代码(5位) + 校验位(1位)
      let barcode = "6"; // 前缀（6表示美国/加拿大）

      // 填充到12位
      const padded = numStr.padStart(12, "0").substring(0, 12);
      barcode += padded;

      // 计算EAN-13校验位
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        const digit = parseInt(barcode[i], 10);
        if (isNaN(digit)) {
          // 如果某个字符不是数字，使用0
          barcode = barcode.substring(0, i) + "0" + barcode.substring(i + 1);
          sum += 0;
        } else {
          sum += i % 2 === 0 ? digit : digit * 3;
        }
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      barcode += checkDigit.toString();

      // 验证条形码是13位纯数字
      if (barcode.length !== 13 || !/^\d{13}$/.test(barcode)) {
        // 如果生成失败，使用默认值
        console.warn("条形码生成失败，使用默认值", barcode);
        barcode = "6970244633822";
      }

      return barcode;
    }

    const barcodeNumber = codeIdToBarcodeNumber(codeId);

    // 格式化显示：6 | 970244 | 633822
    const formatted = `${barcodeNumber[0]} | ${barcodeNumber.substring(
      1,
      7
    )} | ${barcodeNumber.substring(7)}`;

    // 使用JsBarcode生成条形码
    const svg = document.getElementById("barcode-svg");
    if (svg) {
      // 清空SVG内容
      svg.innerHTML = "";

      // 检查JsBarcode是否已加载
      if (typeof JsBarcode !== "undefined") {
        try {
          JsBarcode(svg, barcodeNumber, {
            format: "EAN13",
            width: 2,
            height: 80,
            displayValue: false,
            background: "#ffffff",
            lineColor: "#000000",
          });
        } catch (e) {
          console.warn(
            "Barcode generation failed:",
            e,
            "Barcode number:",
            barcodeNumber
          );
          // 如果生成失败，尝试使用CODE128格式
          try {
            JsBarcode(svg, barcodeNumber, {
              format: "CODE128",
              width: 2,
              height: 80,
              displayValue: false,
              background: "#ffffff",
              lineColor: "#000000",
            });
          } catch (e2) {
            // 如果CODE128也失败，显示一个简单的条形码占位符
            svg.innerHTML = `<rect width="100%" height="80" fill="#f0f0f0"/>`;
          }
        }
      } else {
        // 如果JsBarcode还没加载，等待加载完成后再生成
        const checkJsBarcode = setInterval(() => {
          if (typeof JsBarcode !== "undefined") {
            clearInterval(checkJsBarcode);
            try {
              JsBarcode(svg, barcodeNumber, {
                format: "EAN13",
                width: 2,
                height: 80,
                displayValue: false,
                background: "#ffffff",
                lineColor: "#000000",
              });
            } catch (e) {
              console.error("Barcode generation failed:", e);
            }
          }
        }, 100);
        // 10秒后停止检查
        setTimeout(() => clearInterval(checkJsBarcode), 10000);
      }
    }

    // 更新条形码数字显示
    const numbersEl = document.getElementById("barcode-numbers");
    if (numbersEl) {
      numbersEl.textContent = formatted;
    }

    return { barcodeNumber, formatted };
  }

  // 显示验证成功页面
  function showVerificationSuccess(scanCount, codeId, scanLimit = 3) {
    const verificationEl = document.getElementById("verification-success");
    if (!verificationEl) {
      console.error("验证成功页面元素未找到");
      return;
    }

    console.log("显示验证成功页面", { scanCount, codeId, scanLimit });

    // 不隐藏其他内容，让主页面内容正常显示在下面
    // 只隐藏scan-counter（因为验证页面已经显示了扫描信息）
    const scanCounter = document.getElementById("scan-counter");
    if (scanCounter) scanCounter.classList.add("hidden");

    // 确保主页面内容始终显示
    const productMain = document.getElementById("product-main");
    if (productMain) {
      productMain.classList.remove("hidden");
      productMain.style.display = "";
    }

    // 显示验证成功页面 - 作为正常的页面内容块显示在顶部
    verificationEl.classList.remove("hidden");
    verificationEl.style.display = "block";

    // 更新扫描次数
    const scanCountEl = document.getElementById("verification-scan-count");
    if (scanCountEl) {
      scanCountEl.textContent = scanCount || 1;
    }

    // 判断是否超过扫描限制
    const isExceeded = scanCount > scanLimit;

    // 显示/隐藏图标
    const checkmarkIcon = document.getElementById("checkmark-icon");
    const crossIcon = document.getElementById("cross-icon");
    if (checkmarkIcon && crossIcon) {
      if (isExceeded) {
        checkmarkIcon.classList.add("hidden");
        crossIcon.classList.remove("hidden");
      } else {
        checkmarkIcon.classList.remove("hidden");
        crossIcon.classList.add("hidden");
      }
    }

    // 超过限制时隐藏条形码
    const barcodeContainer = document.querySelector(".barcode-container");
    if (barcodeContainer) {
      if (isExceeded) {
        barcodeContainer.classList.add("hidden");
      } else {
        barcodeContainer.classList.remove("hidden");
      }
    }

    // 更新状态文字
    const statusTitle = document.getElementById("verification-status-title");
    const statusDescription = document.getElementById(
      "verification-status-description"
    );
    const statusNote = document.getElementById("verification-status-note");

    if (isExceeded) {
      // 超过限制时显示红色叉和相应文字
      if (statusTitle) {
        statusTitle.textContent = "MULTIPLE VERIFICATION";
        statusTitle.style.color = "#000";
      }
      if (statusDescription) {
        statusDescription.textContent =
          "This anti-counterfeit code has been scanned multiple times.";
      }
      if (statusNote) {
        statusNote.innerHTML =
          "<em>Please purchase the genuine product through a reliable seller.</em>";
      }
    } else {
      // 未超过限制时显示绿色对勾和正常文字
      if (statusTitle) {
        statusTitle.textContent = "THIS IS GENUINE PRODUCT";
        statusTitle.style.color = "#000";
      }
      if (statusDescription) {
        statusDescription.textContent =
          "This product has been identified by the system as genuine.";
      }
      if (statusNote) {
        statusNote.innerHTML =
          "<em>Please feel at ease to use the product.</em>";
      }
    }

    // 生成条形码
    generateBarcode(codeId || CODE_ID);
  }

  function showFirstScan(cfg, scanCount = 1) {
    // 第一次扫描时显示验证成功页面
    // 使用传入的实际扫描次数，而不是硬编码的1
    const limit = Math.max(1, parseInt(cfg?.scanLimit, 10) || 3);
    showVerificationSuccess(scanCount, CODE_ID, limit);

    const purchaseLinks = document.getElementById("purchase-links");
    const invalidSection = document.getElementById("invalid-section");
    const couponModal = document.getElementById("coupon-modal");

    if (purchaseLinks) purchaseLinks.classList.remove("hidden");
    if (invalidSection) invalidSection.classList.add("hidden");
    if (couponModal) couponModal.classList.add("hidden");
  }
  function showSecondScan(cfg) {
    document.getElementById("purchase-links").classList.remove("hidden");
    document.getElementById("invalid-section").classList.add("hidden");
    document.getElementById("coupon-modal").classList.add("hidden");
  }
  function showValidScan() {
    document.getElementById("purchase-links").classList.remove("hidden");
    document.getElementById("invalid-section").classList.add("hidden");
    document.getElementById("coupon-modal").classList.add("hidden");
  }
  function showInvalid() {
    // 验证页面已经显示了验证状态，不需要显示invalid-section
    // 主页面内容应该始终显示
    const purchaseLinks = document.getElementById("purchase-links");
    const couponModal = document.getElementById("coupon-modal");
    const invalidSection = document.getElementById("invalid-section");

    if (purchaseLinks) purchaseLinks.classList.add("hidden");
    if (couponModal) couponModal.classList.add("hidden");
    // 不显示invalid-section，因为验证页面已经显示了验证状态
    // if (invalidSection) invalidSection.classList.remove("hidden");

    // 不删除链接，保持主页面内容完整
    // document.querySelectorAll("a").forEach((a) => {
    //   if (a.id !== "admin-link") {
    //     a.replaceWith(document.createTextNode(a.textContent));
    //   }
    // });
    // const adminLink = document.getElementById("admin-link");
    // if (adminLink) adminLink.closest(".footer").classList.add("hidden");
  }

  function updateScanHint(count, limit) {
    const box = document.getElementById("scan-hint");
    const text = document.getElementById("scan-hint-text");
    if (!box || !text) return;
    box.classList.remove("hidden");
    const capped = Math.min(count, limit);
    if (count >= limit) {
      box.classList.add("warning");
      text.textContent = `This QR code is void on this device · scanned ${capped}/${limit} times.`;
    } else {
      box.classList.remove("warning");
      const remain = Math.max(limit - count, 0);
      text.textContent = `Scanned ${count}/${limit} times on this device · ${remain} remaining.`;
    }
  }

  async function updateStats(scanOrder) {
    const stats = getStats(PRODUCT_ID);
    stats.total += 1;
    if (scanOrder === 1) stats.first += 1;
    else if (scanOrder === 2) stats.second += 1;
    else stats.invalid += 1;
    const dt = detectDeviceType();
    stats.byDeviceType[dt] = (stats.byDeviceType[dt] || 0) + 1;
    const region = await detectRegion();
    stats.regions[region] = (stats.regions[region] || 0) + 1;
    saveStats(PRODUCT_ID, stats);
  }

  function renderScanCounter(limit, remaining, used) {
    if (!counterRemainingEl || !counterDetailEl) return;
    const safeLimit = Math.max(1, limit || 1);
    const safeRemaining = Math.max(
      0,
      Math.min(safeLimit, remaining ?? safeLimit)
    );
    const safeUsed = Math.max(0, Math.min(safeLimit, used ?? 0));
    counterRemainingEl.textContent = `${safeRemaining} left`;
    counterDetailEl.textContent = `Scanned ${safeUsed}/${safeLimit} times for this QR code.`;
  }

  function activateLimitMode(source = {}) {
    const override = qs.get("limitPage");
    if (override) {
      try {
        const url = new URL(override, location.href);
        if (PRODUCT_ID) url.searchParams.set("id", PRODUCT_ID);
        const code = CODE_ID || source.codeId;
        if (code) url.searchParams.set("code", code);
        location.replace(url.toString());
        return;
      } catch (e) {
        console.warn("Invalid limitPage override", e);
      }
    }
    // 不隐藏主页面内容，验证页面只是用来验证，主页面内容应该始终显示
    // if (productMainEl) productMainEl.classList.add("hidden");
    if (!limitViewEl) return;
    // 也不显示limit-view，因为验证页面已经显示了验证状态
    // limitViewEl.classList.remove("hidden");
    const codeValue = CODE_ID || source.codeId;
    if (limitCodeEl && limitCodeValueEl) {
      if (codeValue) {
        limitCodeEl.classList.remove("hidden");
        limitCodeValueEl.textContent = codeValue;
      } else {
        limitCodeEl.classList.add("hidden");
      }
    }
    const supportParam = qs.get("support");
    if (supportParam && limitSupportLink) {
      limitSupportLink.href = supportParam;
    }
    if (limitRetryBtn) {
      limitRetryBtn.onclick = () => {
        const next = new URL(window.location.href);
        next.searchParams.delete("token");
        location.href = next.toString();
      };
    }
  }

  function resolveInitialTokenBundle(did) {
    const stored = loadStoredTokenBundle(STORAGE_SCOPE, did);
    if (stored && stored.payload) {
      if (!CODE_ID || stored.payload.codeId === CODE_ID) {
        return stored;
      }
    }
    if (TOKEN_PARAM) {
      const decoded = decodeSignedToken(TOKEN_PARAM);
      if (decoded && (!CODE_ID || decoded.codeId === CODE_ID)) {
        return { token: TOKEN_PARAM, payload: decoded };
      }
    }
    return null;
  }

  function applyPayloadState(payload, cfg) {
    const stats = statsFromPayload(payload);
    if (!stats) return null;
    renderScanCounter(stats.limit, stats.remaining, stats.used);
    updateScanHint(stats.used, stats.limit);
    if (stats.remaining <= 0) {
      // 超过限制时显示验证页面（红色叉）
      showVerificationSuccess(stats.used, payload.codeId, stats.limit);
      showInvalid();
      activateLimitMode({ codeId: payload.codeId });
      return stats;
    }
    if (stats.order === 1) {
      showFirstScan(cfg, stats.used);
    } else if (stats.order === 2) {
      showSecondScan(cfg);
    } else {
      showValidScan(cfg);
    }
    return stats;
  }

  async function handleTokenFlow(cfg, did) {
    const bundle = resolveInitialTokenBundle(did);
    if (!bundle || !bundle.payload) return false;

    // 如果有CODE_ID，总是使用服务器API记录扫描（这是唯一真实来源）
    if (CODE_ID) {
      try {
        const scanResult = await recordScanRemote(CODE_ID, did);
        const limit =
          scanResult.scanLimit || Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
        const totalCount = scanResult.totalCount || 0;
        const status = scanResult.status || "valid";

        // 更新配置（服务器可能返回更新的配置）
        if (scanResult.config) {
          cfg = { ...cfg, ...scanResult.config };
          renderContent(cfg);
        }

        const remaining = Math.max(0, limit - totalCount);
        renderScanCounter(limit, remaining, totalCount);
        updateScanHint(totalCount, limit);

        let order = 3;
        if (status === "invalid" || totalCount >= limit) {
          // 超过限制时显示验证页面（红色叉）
          showVerificationSuccess(totalCount, CODE_ID, limit);
          showInvalid();
          activateLimitMode({ codeId: CODE_ID });
          order = 4;
        } else if (status === "first" || totalCount === 1) {
          // 传入实际的扫描次数
          showFirstScan(cfg, totalCount);
          order = 1;
        } else if (status === "second" || totalCount === 2) {
          showSecondScan(cfg);
          order = 2;
        } else {
          showValidScan();
          order = 3;
        }
        await updateStats(order);

        // 如果有token，保存token信息（用于后续可能的token刷新）
        if (bundle && bundle.token) {
          persistTokenBundle(STORAGE_SCOPE, did, bundle.token, bundle.payload);
        }
        return true;
      } catch (err) {
        console.error("Remote scan failed:", err);
        // API调用失败时，显示错误信息，但仍然尝试使用token逻辑作为fallback
        const currentStats = applyPayloadState(bundle.payload, cfg);
        if (currentStats) {
          renderScanCounter(
            currentStats.limit,
            currentStats.remaining,
            currentStats.used
          );
          updateScanHint(currentStats.used, currentStats.limit);
        }
        // 继续执行token逻辑作为fallback
      }
    }

    // 没有CODE_ID时，使用token逻辑（纯客户端逻辑）
    const currentStats = applyPayloadState(bundle.payload, cfg);
    if (!currentStats) return false;
    if (currentStats.remaining <= 0) {
      await updateStats(currentStats.order || 4);
      activateLimitMode({ codeId: bundle.payload.codeId });
      return true;
    }
    const targetCode = CODE_ID || bundle.payload.codeId;
    if (!targetCode) return false;
    let orderForStats = currentStats.order || 3;

    // 检查是否是第一次访问：
    // 如果存储的token与当前token相同，且remaining等于limit且used为0，说明还没使用过，不刷新
    const storedBundle = loadStoredTokenBundle(STORAGE_SCOPE, did);
    const isSameToken = storedBundle && storedBundle.token === bundle.token;
    const isUnused =
      currentStats.remaining === currentStats.limit && currentStats.used === 0;
    const isFirstVisit = isSameToken && isUnused;

    // 如果是第一次访问（同一个未使用的token），不刷新token（不消耗次数）
    if (isFirstVisit) {
      // 第一次访问，只保存token，不刷新
      persistTokenBundle(STORAGE_SCOPE, did, bundle.token, bundle.payload);
      await updateStats(orderForStats);
      return true;
    }

    // 如果没有存储的token，说明是首次扫码，保存但不刷新
    if (!storedBundle) {
      persistTokenBundle(STORAGE_SCOPE, did, bundle.token, bundle.payload);
      await updateStats(orderForStats);
      return true;
    }

    // 非第一次访问，才刷新token（消耗次数）
    try {
      const refreshed = await refreshTokenRemote(targetCode, bundle.token);
      persistTokenBundle(
        STORAGE_SCOPE,
        did,
        refreshed.token,
        refreshed.payload
      );
      const nextStats = applyPayloadState(refreshed.payload, cfg);
      if (nextStats) {
        orderForStats = nextStats.order || orderForStats;
        if (nextStats.remaining <= 0) {
          activateLimitMode({ codeId: bundle.payload.codeId });
        }
      }
    } catch (err) {
      console.warn("Token refresh failed", err);
      updateScanHint(currentStats.used, currentStats.limit);
    } finally {
      await updateStats(orderForStats);
    }
    return true;
  }

  async function handleLegacyFlow(cfg, did) {
    // 如果有code参数，必须调用服务器API记录扫描（这是唯一真实来源）
    if (CODE_ID) {
      try {
        const scanResult = await recordScanRemote(CODE_ID, did);
        const limit =
          scanResult.scanLimit || Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
        const totalCount = scanResult.totalCount || 0;
        const status = scanResult.status || "valid";

        // 更新配置（服务器可能返回更新的配置）
        if (scanResult.config) {
          cfg = { ...cfg, ...scanResult.config };
          renderContent(cfg);
        }

        const remaining = Math.max(0, limit - totalCount);
        renderScanCounter(limit, remaining, totalCount);
        updateScanHint(totalCount, limit);

        let order = 3;
        if (status === "invalid" || totalCount >= limit) {
          // 超过限制时显示验证页面（红色叉）
          showVerificationSuccess(totalCount, CODE_ID, limit);
          showInvalid();
          activateLimitMode({ codeId: CODE_ID });
          order = 4;
        } else if (status === "first" || totalCount === 1) {
          // 传入实际的扫描次数
          showFirstScan(cfg, totalCount);
          order = 1;
        } else if (status === "second" || totalCount === 2) {
          showSecondScan(cfg);
          order = 2;
        } else {
          showValidScan();
          order = 3;
        }
        await updateStats(order);
        return;
      } catch (err) {
        console.error("Remote scan failed for CODE_ID:", CODE_ID, err);
        // API调用失败时，显示错误信息，但仍然显示初始状态
        const limit = Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
        renderScanCounter(limit, limit, 0);
        counterDetailEl.textContent = `Error: Unable to record scan. Please try again.`;
        return;
      }
    }

    // 本地逻辑（仅在没有code参数时使用）
    let count = getScanCount(STORAGE_SCOPE, did);
    count += 1;
    setScanCount(STORAGE_SCOPE, did, count);
    const limit = Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
    updateScanHint(count, limit);
    const remaining = Math.max(limit - count, 0);
    renderScanCounter(limit, remaining, Math.min(count, limit));

    let order = 3;
    if (count === 1) {
      showFirstScan(cfg, count);
      order = 1;
    } else if (count < limit) {
      showSecondScan(cfg);
      order = 2;
    } else {
      // 超过限制时显示验证页面（红色叉）
      showVerificationSuccess(count, CODE_ID, limit);
      showInvalid();
      activateLimitMode({ codeId: CODE_ID });
      order = 4;
    }
    await updateStats(order);
  }

  async function main() {
    let cfg = DEFAULT_CONFIG;
    if (CODE_ID) {
      const byCode = await fetchCodeConfig(CODE_ID);
      if (byCode) cfg = { ...DEFAULT_CONFIG, ...byCode, productId: PRODUCT_ID };
    } else {
      const remote = await fetchRemoteConfig(PRODUCT_ID);
      if (remote) {
        cfg = { ...DEFAULT_CONFIG, ...remote, productId: PRODUCT_ID };
      } else {
        cfg = getConfig(PRODUCT_ID);
      }
    }
    renderContent(cfg);
    // 两个轮播
    renderCarousel("carousel-top", [
      "figure/up_1.jpg",
      "figure/up_2.jpg",
      "figure/up_3.jpg",
      "figure/up_4.jpg",
      "figure/up_5.jpg",
      "figure/up_6.jpg",
      "figure/up_7.jpg",
    ]);
    renderCarousel("carousel-bottom", [
      "figure/down_1.jpg",
      "figure/down_2.jpg",
      "figure/down_3.jpg",
      "figure/down_4.jpg",
      "figure/down_5.jpg",
      "figure/down_6.jpg",
    ]);

    productMainEl = document.getElementById("product-main");
    limitViewEl = document.getElementById("limit-view");
    limitCodeEl = document.getElementById("limit-code");
    limitCodeValueEl = document.getElementById("limit-code-value");
    limitRetryBtn = document.getElementById("limit-retry");
    limitSupportLink = document.getElementById("limit-support");
    counterRemainingEl = document.getElementById("counter-remaining");
    counterDetailEl = document.getElementById("counter-detail");

    // 初始化显示（会在后续流程中被更新）
    const initialLimit = Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
    if (counterRemainingEl && counterDetailEl) {
      renderScanCounter(initialLimit, initialLimit, 0);
    }

    const did = getDeviceId();
    addDevice(STORAGE_SCOPE, did);

    // 处理扫码逻辑：如果有CODE_ID，总是调用服务器API；否则使用本地逻辑
    const handled = await handleTokenFlow(cfg, did);
    if (!handled) {
      await handleLegacyFlow(cfg, did);
    }

    // 注意：不要在这里再次调用recordScanRemote，因为handleTokenFlow和handleLegacyFlow已经调用过了
    // 再次调用会导致扫描次数重复增加

    // 如果有CODE_ID，默认显示验证成功页面（用于测试和演示）
    // 可以通过 ?showVerification=0 来禁用
    // 如果没有CODE_ID，可以通过 ?showVerification=1 来强制显示（用于测试）
    const shouldShowVerification = qs.get("showVerification") !== "0";
    const forceShow = qs.get("showVerification") === "1";

    // 如果URL中有showVerification=1参数，或者有CODE_ID，则显示验证成功页面
    // 注意：如果handleTokenFlow或handleLegacyFlow已经调用了showVerificationSuccess，这里就不需要再调用了
    // 但为了确保显示，我们仍然在延迟后检查并显示
    if (forceShow || (shouldShowVerification && CODE_ID)) {
      // 延迟显示，确保页面加载完成和扫码逻辑处理完成
      setTimeout(() => {
        // 检查验证页面是否已经显示
        const verificationEl = document.getElementById("verification-success");
        if (verificationEl && verificationEl.classList.contains("hidden")) {
          // 如果验证页面还没有显示，使用本地存储的扫描次数
          // 注意：handleTokenFlow/handleLegacyFlow已经调用了recordScanRemote并更新了服务器数据
          // 这里不应该再次调用API，否则会导致扫描次数重复增加
          const scanCount = getScanCount(STORAGE_SCOPE, did) + 1;
          const codeIdToUse = CODE_ID || "TEST-" + Date.now();
          const limit = Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
          console.log("准备显示验证成功页面（延迟显示）", {
            scanCount,
            codeIdToUse,
            CODE_ID,
            forceShow,
            limit,
          });
          showVerificationSuccess(scanCount, codeIdToUse, limit);
        }
      }, 1500);
    } else if (!CODE_ID) {
      // 如果没有CODE_ID且没有强制显示参数，默认也显示验证页面（用于演示）
      setTimeout(() => {
        const verificationEl = document.getElementById("verification-success");
        if (verificationEl && verificationEl.classList.contains("hidden")) {
          const limit = Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
          showVerificationSuccess(1, "DEMO-" + Date.now(), limit);
        }
      }, 1500);
    }

    // 确保计数器已更新（双重检查）
    if (
      counterDetailEl &&
      counterDetailEl.textContent === "Waiting for scan data..."
    ) {
      // 如果还是初始文本，说明没有正确更新，使用默认值
      const limit = Math.max(1, parseInt(cfg.scanLimit, 10) || 3);
      renderScanCounter(limit, limit, 0);
    }

    setTimeout(() => {
      const overlay = document.getElementById("loading-overlay");
      overlay.style.opacity = 0;
      setTimeout(() => overlay.remove(), 300);
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
