const core = require('@actions/core')
const { context } = require('@actions/github')
const forge = require('node-forge')
const { getRepo, createComment, removeLabel, updateIssue, addLabel } = require('./github-utils')
const { fetchUserStats, evaluateUser, generateReport } = require('./rank')

/**
 * Load Middle CA certificate and private key from environment variables
 * Note: MIDDLE_CA_CERT should contain the full certificate chain (Middle CA + Root CA)
 * @returns {Promise<{cert: forge.pki.Certificate, privateKey: forge.pki.PrivateKey}>}
 */
function loadMiddleCA () {
  const certPem = process.env.MIDDLE_CA_CERT
  const keyPem = process.env.MIDDLE_CA_KEY

  if (!certPem) {
    throw new Error('Middle CA certificate not found: MIDDLE_CA_CERT environment variable not set')
  }

  if (!keyPem) {
    throw new Error('Middle CA private key not found: MIDDLE_CA_KEY environment variable not set')
  }

  const cert = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

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
 * @returns {string} Hex string serial number
 */
function generateSerialNumber () {
  const bytes = forge.random.getBytesSync(16)
  return forge.util.bytesToHex(bytes)
}

/**
 * Calculate certificate fingerprint (SHA-256)
 * @param {forge.pki.Certificate} cert - Certificate
 * @returns {string} Fingerprint in colon-separated hex format
 */
function getCertificateFingerprint (cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const md = forge.md.sha256.create()
  md.update(der)
  const digest = md.digest().toHex()
  // Format as XX:XX:XX:XX...
  return digest.toUpperCase().match(/.{2}/g).join(':')
}

/**
 * Issue developer certificate from public key
 * @param {string} publicKeyPem - Public Key in PEM format
 * @param {string} username - Developer's GitHub username
 * @returns {Promise<{certPem: string, certChainPem: string, fingerprint: string, serialNumber: string}>}
 */
function issueDeveloperCertificate (publicKeyPem, username) {
  const { cert: caCert, privateKey: caKey } = loadMiddleCA()

  // Parse public key
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem)

  // Create certificate
  const cert = forge.pki.createCertificate()
  cert.publicKey = publicKey
  cert.serialNumber = generateSerialNumber()

  // Validity: 1 year
  const now = new Date()
  cert.validity.notBefore = now
  cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year

  // Subject
  cert.setSubject([
    { name: 'commonName', value: username },
    { name: 'organizationName', value: 'KernelSU Module Developers' }
  ])

  // Issuer (from CA)
  cert.setIssuer(caCert.subject.attributes)

  // Extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false,
      critical: true
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      critical: true
    },
    {
      name: 'extKeyUsage',
      codeSigning: true
    },
    {
      name: 'subjectKeyIdentifier'
    },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: true,
      authorityCertIssuer: true,
      serialNumber: true
    }
  ])

  // Sign with CA private key (SHA-256)
  cert.sign(caKey, forge.md.sha256.create())

  const certPem = forge.pki.certificateToPem(cert)
  const fingerprint = getCertificateFingerprint(cert)

  // Build certificate chain (Developer Cert + Middle CA Cert which already contains Root CA)
  // MIDDLE_CA_CERT environment variable already contains the full chain (Middle CA + Root CA)
  const middleCaCertPem = process.env.MIDDLE_CA_CERT
  const certChainPem = certPem + middleCaCertPem

  return {
    certPem,
    certChainPem,
    fingerprint,
    serialNumber: cert.serialNumber
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
    await addLabel(token, owner, repo, issueNumber, 'approved')
    console.log(`Auto-approved: ${username} (Rank: ${evaluation.rank.level})`)
  } catch (error) {
    console.error('Error in auto-evaluation:', error)
    // 如果评估失败，仍然自动通过但不显示rank信息
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
    const token = core.getInput('github-token')
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
      await autoEvaluateDeveloper(token, owner, repo, issueNumber, username)
      return
    }

    // Handle labeled event (approval)
    if (action !== 'labeled') {
      console.log('Not a labeled or opened event')
      return
    }

    const label = context.payload.label
    if (!label || label.name !== 'approved') {
      console.log('Not an approved label')
      return
    }

    const approver = context.payload.sender

    const publicKeyPem = extractPublicKeyFromIssue(issueBody)

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
        '1. Visit our [Developer Portal](https://kernelsu-modules-repo.github.io/developers/)\n' +
        '2. Use the "Generate Key" tab to create your private key and public key\n' +
        '3. Submit the public key (NOT the private key) in this issue'
      )
      await removeLabel(token, owner, repo, issueNumber, 'approved')
      return
    }

    let result
    try {
      result = issueDeveloperCertificate(publicKeyPem, username)
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
      `\`\`\`\n${result.certChainPem}\`\`\`\n\n` +
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

    await updateIssue(token, owner, repo, issueNumber, 'closed', 'completed')
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
