# KernelSU 模块签名与信任体系设计文档

## 1. 设计目标

为 KernelSU 模块生态建立一套**去中心化、可验证、可追溯**的 X.509 PKI 签名机制，在保证安全性的同时降低开发者准入成本，支持开放协作开发。

### 目标

1. **验证来源**：所有模块签名可追溯到可信 Root CA
2. **多方背书**：Middle CA 可签发模块开发者证书
3. **多签支持**：模块可由多个开发者共同签署
4. **开放协作**：无需集中审批，开发者自行签名发布
5. **安全管理**：支持吊销（CRL）、过期、轮换、更新

## 2. 信任模型概述

体系采用 **X.509 三级 CA 架构**：

```
              ┌────────────────────┐
              │     Root CA        │
              │(KernelSU Authority)│
              │   (离线/最高权威)   │
              └─────────┬──────────┘
                        │ 签发
              ┌─────────────────────┐
              │    Middle CA        │
              │(日常签发用)          │
              │(核心开发者管理)       │
              └──────────┬──────────┘
                         │ 签发
        ┌────────────────┴────────────────┐
        │                                 │
┌──────────────────┐           ┌──────────────────┐
│ Module Dev Cert A│           │ Module Dev Cert B│
│(模块开发者证书)    │           │(模块开发者证书)    │
└──────────┬───────┘           └────────┬─────────┘
           │                            │
           └──────────┬─────────────────┘
                      │ 签名
                ┌───────────────┐
                │   Module ZIP  │
                │(含 MANIFEST)  │
                └───────────────┘
```

- Root CA 签发 Middle CA 证书（离线操作）
- Middle CA 签发模块开发者证书（日常操作）
- 模块开发者使用私钥签名模块
- 验证链：`Root CA → Middle CA → Module Dev Cert → Module Signature`

## 3. 核心角色与职责

| 角色 | 职责 | 私钥用途 |
|------|------|----------|
| Root CA | 系统根锚；签发 Middle CA | 仅离线签发 Middle CA 证书 |
| Middle CA | 签发模块开发者证书 | 对 CSR 签发证书（存于 GitHub Secrets）|
| 模块开发者 (Module Dev) | 开发与签名模块 | 对模块包签名 |
| 验证端 (KernelSU 安装器) | 验证模块签名 | 不签名，只校验证书链 |

## 4. 证书规格

### 4.1 Root CA 证书

```
Subject: CN=KernelSU Root CA P-384, O=KernelSU
Basic Constraints: CA=TRUE, pathlen=1
Key Usage: Certificate Sign, CRL Sign
Validity: 20 年
Algorithm: ECC P-384
Serial: 1ccf5499549df2fae635606007b04dea8e7fa854
Valid From: 2025-11-24 13:36:08 UTC
Valid To: 2045-11-19 13:36:08 UTC
```

### 4.2 Middle CA 证书 (Signer)

```
Subject: CN=KernelSU Signer P-384, O=KernelSU
Issuer: CN=KernelSU Root CA P-384, O=KernelSU
Basic Constraints: CA=TRUE, pathlen=0
Key Usage: Certificate Sign, CRL Sign
Validity: 10 年
Algorithm: ECC P-384
Serial: 69190e1dbb7d5c67e6efa11f4ec044f429eb0246
Valid From: 2025-11-24 13:36:29 UTC
Valid To: 2035-11-22 13:36:29 UTC
```

### 4.3 模块开发者证书

```
Subject: CN={GitHub用户名}, O=KernelSU Module Developers
Issuer: CN=KernelSU Module CA, O=KernelSU
Basic Constraints: CA=FALSE
Key Usage: Digital Signature
Extended Key Usage: Code Signing
Validity: 1 年
Algorithm: RSA 2048
```

## 5. 签名与认证流程

### 5.1 开发者申请证书

```bash
# 1. 生成私钥（本地）
openssl genpkey -algorithm RSA -out developer.key.pem -pkeyopt rsa_keygen_bits:2048

# 2. 生成 CSR（本地）
openssl req -new -key developer.key.pem -out developer.csr.pem \
  -subj "/CN=username/O=KernelSU Module Developers/emailAddress=user@example.com"

# 3. 提交 CSR 到 GitHub Issue
# （通过 https://kernelsu-modules-repo.github.io/developers/ 网站）

# 4. 核心开发者审核后添加 'approved' 标签

# 5. GitHub Actions 自动使用 Middle CA 签发证书并回复到 Issue

# 6. 开发者保存签发的证书
```

### 5.2 模块开发者签名模块

```bash
# 1. 生成模块文件清单
find . -type f ! -path './META-INF/*' -print0 | \
  sort -z | xargs -0 sha256sum > META-INF/ksu/MANIFEST

# 2. 对清单签名（使用 OpenSSL）
openssl dgst -sha256 -sign developer.key.pem \
  -out META-INF/ksu/MANIFEST.sig META-INF/ksu/MANIFEST

# 或使用分离式签名（Base64 编码）
openssl dgst -sha256 -sign developer.key.pem META-INF/ksu/MANIFEST | \
  base64 > META-INF/ksu/MANIFEST.sig
```

生成：

```
META-INF/ksu/MANIFEST
META-INF/ksu/MANIFEST.sig
META-INF/ksu/CERT           # 开发者证书
META-INF/ksu/CHAIN.pem      # 证书链（Middle + Root）
```

支持多个开发者签名：

```
META-INF/ksu/SIGS/
├── devA.sig
├── devA.cert.pem
├── devB.sig
└── devB.cert.pem
```

### 5.3 模块验证流程

验证端（安装器）执行：

1. 导入本地 keyring：

```
/data/adb/ksu/keyring/
├── root_ca.cert.pem         # Root CA 证书
├── middle_ca.cert.pem       # Middle CA 证书
├── chain.pem                # 证书链（Middle + Root）
├── developers/              # 开发者证书目录
│   └── *.cert.pem
├── crl.pem                  # 证书吊销列表
└── version                  # keyring 版本号
```

2. 加载 Root CA 证书作为信任锚
3. 对每个签名文件验证：
   - (a) 加载开发者证书
   - (b) 验证证书链：Root CA → Middle CA → Dev Cert
   - (c) 检查证书有效期
   - (d) 检查 CRL（证书吊销列表）
   - (e) 使用证书公钥验证签名
4. 至少 M 个签名有效 → 通过
5. 校验 MANIFEST 中所有文件哈希
6. 安装模块

Rust 实现可基于 `rustls` + `x509-parser` 或 `openssl` crate。

## 6. Keyring 文件结构

```
/data/adb/ksu/keyring/
├── root_ca.cert.pem         # Root CA 证书（PEM 格式）
├── middle_ca.cert.pem       # Middle CA 证书（PEM 格式）
├── chain.pem                # 完整证书链
├── developers/              # 模块开发者证书目录
│   ├── user1.cert.pem
│   ├── user2.cert.pem
│   └── ...
├── crl.pem                  # 证书吊销列表（CRL）
└── version                  # keyring 版本号
```

### CRL 格式示例

```pem
-----BEGIN X509 CRL-----
MIIBpzCBkAIBATANBgkqhkiG9w0BAQsFADBF...
-----END X509 CRL-----
```

CRL 由 Middle CA 签发，包含被吊销证书的序列号和吊销原因。

## 7. 多签规则

- 模块包可有多个签名文件
- 策略字段可定义在 module.prop 中：

```properties
verify_threshold=2
```

- 安装器需验证至少 M 个不同开发者签名通过
- 适合需要多方审核的高权限模块

## 8. 吊销与轮换

| 场景 | 处理方式 |
|------|----------|
| 开发者私钥泄露 | 将证书序列号加入 CRL，重新签发新证书 |
| 开发者停权 | 将证书序列号加入 CRL |
| Middle CA 更换 | Root CA 签发新 Middle CA，旧证书过渡期共存 |
| Root CA 更换 | 新旧根证书共存过渡，最终迁移至新根 |

CRL 可通过 OTA 或 Git 仓库快速更新。

## 9. Keyring 分发机制

### 9.1 官方仓库结构

```
ksu-keyring/
├── root_ca.cert.pem
├── middle_ca.cert.pem
├── chain.pem
├── developers/
│   └── *.cert.pem
├── crl.pem
├── version
└── SHA256SUMS.sig
```

### 9.2 更新流程

1. 核心团队更新 keyring（添加新证书、更新 CRL）
2. 打包并签名：

```bash
# 打包
tar czf ksu-keyring-vX.Y.tar.gz *.pem developers/ crl.pem version

# 使用 Root CA 私钥签名
openssl dgst -sha256 -sign root_ca.key.pem \
  -out ksu-keyring-vX.Y.tar.gz.sig ksu-keyring-vX.Y.tar.gz
```

3. 发布到官方仓库或 OTA
4. 安装器验证 Root CA 签名 → 更新本地 keyring

## 10. 安全策略与权限建议

| 文件 | 权限 | 说明 |
|------|------|------|
| /data/adb/ksu/keyring/* | 0400 / 0444 | 只读 |
| /data/adb/ksu/keyring/crl.pem | 0644 | 可自动更新 |
| Root CA 私钥 | 离线保存 | 永不上传设备/云端 |
| Middle CA 私钥 | GitHub Secrets | 仅 Actions 使用 |
| 模块开发者私钥 | 本地保存 | 用于签模块 |

## 11. 优势总结

- ✅ 标准 X.509 PKI 架构，工具链成熟
- ✅ 三级 CA 架构，Root CA 可离线保护
- ✅ 模块可多签，灵活审批
- ✅ 可追溯至单一 Root CA
- ✅ CRL 支持快速吊销
- ✅ 可 OTA 更新、可轮换
- ✅ Rust/OpenSSL 实现简单高效

## 12. Rust 实现参考

```toml
[dependencies]
rustls = "0.23"
x509-parser = "0.16"
openssl = "0.10"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

伪代码示例：

```rust
use openssl::x509::{X509, X509StoreContext};
use openssl::stack::Stack;

// 加载信任锚
let root_ca = X509::from_pem(&fs::read("keyring/root_ca.cert.pem")?)?;
let middle_ca = X509::from_pem(&fs::read("keyring/middle_ca.cert.pem")?)?;

// 加载开发者证书
let dev_cert = X509::from_pem(&fs::read("META-INF/ksu/CERT")?)?;

// 构建证书链
let mut chain = Stack::new()?;
chain.push(middle_ca)?;

// 创建验证上下文
let mut store_ctx = X509StoreContext::new()?;
store_ctx.init(&store, &dev_cert, &chain, |ctx| {
    ctx.verify_cert()
})?;

// 验证签名
let manifest = fs::read("META-INF/ksu/MANIFEST")?;
let signature = fs::read("META-INF/ksu/MANIFEST.sig")?;

let public_key = dev_cert.public_key()?;
let mut verifier = Verifier::new(MessageDigest::sha256(), &public_key)?;
verifier.update(&manifest)?;
let valid = verifier.verify(&signature)?;

if !valid {
    bail!("Module signature verification failed");
}
```

## 13. 未来扩展方向

- ✅ OCSP (Online Certificate Status Protocol) 在线吊销查询
- ✅ 支持 ECDSA 签名（更小签名体积）
- ✅ Keyring 增量更新（diff-based）
- ✅ 集成 fs-verity 验证模块完整性
- ✅ Web 注册中心：自动化证书申请与签发流程

## 14. 与 PGP 方案对比

| 特性 | X.509 PKI | OpenPGP |
|------|-----------|---------|
| 标准化 | ✅ 国际标准（RFC 5280） | ✅ 开放标准（RFC 4880） |
| 工具支持 | ✅ OpenSSL/BoringSSL 等 | ⚠️ GnuPG/Sequoia |
| 移动端支持 | ✅ 原生支持 | ⚠️ 需额外库 |
| 证书链验证 | ✅ 严格层级 | ⚠️ Web-of-Trust 复杂 |
| 吊销机制 | ✅ CRL/OCSP | ⚠️ 吊销证书分发 |
| 学习曲线 | ✅ 较平缓 | ⚠️ 较陡峭 |

## 总结

本机制采用标准 X.509 三级 CA 架构，Root CA 离线保护，Middle CA 日常签发开发者证书。开发者使用私钥签名模块，验证端通过标准 PKI 证书链验证签名有效性。支持 CRL 快速吊销、多人签名、阈值策略，是 KernelSU 模块生态开放协作的安全基础。
