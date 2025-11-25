// lib/locales.ts
export const locales = {
  en: {
    title: "KernelSU Keyring",
    subtitle: "Developer Identity Management System (X.509 PKI)",
    tabs: { generate: "Generate", submit: "Submit", query: "Query", revoke: "Revoke" },
    gen: {
      title: "Generate Certificate Signing Request (CSR)",
      desc: "Create a private key and CSR locally for certificate issuance.",
      name: "Full Name",
      email: "Email Address",
      btn: "Generate Key & CSR",
      success: "Private key and CSR generated successfully!",
      download_priv: "Download Private Key",
      download_pub: "Download CSR",
      fingerprint_label: "Public Key Fingerprint (SHA-256)",
      priv_warn: "Private Key (SECRET - SAVE NOW)",
      pub_label: "Certificate Signing Request (CSR)",
    },
    sub: {
      title: "Submit CSR",
      desc: "Submit your CSR to get a signed certificate from Middle CA.",
      gh: "GitHub Username",
      pub: "Certificate Signing Request (CSR)",
      btn: "Create GitHub Issue",
      warn: "Security: Never submit your private key, only the CSR.",
    },
    query: {
      title: "Query Certificate",
      desc: "Verify a certificate from the official keyring.",
      ph: "Certificate Fingerprint (SHA-256)",
      btn: "Search Certificate",
      found: "Certificate Found ✅",
      not_found: "Certificate not found in official keyring.",
      self: "Self-Signed",
      core: "CA Verified",
    },
    revoke: {
      title: "Revoke Certificate",
      desc: "Create a request to revoke a compromised or lost certificate.",
      reason: "Reason",
      reasons: {
        compromised: "Certificate Compromised (Private key leaked)",
        lost: "Private Key Lost (Inaccessible)",
        superseded: "Certificate Superseded (Re-issued)"
      },
      details: "Additional Details",
      btn: "Create Revocation Request",
    },
    common: {
      copy: "Copy",
      copied: "Copied!",
      loading: "Processing...",
      download: "Download",
      import_file: "Import File",
      import_desc: "Support .pem, .csr, .cert, or .crt files",
      import_success: "File imported successfully",
      import_error: "Failed to read file"
    }
  },
  zh: {
    title: "KernelSU 密钥库",
    subtitle: "开发者身份认证管理系统 (X.509 PKI)",
    tabs: { generate: "生成", submit: "提交", query: "查询", revoke: "吊销" },
    gen: {
      title: "生成证书签名请求 (CSR)",
      desc: "在本地生成私钥和 CSR 以申请证书签发。",
      name: "全名",
      email: "电子邮箱",
      btn: "生成密钥与 CSR",
      success: "私钥和 CSR 生成成功！",
      download_priv: "下载私钥 (.key.pem)",
      download_pub: "下载 CSR (.csr.pem)",
      fingerprint_label: "公钥指纹 (SHA-256)",
      priv_warn: "私钥 (绝密 - 立即保存)",
      pub_label: "证书签名请求 (CSR)",
    },
    sub: {
      title: "提交 CSR",
      desc: "提交您的 CSR 以获取 Middle CA 签发的证书。",
      gh: "GitHub 用户名",
      pub: "证书签名请求 (CSR)",
      btn: "创建 GitHub Issue",
      warn: "安全提示：永远不要提交您的私钥，仅提交 CSR。",
    },
    query: {
      title: "查询证书",
      desc: "验证官方密钥库中的证书。",
      ph: "证书指纹 (SHA-256)",
      btn: "查询证书",
      found: "已找到证书 ✅",
      not_found: "未在官方库中找到此证书。",
      self: "自签名",
      core: "CA 认证",
    },
    revoke: {
      title: "吊销证书",
      desc: "创建请求以吊销泄露或丢失的证书。",
      reason: "吊销原因",
      reasons: {
        compromised: "证书泄露 (私钥被盗)",
        lost: "私钥丢失 (无法访问)",
        superseded: "证书更替 (重新签发)"
      },
      details: "详细说明",
      btn: "创建吊销请求",
    },
    common: {
      copy: "复制",
      copied: "已复制!",
      loading: "处理中...",
      download: "下载",
      import_file: "从文件导入",
      import_desc: "支持 .pem, .csr, .cert 或 .crt 文件",
      import_success: "文件导入成功",
      import_error: "无法读取文件"
    }
  }
};

export type LocaleKey = keyof typeof locales;
