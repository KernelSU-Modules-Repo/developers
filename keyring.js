const core = require('@actions/core')
const { context } = require('@actions/github')
const crypto = require('crypto')
const x509 = require('@peculiar/x509')
const { getRepo, createComment, removeLabel, closeIssue, addLabel, setLabel } = require('./github-utils')
const { fetchUserStats, evaluateUser, generateReport } = require('./rank')
const { checkExistingCertificate } = require('./cert-manager')
const { updateAndCommitCRL } = require('./crl-utils')

// Set crypto provider for @peculiar/x509
x509.cryptoProvider.set(crypto.webcrypto)

/**
 * Load Middle CA certificate and private key from environment variables
 * Note: MIDDLE_CA_CERT should contain the full certificate chain (Middle CA + Root CA)
 * @returns {{cert: x509.X509Certificate, privateKey: CryptoKey}}
 */
async function loadMiddleCA () {
  const certPem = process.env.MIDDLE_CA_CERT
  const keyPem = process.env.MIDDLE_CA_KEY

  if (!certPem) {
    throw new Error('Middle CA certificate not found: MIDDLE_CA_CERT environment variable not set')
  }

  if (!keyPem) {
    throw new Error('Middle CA private key not found: MIDDLE_CA_KEY environment variable not set')
  }

  // Parse certificate
  const cert = new x509.X509Certificate(certPem)

  // Parse private key - convert Node.js KeyObject to CryptoKey
  const nodeKey = crypto.createPrivateKey(keyPem)
  const keyDer = nodeKey.export({ type: 'pkcs8', format: 'der' })

  // Determine algorithm based on key type
  const keyDetails = nodeKey.asymmetricKeyDetails
  const namedCurve = keyDetails.namedCurve
  const algorithm = {
    name: 'ECDSA',
    namedCurve: namedCurve === 'prime256v1' || namedCurve === 'secp256r1' ? 'P-256' : 'P-384'
  }

  const privateKey = await crypto.webcrypto.subtle.importKey(
    'pkcs8',
    keyDer,
    algorithm,
    true,
    ['sign']
  )

  return { cert, privateKey }
}

/**
 * Extract Public Key from issue body
 * @param {string} issueBody - Issue body content
 * @returns {string|null} Extracted Public Key PEM or null
 */
function extractPublicKeyFromIssue (issueBody) {
  const publicKeyBlockRegex = /-----BEGIN PUBLIC KEY-----([\s\S]*?)-----END PUBLIC KEY-----/
  const match = issueBody.match(publicKeyBlockRegex)

  if (match) {
    return match[0]
  }

  return null
}

/**
 * Generate a random serial number for certificate
 * @returns {string} Serial number as hex string
 */
function generateSerialNumber () {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * Calculate certificate fingerprint (SHA-256)
 * @param {x509.X509Certificate} cert - Certificate
 * @returns {string} Fingerprint in colon-separated hex format
 */
async function getCertificateFingerprint (cert) {
  const thumbprint = await cert.getThumbprint(crypto.webcrypto)
  const hex = Buffer.from(thumbprint).toString('hex')
  // Format as XX:XX:XX:XX...
  return hex.toUpperCase().match(/.{2}/g).join(':')
}

/**
 * Issue developer certificate from public key
 * @param {string} publicKeyPem - Public Key in PEM format
 * @param {string} username - Developer's GitHub username
 * @returns {Promise<{certPem: string, certChainPem: string, fingerprint: string, serialNumber: string}>}
 */
async function issueDeveloperCertificate (publicKeyPem, username) {
  const { cert: caCert, privateKey: caKey } = await loadMiddleCA()

  // Parse ECC public key (P-256/P-384 only)
  let publicKey
  let curveInfo

  try {
    // Parse public key using Node.js crypto
    publicKey = crypto.createPublicKey(publicKeyPem)

    // Get key details
    const keyDetails = publicKey.asymmetricKeyDetails
    if (!keyDetails) {
      throw new Error('Unable to extract key details')
    }

    // Verify it's an EC key
    if (publicKey.asymmetricKeyType !== 'ec') {
      throw new Error(
        `Unsupported key type (${publicKey.asymmetricKeyType}). Only ECC keys (P-256/P-384) are supported.`
      )
    }

    // Verify curve is P-256 or P-384
    const supportedCurves = {
      'prime256v1': 'P-256',
      'secp256r1': 'P-256',
      'secp384r1': 'P-384'
    }

    const namedCurve = keyDetails.namedCurve
    if (!supportedCurves[namedCurve]) {
      throw new Error(
        `Unsupported ECC curve (${namedCurve}). Only P-256 and P-384 curves are supported. ` +
        'Please generate a new key pair with P-256 or P-384 from the Developer Portal.'
      )
    }

    curveInfo = supportedCurves[namedCurve]
    console.log('ECC Curve:', curveInfo)
    console.log('Public key parsed successfully')

  } catch (error) {
    console.error('Failed to parse public key:', error.message)
    if (error.message.includes('Unsupported')) {
      throw error // Re-throw our custom errors
    }
    throw new Error(
      'Invalid public key format. Please ensure you are submitting a valid ECC public key (P-256 or P-384). ' +
      'Generate a proper key pair from the Developer Portal.'
    )
  }

  // Convert public key to CryptoKey
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' })
  const algorithm = {
    name: 'ECDSA',
    namedCurve: curveInfo
  }
  const cryptoPublicKey = await crypto.webcrypto.subtle.importKey(
    'spki',
    publicKeyDer,
    algorithm,
    true,
    ['verify']
  )

  // Determine hash algorithm: P-256 uses SHA-256, P-384 uses SHA-512
  const hashAlgorithm = curveInfo === 'P-256' ? 'SHA-256' : 'SHA-512'

  // Create certificate using @peculiar/x509
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: generateSerialNumber(),
    subject: `CN=${username}, O=KernelSU Module Developers`,
    issuer: caCert.subject,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    publicKey: cryptoPublicKey,
    signingKey: caKey,
    signingAlgorithm: {
      name: 'ECDSA',
      hash: hashAlgorithm
    },
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true), // cA: false, critical: true
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true), // critical: true
      new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.3']), // codeSigning
      await x509.SubjectKeyIdentifierExtension.create(cryptoPublicKey),
      await x509.AuthorityKeyIdentifierExtension.create(caCert)
    ]
  })

  const certPem = cert.toString('pem')
  const fingerprint = await getCertificateFingerprint(cert)
  const serialNumber = cert.serialNumber

  // Build certificate chain (ensure proper newline between certificates)
  const middleCaCertPem = process.env.MIDDLE_CA_CERT
  const certChainPem = certPem.trimEnd() + '\n' + middleCaCertPem + '\n'

  return {
    certPem,
    certChainPem,
    fingerprint,
    serialNumber
  }
}

/**
 * Automatically evaluate developer and take action
 */
async function autoEvaluateDeveloper (token, owner, repo, issueNumber, username) {
  try {
    console.log(`Auto-evaluating developer: ${username}`)

    // 获取用户统计数据
    const stats = await fetchUserStats(username, token)
    console.log('Stats fetched:', stats)

    // 评估用户
    const evaluation = evaluateUser(stats)
    console.log('Evaluation result:', evaluation)

    // 生成报告
    const report = generateReport(stats, evaluation)

    // 所有提交自动通过,只附加rank信息
    console.log('Creating approval comment with rank info...')
    await createComment(
      token,
      owner,
      repo,
      issueNumber,
      report + '\n\n---\n\n' +
      '✅ **Certificate Request Auto-Approved**\n\n' +
      `Your developer certificate request has been automatically approved.\n\n` +
      `**Your GitHub Profile Rank**: ${evaluation.rank.level} (Top ${evaluation.rank.percentile.toFixed(1)}%)\n\n` +
      '**Important reminders:**\n' +
      '- ⚠️ Never share your private key (`.key.pem` file) with anyone\n' +
      '- ✅ Only the public key (`.pub.pem` file) should be submitted in this issue\n' +
      '- 📝 Make sure your public key is properly formatted between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` markers\n\n' +
      'Your certificate will be issued automatically. Please wait a moment...'
    )
    console.log('Adding approved label...')
    await addLabel(token, owner, repo, issueNumber, 'approved')
    console.log(`Auto-approved: ${username} (Rank: ${evaluation.rank.level})`)
  } catch (error) {
    console.error('Error in auto-evaluation:', error)
    console.error('Error stack:', error.stack)
    // 如果评估失败，仍然自动通过但不显示rank信息
    console.log('Creating fallback approval comment...')
    await createComment(
      token,
      owner,
      repo,
      issueNumber,
      `Dear @${username},\n\n` +
      'Thank you for submitting your public key to the KernelSU Developer Keyring!\n\n' +
      '⚠️ **Unable to fetch your GitHub profile statistics.** This may be due to:\n' +
      '- Private profile settings\n' +
      '- API rate limits\n' +
      '- Network issues\n\n' +
      'Your request has been automatically approved without rank evaluation.\n\n' +
      '**Important reminders:**\n' +
      '- ⚠️ Never share your private key (`.key.pem` file) with anyone\n' +
      '- ✅ Only the public key (`.pub.pem` file) should be submitted in this issue\n' +
      '- 📝 Make sure your public key is properly formatted\n\n' +
      'Your certificate will be issued automatically. Please wait a moment...'
    )
    console.log('Adding approved label (fallback)...')
    await addLabel(token, owner, repo, issueNumber, 'approved')
    console.log(`Auto-approved (no rank): ${username}`)
  }
}

/**
 * Handle developer public key submission in Issue
 * Automatically issue certificate when core developer adds 'approved' label
 */
async function handleKeyringIssue () {
  try {
    const token = process.env.REPO_TOKEN
    const { owner, repo } = getRepo()

    const action = context.payload.action
    const issue = context.payload.issue
    if (!issue) {
      console.log('Not an issue event')
      return
    }

    const issueNumber = issue.number
    const issueTitle = issue.title
    const issueBody = issue.body || ''
    const username = issue.user.login

    // Check if this is a keyring issue
    if (!issueTitle.toLowerCase().includes('[keyring]')) {
      console.log('Not a keyring issue')
      return
    }

    // Handle newly opened keyring issues
    if (action === 'opened') {
      console.log('Handling opened keyring issue')

      // 检查用户是否已有有效证书
      console.log('Checking for existing certificates...')
      const existingCert = await checkExistingCertificate(username, token, owner, repo)

      if (existingCert.hasActiveCert) {
        console.log('User already has an active certificate, rejecting request')
        const cert = existingCert.certificate
        await createComment(
          token,
          owner,
          repo,
          issueNumber,
          `⚠️ **证书申请被拒绝 / Certificate Request Rejected**\n\n` +
          `@${username}，您已经拥有一个有效的开发者证书 / You already have an active developer certificate:\n\n` +
          `- **序列号 / Serial Number**: \`${cert.serialNumber}\`\n` +
          `- **指纹 / Fingerprint**: \`${cert.fingerprint || 'N/A'}\`\n` +
          `- **签发时间 / Issued**: ${new Date(cert.issuedAt).toLocaleDateString('zh-CN')}\n` +
          `- **过期时间 / Expires**: ${new Date(cert.expiresAt).toLocaleDateString('zh-CN')}\n` +
          `- **原始 Issue**: #${existingCert.issueNumber}\n\n` +
          `---\n\n` +
          `**策略 / Policy**: 每个开发者同一时间只能持有**一个**有效证书 / Each developer can only hold **ONE** active certificate at a time.\n\n` +
          `**选项 / Options**:\n` +
          `1. 等待当前证书过期后重新申请 / Wait for your current certificate to expire before reapplying\n` +
          `2. 如果需要更换证书，请先创建 \`[revoke]\` issue 吊销当前证书 / To replace your certificate, create a \`[revoke]\` issue first\n` +
          `3. 如果您丢失了私钥，请先创建 \`[revoke]\` issue，然后重新申请 / If you lost your private key, create a \`[revoke]\` issue first, then reapply\n\n` +
          `**安全提示 / Security Note**: 此策略可防止证书滥用和吊销绕过 / This policy prevents certificate abuse and revocation bypass.`
        )
        await setLabel(token, owner, repo, issueNumber, 'duplicate')
        await closeIssue(token, owner, repo, issueNumber, false)
        return
      }

      if (existingCert.error) {
        console.log('Certificate check had errors, but proceeding with issuance')
        await createComment(
          token,
          owner,
          repo,
          issueNumber,
          `⚠️ **注意 / Note**: 无法完全验证您的证书历史记录，但申请将继续处理。\n\n` +
          `Unable to fully verify your certificate history, but your application will proceed.\n\n` +
          `错误信息 / Error: ${existingCert.error}`
        )
      } else {
        console.log('No active certificate found, proceeding with evaluation')
      }

      await autoEvaluateDeveloper(token, owner, repo, issueNumber, username)
      return
    }

    // Handle labeled event (approval)
    if (action !== 'labeled') {
      console.log('Not a labeled or opened event, action:', action)
      return
    }

    console.log('Handling labeled event')
    const label = context.payload.label
    console.log('Label:', label ? label.name : 'null')

    if (!label || label.name !== 'approved') {
      console.log('Not an approved label, skipping certificate issuance')
      return
    }

    console.log('Approved label detected, proceeding with certificate issuance')
    const approver = context.payload.sender
    console.log('Approver:', approver.login)

    const publicKeyPem = extractPublicKeyFromIssue(issueBody)
    console.log('Public key extracted:', publicKeyPem ? 'Yes' : 'No')

    if (!publicKeyPem) {
      await createComment(
        token,
        owner,
        repo,
        issueNumber,
        '⚠️ Unable to extract valid public key from Issue.\n\n' +
        'Please ensure your Issue description contains a complete public key:\n' +
        '```\n' +
        '-----BEGIN PUBLIC KEY-----\n' +
        '...\n' +
        '-----END PUBLIC KEY-----\n' +
        '```\n\n' +
        '**How to generate a key pair:**\n' +
        '1. Visit our [Developer Portal](https://developers.kernelsu.org)\n' +
        '2. Use the "Generate Key" tab to create your private key and public key\n' +
        '3. Submit the public key (NOT the private key) in this issue'
      )
      await removeLabel(token, owner, repo, issueNumber, 'approved')
      return
    }

    let result
    try {
      result = await issueDeveloperCertificate(publicKeyPem, username)
    } catch (err) {
      await createComment(
        token,
        owner,
        repo,
        issueNumber,
        `❌ Failed to issue certificate: ${err.message}\n\n` +
        'Please check:\n' +
        '- Public key format is valid\n' +
        '- Middle CA certificate and private key are correctly configured in GitHub Secrets\n' +
        '- Required secrets: `MIDDLE_CA_CERT`, `MIDDLE_CA_KEY`'
      )
      await removeLabel(token, owner, repo, issueNumber, 'approved')
      return
    }

    await createComment(
      token,
      owner,
      repo,
      issueNumber,
      `✅ Certificate successfully issued!\n\n` +
      `- **User**: @${username}\n` +
      `- **Serial Number**: \`${result.serialNumber}\`\n` +
      `- **Fingerprint (SHA-256)**: \`${result.fingerprint}\`\n` +
      `- **Issued by**: @${approver.login} (Core Developer)\n` +
      `- **Valid for**: 1 year\n\n` +
      `## Developer Certificate (with full certificate chain)\n\n` +
      `Please save this certificate chain:\n\n` +
      `\`\`\`\n${result.certChainPem}\n\`\`\`\n\n` +
      `---\n\n` +
      `**What's included:**\n` +
      `- Your developer certificate\n` +
      `- Middle CA certificate\n` +
      `- Root CA certificate\n\n` +
      `**Next Steps**:\n` +
      `1. Download and save this certificate chain as \`${username}.cert.pem\`\n` +
      `2. Keep your private key (\`${username}.key.pem\`) secure - never share it!\n` +
      `3. Use your private key and certificate chain to sign KernelSU modules\n\n` +
      `**For Module Users**:\n` +
      `This certificate can be used to verify module signatures from @${username}.`
    )

    await closeIssue(token, owner, repo, issueNumber, true)

    // 更新 CRL 并提交到仓库（自动触发网站部署）
    await updateAndCommitCRL(token, owner, repo, `Certificate issued for @${username}`)
  } catch (error) {
    core.setFailed(error.message)
    console.error('Error handling keyring issue:', error)
  }
}

module.exports = {
  handleKeyringIssue,
  issueDeveloperCertificate,
  extractPublicKeyFromIssue,
  loadMiddleCA,
  getCertificateFingerprint,
  autoEvaluateDeveloper
}
