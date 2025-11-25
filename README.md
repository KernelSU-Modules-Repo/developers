# KernelSU Developers Keyring Management

基于 X.509 PKI 的开发者身份认证系统，采用三级 CA 架构和自动审核机制。

## 📁 文件结构

```
developers/
├── index.js            # 主入口文件，处理 GitHub Actions 事件
├── keyring.js          # X.509 证书签发核心逻辑
├── rank.js             # GitHub 开发者评分算法（自动审核）
├── github-utils.js     # GitHub API 封装工具函数
├── utils.js            # 通用工具函数
├── module_integrity.md # X.509 PKI 设计文档
├── AUTO_REVIEW.md      # 自动审核机制详细说明
└── website/            # 开发者门户网站（Next.js）
    ├── src/
    │   ├── components/keyring-app.tsx  # 证书管理 UI
    │   └── lib/locales.ts              # 国际化（中英双语）
    └── package.json
```

## 📋 文件说明

### index.js
- **职责**: GitHub Actions 主入口
- **功能**:
  - 监听 issue 的 `labeled` 和 `opened` 事件
  - 处理 spam 标记和关闭
  - 调用 keyring 处理流程

### keyring.js
- **职责**: X.509 证书签发和管理
- **功能**:
  - 从环境变量加载 Middle CA 证书链和私钥
  - 从公钥签发开发者证书
  - 从 issue 中提取公钥
  - 自动评估开发者(所有提交自动通过)
  - 返回完整证书链(开发者证书 + Middle CA + Root CA)
  - 处理完整的 keyring issue 流程

### rank.js ⭐
- **职责**: GitHub 开发者评分系统
- **功能**:
  - 基于 GitHub Readme Stats 算法计算开发者等级
  - 从 GitHub API 获取用户统计数据
  - 生成详细的评估报告(包含rank信息)
  - Rank信息仅作展示用途,不影响审核结果

### github-utils.js
- **职责**: GitHub API 封装
- **功能**:
  - Issue 操作（获取、关闭、锁定）
  - Label 操作（设置、添加、移除）
  - Comment 操作（创建评论）
  - 组织操作（屏蔽用户）

### utils.js
- **职责**: 通用工具函数
- **功能**:
  - 识别和解析 issue 标题标签

## 🔐 PKI 架构

### 三级 CA 信任链

```
Root CA (离线保存，20年有效期)
    ↓ 签发
Middle CA / Signer (GitHub Secrets，10年有效期)
    ↓ 签发
开发者证书 (1年有效期，Code Signing)
    ↓ 签名
模块 ZIP
```

### 证书规格

| 证书类型 | Subject | 算法 | 有效期 | 用途 |
|---------|---------|------|--------|------|
| **Root CA** | CN=KernelSU Root CA P-384 | ECC P-384 | 20年 | 签发 Middle CA |
| **Middle CA** | CN=KernelSU Signer P-384 | ECC P-384 | 10年 | 签发开发者证书 |
| **开发者证书** | CN={GitHub用户名} | RSA 2048 | 1年 | 代码签名 |

## 🤖 自动审核机制

### 评分标准

系统基于开发者的 GitHub 活动数据自动计算评分：

| 指标 | 权重 | MEDIAN 值 |
|------|------|-----------|
| ⭐ **Stars** | **4** | 50 |
| 🔀 **Pull Requests** | 3 | 50 |
| 💻 **Commits** | 2 | 250 |
| 🐛 **Issues** | 1 | 25 |
| 👀 **Code Reviews** | 1 | 2 |
| 👥 **Followers** | 1 | 10 |

### 审核规则

| 操作 | 说明 |
|------|------|
| 🟢 **自动通过** | 所有提交均自动批准并签发证书 |

> 📝 **Rank信息**: 系统会自动计算并附加开发者的GitHub等级(S-C)和百分位信息，但**不影响审核结果**。所有开发者都会自动获得证书。

## 🔑 环境变量

### GitHub Secrets 配置

- `MIDDLE_CA_CERT` - Middle CA 证书链（PEM 格式，必需）
  - **包含**: Middle CA 证书 + Root CA 证书
  - 用于构建完整的证书链
- `MIDDLE_CA_KEY` - Middle CA 私钥（PEM 格式，必需）
- `GITHUB_TOKEN` - GitHub API 令牌（自动提供）

> ⚠️ **安全提示**: Root CA 私钥应离线保存，永不上传到云端
>
> 📝 **证书链格式**: `MIDDLE_CA_CERT` 应包含完整的证书链，签发时会将开发者证书附加在链首

## 🏷️ 支持的 Issue 标签

- `[keyring]` - 开发者证书申请（提交公钥）
- `[revoke]` - 证书吊销请求
- `[appeal]` - 申诉
- `[issue]` - 问题反馈
- `[suggestion]` - 建议

## 🔄 完整工作流程

### 1️⃣ 开发者申请证书

1. 访问 [Developer Portal](https://developers.kernelsu.org)
2. 在 "Generate Key" 标签页生成私钥和公钥
3. 下载 `username.key.pem`（私钥，保密）和 `username.pub.pem`（公钥）
4. 创建 `[keyring] username` issue，粘贴公钥内容

### 2️⃣ 自动评估与批准

系统自动：
1. 从 GitHub API 获取用户统计数据
2. 计算开发者等级（S - C）和百分位
3. 发布详细评估报告（包含rank信息）
4. **自动添加 `approved` 标签**（所有提交均通过）

> 💡 如果无法获取GitHub统计数据（私有账户、API限制等），系统仍会自动通过并说明情况。

### 3️⃣ 证书签发（自动触发）

1. GitHub Actions 检测到 `approved` 标签
2. 使用 Middle CA 签发开发者证书
3. 在 issue 评论中返回**完整证书链**（包含开发者证书、Middle CA证书和Root CA证书）
4. 自动关闭 issue

## 📊 评估报告示例

```markdown
## Developer Evaluation Report

**User**: @username (Real Name)
**Account Created**: 2020-01-15

### GitHub Statistics

| Metric | Value | Weight | Median |
|--------|-------|--------|--------|
| 💻 Commits | 520 | 2 | 250 |
| 🔀 Pull Requests | 85 | 3 | 50 |
| 🐛 Issues | 42 | 1 | 25 |
| 👀 Code Reviews | 15 | 1 | 2 |
| ⭐ Stars | 320 | 4 | 50 |
| 👥 Followers | 28 | 1 | 10 |

### Ranking Result

- **Level**: `A`
- **Percentile**: `18.5%` (Top 18.5%)
- **Score**: `9.76/12`

### Decision

**Action**: `auto_approve`
**Reason**: Top 18.5% developer (Rank: A)

---

✅ **Certificate Request Auto-Approved**

Your developer certificate request has been automatically approved.

**Your GitHub Profile Rank**: A (Top 18.5%)

**Important reminders:**
- ⚠️ Never share your private key (`.key.pem` file) with anyone
- ✅ Only the public key (`.pub.pem` file) should be submitted in this issue
- 📝 Make sure your public key is properly formatted between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` markers

Your certificate will be issued automatically. Please wait a moment...
```

> 📝 **注意**: 无论rank等级如何，所有提交都会自动通过。rank信息仅作为参考附加到评论中。

## 🛡️ 安全特性

### Rank评分系统

虽然所有申请都自动通过，但系统仍会计算并展示开发者rank信息：

- ✅ **Stars 权重最高（33.3%）**: 反映项目影响力
- ✅ **多维度评估**: 综合 6 项 GitHub 活动指标
- ✅ **统计学方法**: 使用概率分布归一化，科学公平
- 📊 **透明展示**: Rank信息附加在证书申请中，便于社区了解开发者背景

### 证书吊销

使用 CRL（证书吊销列表）机制：

```
keyring/
├── crl.pem  # 证书吊销列表（Middle CA 签发）
```

## 🌐 开发者门户

访问 [https://developers.kernelsu.org](https://developers.kernelsu.org) 进行：

- 🔑 生成私钥和公钥
- 📤 提交公钥到 GitHub Issue
- 🔍 查询证书状态
- 🚫 申请吊销证书

支持中英双语界面。

## 📚 相关文档

- [X.509 PKI 设计文档](module_integrity.md) - 完整的三级 CA 架构设计
- [自动审核机制详解](AUTO_REVIEW.md) - 评分算法和规则说明
- [GitHub Readme Stats](https://github.com/anuraghazra/github-readme-stats) - 评分算法来源

## 🔧 技术栈

### 后端（GitHub Actions）
- Node.js
- `node-forge` - X.509 证书生成和签名
- `@octokit/rest` - GitHub API 交互
- `@actions/github` - GitHub Actions 工具包

### 前端（开发者门户）
- Next.js 16 (React 19)
- TypeScript
- `node-forge` - 浏览器端证书操作
- Tailwind CSS
- Shadcn UI
