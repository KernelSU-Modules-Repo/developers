# KernelSU Keyring

开发者身份认证管理系统 (X.509 PKI)

## 项目简介

KernelSU Keyring 是一个基于 X.509 PKI 的开发者身份认证管理系统，提供密钥对生成、公钥提交、证书查询和证书吊销等功能。所有加密操作均在客户端完成，确保私钥安全。

## 主要功能

### 1. 生成密钥对
- 支持 P-256 (NIST P-256 / secp256r1) 和 P-384 (NIST P-384 / secp384r1) 椭圆曲线
- 使用 Web Crypto API 在客户端生成密钥对
- 自动下载私钥文件
- 生成公钥指纹 (SHA-256)
- 自动填充公钥到提交表单

### 2. 提交公钥
- 提交公钥到 GitHub Issue 申请证书签发
- 支持从文件导入公钥
- 安全提示：永远不要提交私钥

### 3. 查询证书
- 通过证书指纹查询官方密钥库中的证书
- 支持从证书文件导入并验证
- 显示证书详细信息（CN、序列号、签发者、有效期等）

### 4. 吊销证书
- 创建证书吊销请求
- 支持多种吊销原因（证书泄露、私钥丢失、证书更替）

## 技术栈

- **框架**: Next.js 15 (App Router)
- **UI 库**: React 19, Radix UI, Tailwind CSS
- **加密**: Web Crypto API, node-forge
- **表单**: React Hook Form, Zod
- **国际化**: 支持中英文双语

## 开发

### 前置要求

- [Bun](https://bun.sh/) >= 1.0

### 安装依赖

```bash
bun install
```

### 启动开发服务器

```bash
bun dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

### 构建生产版本

```bash
bun run build
```

## 项目结构

```
website/
├── public/              # 静态资源
│   ├── favicon.ico     # 网站图标
│   └── logo.svg        # KernelSU Logo
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── layout.tsx  # 根布局
│   │   └── page.tsx    # 首页
│   ├── components/     # React 组件
│   │   ├── ui/         # UI 组件库
│   │   └── keyring-app.tsx  # 主应用组件
│   └── lib/            # 工具库
│       ├── locales.ts  # 国际化文本
│       └── utils.ts    # 工具函数
└── README.md
```

## 安全特性

- ✅ 所有加密操作在客户端完成
- ✅ 私钥永不离开用户设备
- ✅ 使用 Web Crypto API 标准加密
- ✅ 公钥指纹用于身份验证
- ✅ 支持证书吊销机制

## 浏览器兼容性

需要支持以下特性的现代浏览器：
- Web Crypto API
- ES6+
- localStorage

推荐使用：
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 许可证

本项目遵循 KernelSU 项目的许可证。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关链接

- [KernelSU](https://github.com/tiann/KernelSU)
- [KernelSU Modules Repo](https://github.com/KernelSU-Modules-Repo)
