// lib/locales.ts
export const locales = {
  en: {
    title: "KernelSU Keyring",
    subtitle: "Developer Identity Management System",
    tabs: { generate: "Generate", submit: "Submit", query: "Query", revoke: "Revoke" },
    gen: {
      title: "Generate Key Pair",
      desc: "Create a high-security ECC (Ed25519) key pair locally.",
      name: "Full Name",
      email: "Email Address",
      btn: "Generate Key Pair",
      success: "Key pair generated successfully!",
      download_priv: "Download Private Key",
      download_pub: "Download Public Key",
      fingerprint_label: "Key Fingerprint (Unique ID)",
      priv_warn: "Private Key (SECRET - SAVE NOW)",
      pub_label: "Public Key (Share this)",
    },
    sub: {
      title: "Submit Public Key",
      desc: "Submit your public key to the official developer keyring.",
      gh: "GitHub Username",
      pub: "PGP Public Key Block",
      btn: "Create GitHub Issue",
      warn: "Security: Never submit your private key.",
    },
    query: {
      title: "Query Keyring",
      desc: "Check if a key is trusted in the official keyring.",
      ph: "Key Fingerprint (ABCD...)",
      btn: "Search Keyring",
      found: "Key Found ✅",
      not_found: "Key not found in official keyring.",
      self: "Self-Signed",
      core: "Core Verified",
    },
    revoke: {
      title: "Revoke Key",
      desc: "Create a request to revoke a compromised or lost key.",
      reason: "Reason",
      reasons: {
        compromised: "Key Compromised (Leaked/Stolen)",
        lost: "Key Lost (Inaccessible)",
        superseded: "Key Superseded (Rotated)"
      },
      details: "Additional Details",
      btn: "Create Revocation Request",
    },
    common: {
      copy: "Copy",
      copied: "Copied!",
      loading: "Processing...",
      download: "Download",
      import_file: "Import Key File",
      import_desc: "Support .asc, .gpg, or .txt files",
      import_success: "Key imported successfully",
      import_error: "Failed to read key file"
    }
  },
  zh: {
    title: "KernelSU 密钥库",
    subtitle: "开发者身份认证管理系统",
    tabs: { generate: "生成", submit: "提交", query: "查询", revoke: "吊销" },
    gen: {
      title: "生成密钥对",
      desc: "在本地生成高强度的 ECC (Ed25519) 密钥对。",
      name: "全名",
      email: "电子邮箱",
      btn: "生成密钥对",
      success: "密钥对生成成功！",
      download_priv: "下载私钥 (.asc)",
      download_pub: "下载公钥 (.asc)",
      fingerprint_label: "密钥指纹 (唯一标识)",
      priv_warn: "私钥 (绝密 - 立即保存)",
      pub_label: "公钥 (用于公开分享)",
    },
    sub: {
      title: "提交公钥",
      desc: "将您的公钥提交到官方开发者密钥库。",
      gh: "GitHub 用户名",
      pub: "PGP 公钥块",
      btn: "创建 GitHub Issue",
      warn: "安全提示：永远不要提交您的私钥。",
    },
    query: {
      title: "查询状态",
      desc: "检查密钥是否已被官方密钥库收录信任。",
      ph: "密钥指纹 (ABCD...)",
      btn: "查询密钥库",
      found: "已找到 ✅",
      not_found: "未在官方库中找到此密钥。",
      self: "自签名",
      core: "核心认证",
    },
    revoke: {
      title: "吊销密钥",
      desc: "创建请求以吊销泄露或丢失的密钥。",
      reason: "吊销原因",
      reasons: {
        compromised: "密钥泄露 (被盗/公开)",
        lost: "密钥丢失 (无法访问)",
        superseded: "密钥轮换 (更替旧密钥)"
      },
      details: "详细说明",
      btn: "创建吊销请求",
    },
    common: {
      copy: "复制",
      copied: "已复制!",
      loading: "处理中...",
      download: "下载",
      import_file: "从文件导入密钥",
      import_desc: "支持 .asc, .gpg 或 .txt 文件",
      import_success: "密钥导入成功",
      import_error: "无法读取密钥文件"
    }
  }
};

export type LocaleKey = keyof typeof locales;