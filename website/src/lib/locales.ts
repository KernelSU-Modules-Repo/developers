// lib/locales.ts
export const locales = {
  en: {
    title: "KernelSU Keyring",
    subtitle: "Developer Identity Management System (X.509 PKI)",
    tabs: { generate: "Generate", submit: "Submit", query: "Query", revoke: "Revoke" },
    gen: {
      title: "Generate Key Pair",
      desc: "Create a private key and public key locally for certificate issuance.",
      curve: "Curve Type",
      btn: "Generate Key Pair",
      success: "Private key and public key generated successfully!",
      download_priv: "Download Private Key",
      download_pub: "Download Public Key",
      fingerprint_label: "Public Key Fingerprint (SHA-256)",
      priv_warn: "Private Key (SECRET - SAVE NOW)",
      pub_label: "Public Key",
    },
    sub: {
      title: "Submit Public Key",
      desc: "Submit your public key to get a signed certificate from Middle CA.",
      gh: "GitHub Username",
      pub: "Public Key",
      btn: "Create GitHub Issue",
      warn: "Security: Never submit your private key, only the public key.",
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
      serial_label: "Certificate Serial Number",
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
      title: "生成密钥对",
      desc: "在本地生成私钥和公钥以申请证书签发。",
      curve: "曲线类型",
      btn: "生成密钥对",
      success: "私钥和公钥生成成功！",
      download_priv: "下载私钥 (.key.pem)",
      download_pub: "下载公钥 (.pub.pem)",
      fingerprint_label: "公钥指纹 (SHA-256)",
      priv_warn: "私钥 (绝密 - 立即保存)",
      pub_label: "公钥",
    },
    sub: {
      title: "提交公钥",
      desc: "提交您的公钥以获取 Middle CA 签发的证书。",
      gh: "GitHub 用户名",
      pub: "公钥",
      btn: "创建 GitHub Issue",
      warn: "安全提示：永远不要提交您的私钥，仅提交公钥。",
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
      serial_label: "证书序列号",
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
