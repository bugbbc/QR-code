# API 服务地址配置指南

## 如何找到 API 服务的实际地址

根据你的项目结构，API 使用 Cloudflare Workers 格式。有以下几种情况：

### 情况 1：API 部署在 Cloudflare Workers（推荐）

如果你的 API 部署在 Cloudflare Workers 上：

1. **登录 Cloudflare Dashboard**

   - 访问：https://dash.cloudflare.com/
   - 登录你的账户

2. **找到 Workers 服务**

   - 在左侧菜单选择 "Workers & Pages"
   - 找到你的 Worker 项目

3. **查看 Worker URL**

   - 点击你的 Worker 项目
   - 在 "Triggers" 或 "Settings" 页面可以看到 Worker 的 URL
   - 格式通常是：`https://your-worker-name.your-subdomain.workers.dev`
   - 或者如果你配置了自定义域名：`https://api.miraclewhite.top`

4. **在 Admin 页面配置**
   - 将 "API Service Address" 设置为完整的 Worker URL
   - 例如：`https://your-worker-name.your-subdomain.workers.dev`

### 情况 2：API 部署在同一个域名下（最简单）

如果你的 API 通过 Nginx 或其他方式部署在 `miraclewhite.top` 域名下：

1. **在 Admin 页面配置**

   - 将 "API Service Address" **留空**
   - 系统会自动使用相对路径（如 `/api/scan`）

2. **确保 Nginx 配置正确**
   - API 路径应该能够访问：`https://miraclewhite.top/api/scan`
   - API 路径应该能够访问：`https://miraclewhite.top/api/code/[id]`

### 情况 3：测试 API 是否可用

你可以通过以下方式测试 API 是否可用：

1. **测试扫描 API**：

   ```bash
   curl -X POST https://your-api-url/api/scan \
     -H "Content-Type: application/json" \
     -d '{"codeId":"TEST123","deviceId":"test-device"}'
   ```

2. **测试代码配置 API**：

   ```bash
   curl https://your-api-url/api/code/TEST123
   ```

3. **在浏览器中测试**：
   - 打开浏览器开发者工具（F12）
   - 在 Console 中输入：
   ```javascript
   fetch("/api/scan", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ codeId: "TEST123", deviceId: "test-device" }),
   })
     .then((r) => r.json())
     .then(console.log);
   ```

### 推荐配置

**如果你的 API 部署在 `miraclewhite.top` 域名下：**

- 在 Admin 页面的 "API Service Address" 字段**留空**
- 这样生成的二维码会使用相对路径，自动适配当前域名

**如果你的 API 部署在 Cloudflare Workers：**

- 填写完整的 Worker URL
- 例如：`https://your-worker.your-subdomain.workers.dev`

### 注意事项

⚠️ **不要使用 `localhost` 地址**：

- `http://localhost:8080` 只能在本地开发时使用
- 从域名访问时无法访问 localhost，会导致 API 调用失败

✅ **推荐做法**：

- 如果 API 和网站部署在同一个域名，留空 API 地址字段
- 如果 API 部署在不同的服务，填写完整的 API 地址
