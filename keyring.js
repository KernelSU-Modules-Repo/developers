const core = require('@actions/core')
const { context } = require('@actions/github')
const forge = require('node-forge')
const { getRepo, createComment, removeLabel, updateIssue, addLabel } = require('./github-utils')
const { fetchUserStats, evaluateUser, generateReport } = require('./rank')

/**
 * Load Middle CA certificate and private key from environment variables
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
 * Extract CSR (Certificate Signing Request) from issue body
 * @param {string} issueBody - Issue body content
 * @returns {string|null} Extracted CSR PEM or null
 */
function extractCSRFromIssue (issueBody) {
  const csrBlockRegex = /-----BEGIN CERTIFICATE REQUEST-----([\s\S]*?)-----END CERTIFICATE REQUEST-----/
  const match = issueBody.match(csrBlockRegex)

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
 * Issue developer certificate from CSR
 * @param {string} csrPem - CSR in PEM format
 * @param {string} username - Developer's GitHub username
 * @returns {Promise<{certPem: string, fingerprint: string, serialNumber: string}>}
 */
function issueDeveloperCertificate (csrPem, username) {
  const { cert: caCert, privateKey: caKey } = loadMiddleCA()

  // Parse CSR
  const csr = forge.pki.certificationRequestFromPem(csrPem)

  // Verify CSR signature
  if (!csr.verify()) {
    throw new Error('CSR signature verification failed')
  }

  // Create certificate
  const cert = forge.pki.createCertificate()
  cert.publicKey = csr.publicKey
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

  return {
    certPem,
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

    // 根据评估结果采取行动
    if (evaluation.action === 'auto_approve') {
      // Top 25% - 自动批准
      await createComment(token, owner, repo, issueNumber, report)
      await addLabel(token, owner, repo, issueNumber, 'approved')
      console.log(`Auto-approved: ${username} (Rank: ${evaluation.rank.level})`)
    } else if (evaluation.action === 'auto_reject') {
      // 低于 75% - 自动拒绝
      await createComment(
        token,
        owner,
        repo,
        issueNumber,
        report + '\n\n---\n\n' +
        '❌ **Certificate Request Rejected**\n\n' +
        `Your GitHub profile rank (${evaluation.rank.level}, ${evaluation.rank.percentile}%) does not meet the minimum threshold for automatic approval.\n\n` +
        '**Why was I rejected?**\n' +
        'The KernelSU Developer Keyring requires developers to demonstrate significant contributions to the GitHub community. ' +
        'Developers below the 75th percentile are not automatically approved to maintain the quality and security of the ecosystem.\n\n' +
        '**What can I do?**\n' +
        '1. Continue contributing to open source projects\n' +
        '2. Create quality repositories that attract stars\n' +
        '3. Participate in code reviews and pull requests\n' +
        '4. Reapply when your GitHub profile has improved\n\n' +
        '**Appeal Process:**\n' +
        'If you believe this evaluation is incorrect or have extenuating circumstances, ' +
        'please contact the core team with evidence of your contributions.\n\n' +
        'Thank you for your interest in KernelSU module development!'
      )
      await addLabel(token, owner, repo, issueNumber, 'rejected')
      await updateIssue(token, owner, repo, issueNumber, 'closed', 'not_planned')
      console.log(`Auto-rejected: ${username} (Rank: ${evaluation.rank.level})`)
    } else {
      // 25% - 75% - 等待人工审核
      await createComment(
        token,
        owner,
        repo,
        issueNumber,
        report + '\n\n---\n\n' +
        '⏳ **Manual Review Required**\n\n' +
        `Your GitHub profile rank (${evaluation.rank.level}, ${evaluation.rank.percentile}%) falls in the manual review range.\n\n` +
        '**What happens next:**\n' +
        '1. A core developer will review your GitHub profile and CSR\n' +
        '2. They may add the `approved` label if your contributions align with our requirements\n' +
        '3. Once approved, your certificate will be automatically issued\n\n' +
        '**Please wait patiently for manual approval.** This process helps us maintain the security and integrity of the KernelSU module ecosystem.\n\n' +
        '**Important reminders:**\n' +
        '- ⚠️ Never share your private key (`.key.pem` file) with anyone\n' +
        '- ✅ Only the CSR (`.csr.pem` file) should be submitted in this issue\n' +
        '- 📝 Make sure your CSR is properly formatted between `-----BEGIN CERTIFICATE REQUEST-----` and `-----END CERTIFICATE REQUEST-----` markers\n\n' +
        'If you have any questions, please refer to our [Developer Portal](https://kernelsu-modules-repo.github.io/developers/).'
      )
      console.log(`Manual review required: ${username} (Rank: ${evaluation.rank.level})`)
    }
  } catch (error) {
    console.error('Error in auto-evaluation:', error)
    // 如果评估失败，回退到原来的手动审核流程
    await createComment(
      token,
      owner,
      repo,
      issueNumber,
      `Dear @${username},\n\n` +
      'Thank you for submitting your Certificate Signing Request (CSR) to the KernelSU Developer Keyring!\n\n' +
      '⚠️ **Unable to automatically evaluate your profile.** This may be due to:\n' +
      '- Private profile settings\n' +
      '- API rate limits\n' +
      '- Network issues\n\n' +
      'Your request will be manually reviewed by a core developer.\n\n' +
      '**Important reminders:**\n' +
      '- ⚠️ Never share your private key (`.key.pem` file) with anyone\n' +
      '- ✅ Only the CSR (`.csr.pem` file) should be submitted in this issue\n' +
      '- 📝 Make sure your CSR is properly formatted\n\n' +
      'If you have any questions, please refer to our [Developer Portal](https://kernelsu-modules-repo.github.io/developers/).'
    )
  }
}

/**
 * Handle developer CSR submission in Issue
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

    const csrPem = extractCSRFromIssue(issueBody)

    if (!csrPem) {
      await createComment(
        token,
        owner,
        repo,
        issueNumber,
        '⚠️ Unable to extract valid CSR from Issue.\n\n' +
        'Please ensure your Issue description contains a complete Certificate Signing Request (CSR):\n' +
        '```\n' +
        '-----BEGIN CERTIFICATE REQUEST-----\n' +
        '...\n' +
        '-----END CERTIFICATE REQUEST-----\n' +
        '```\n\n' +
        '**How to generate a CSR:**\n' +
        '1. Visit our [Developer Portal](https://kernelsu-modules-repo.github.io/developers/)\n' +
        '2. Use the "Generate Key" tab to create your private key and CSR\n' +
        '3. Submit the CSR (NOT the private key) in this issue'
      )
      await removeLabel(token, owner, repo, issueNumber, 'approved')
      return
    }

    let result
    try {
      result = issueDeveloperCertificate(csrPem, username)
    } catch (err) {
      await createComment(
        token,
        owner,
        repo,
        issueNumber,
        `❌ Failed to issue certificate: ${err.message}\n\n` +
        'Please check:\n' +
        '- CSR format is valid\n' +
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
      `## Developer Certificate\n\n` +
      `Please save this certificate:\n\n` +
      `\`\`\`\n${result.certPem}\`\`\`\n\n` +
      `---\n\n` +
      `**Next Steps**:\n` +
      `1. Download and save this certificate as \`${username}.cert.pem\`\n` +
      `2. Keep your private key (\`${username}.key.pem\`) secure - never share it!\n` +
      `3. Use your private key to sign KernelSU modules\n\n` +
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
  extractCSRFromIssue,
  loadMiddleCA,
  getCertificateFingerprint,
  autoEvaluateDeveloper
}
