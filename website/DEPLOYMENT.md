# Website 部署指南

## 静态站点生成

项目已配置为静态站点导出模式。运行以下命令生成静态文件：

```bash
npm run build
```

生成的静态文件会输出到 `out` 目录。

## 部署方案

### 1. GitHub Pages (推荐)

#### 自动部署
已配置 GitHub Actions 工作流 (`.github/workflows/deploy-website.yml`)，会在推送到 main/master 分支时自动部署。

**启用步骤：**
1. 进入仓库的 Settings > Pages
2. 在 "Source" 下选择 "GitHub Actions"
3. 推送代码到 main/master 分支即可自动部署
4. 访问地址：`https://kernelsu-modules-repo.github.io/developers/`

#### 手动部署
```bash
npm run build
npx gh-pages -d out
```

### 2. Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

**部署步骤：**
1. 访问 [vercel.com](https://vercel.com)
2. 导入 GitHub 仓库
3. Root Directory 设置为 `website`
4. 点击 Deploy

### 3. Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

**部署步骤：**
1. 访问 [netlify.com](https://www.netlify.com)
2. 导入 GitHub 仓库
3. Build settings:
   - Base directory: `website`
   - Build command: `npm run build`
   - Publish directory: `website/out`
4. 点击 Deploy

### 4. Cloudflare Pages

**部署步骤：**
1. 访问 [pages.cloudflare.com](https://pages.cloudflare.com)
2. 连接 GitHub 仓库
3. Build settings:
   - Framework preset: Next.js
   - Root directory: `website`
   - Build command: `npm run build`
   - Build output directory: `out`
4. 点击 Deploy

### 5. 自托管服务器

#### 使用 Nginx

```bash
# 构建静态文件
npm run build

# 复制到服务器
scp -r out/* user@your-server:/var/www/html/

# Nginx 配置示例
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 缓存静态资源
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### 使用 Docker

```dockerfile
FROM nginx:alpine
COPY out /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -t kernelsu-keyring .
docker run -d -p 80:80 kernelsu-keyring
```

### 6. 简单 HTTP 服务器 (本地测试)

```bash
# 使用 Python
cd out && python3 -m http.server 8000

# 使用 npx
npx serve out

# 使用 PHP
cd out && php -S localhost:8000
```

访问 http://localhost:8000

## 构建配置

静态导出已在 `next.config.ts` 中配置：

```typescript
const nextConfig: NextConfig = {
  output: 'export',
  // ... 其他配置
};
```

## 注意事项

1. **静态导出限制：**
   - 不支持 API Routes
   - 不支持服务端渲染 (SSR)
   - 不支持图片优化 (需要使用外部服务)
   - 不支持 ISR (Incremental Static Regeneration)

2. **客户端应用：**
   - 本项目是纯客户端应用，所有 PGP 操作在浏览器中完成
   - 无需后端服务器
   - 适合静态托管

3. **基础路径：**
   如果部署在子路径下（如 GitHub Pages 的 `/developers/`），需要在 `next.config.ts` 中添加：
   ```typescript
   basePath: '/developers'
   ```

## 验证部署

部署后访问网站，检查：
- [ ] 页面正常加载
- [ ] 可以生成 PGP 密钥对
- [ ] 可以查询密钥
- [ ] 可以提交到 GitHub Issues
- [ ] 语言切换功能正常
