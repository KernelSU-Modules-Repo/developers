const { context } = require('@actions/github')
const { getRepo, createComment, closeIssue, addLabel } = require('./github-utils')
const { verifyCertificateOwnership, isOrgAdmin } = require('./cert-manager')
const { updateAndCommitCRL } = require('./crl-utils')

/**
 * 从 issue body 中提取序列号
 * @param {string} issueBody - Issue body 内容
 * @returns {string|null}
 */
function extractSerialNumber (issueBody) {
  if (!issueBody) return null

  // 尝试匹配不同格式的序列号
  // 格式1: Serial Number: `xxxxx`
  const match1 = issueBody.match(/Serial.*?Number.*?`([0-9a-fA-F]+)`/i)
  if (match1) return match1[1]

  // 格式2: serial_number: xxxxx (来自 GitHub issue template)
  const match2 = issueBody.match(/serial[_\s]*number[:：]\s*([0-9a-fA-F]+)/i)
  if (match2) return match2[1]

  // 格式3: 直接的序列号（32位或更长的十六进制）
  const match3 = issueBody.match(/\b([0-9a-fA-F]{32,})\b/)
  if (match3) return match3[1]

  return null
}

/**
 * 处理证书吊销请求
 */
async function handleRevokeIssue () {
  try {
    const token = process.env.REPO_TOKEN
    const { owner, repo } = getRepo()
    const issue = context.payload.issue

    if (!issue) {
      console.log('Not an issue event')
      return
    }

    const issueNumber = issue.number
    const issueTitle = issue.title
    const issueBody = issue.body || ''
    const requester = issue.user.login

    // 检查是否是 revoke issue
    if (!issueTitle.toLowerCase().includes('[revoke]')) {
      console.log('Not a revoke issue')
      return
    }

    console.log(`Processing revoke request from @${requester}`)

    // 提取序列号
    const serialNumber = extractSerialNumber(issueBody)

    if (!serialNumber) {
      console.log('No serial number found in issue body')
      await createComment(
        token,
        owner,
        repo,
        issueNumber,
        `❌ **吊销请求失败 / Revocation Request Failed**\n\n` +
        `无法从 Issue 中提取证书序列号。\n` +
        `Unable to extract certificate serial number from issue.\n\n` +
        `**请确保 Issue 包含以下信息 / Please ensure the issue contains:**\n` +
        `- \`Serial Number\`: \`1a2b3c4d5e6f7890...\`\n` +
        `- 或使用开发者门户自动填充 / Or use the Developer Portal to auto-fill\n\n` +
        `**提示 / Tip**: 序列号可以在您的证书签发评论中找到。\n` +
        `The serial number can be found in your certificate issuance comment.`
      )
      await closeIssue(token, owner, repo, issueNumber, false)
      return
    }

    console.log(`Serial number extracted: ${serialNumber}`)

    // 验证证书所有权
    console.log('Verifying certificate ownership...')
    const ownership = await verifyCertificateOwnership(
      serialNumber,
      requester,
      token,
      owner,
      repo
    )

    if (!ownership.isOwner) {
      // 检查是否是组织管理员
      console.log('User is not the owner, checking admin status...')
      const isAdmin = await isOrgAdmin(requester, token, owner)

      if (!isAdmin) {
        console.log('Permission denied: not owner and not admin')
        await createComment(
          token,
          owner,
          repo,
          issueNumber,
          `❌ **吊销请求被拒绝 / Revocation Request Denied**\n\n` +
          `@${requester}，您无权吊销此证书。\n` +
          `You do not have permission to revoke this certificate.\n\n` +
          `**原因 / Reason**: 此证书不属于您 / This certificate does not belong to you\n\n` +
          (ownership.actualOwner
            ? `- **证书所有者 / Certificate Owner**: @${ownership.actualOwner}\n` +
              `- **原始 Issue / Original Issue**: #${ownership.issueNumber}\n\n`
            : `- **状态 / Status**: 证书未找到或已被吊销 / Certificate not found or already revoked\n\n`) +
          `**说明 / Note**:\n` +
          `- 只有证书所有者可以吊销自己的证书\n` +
          `- Only the certificate owner can revoke their own certificate\n` +
          `- 组织管理员拥有吊销任何证书的特殊权限\n` +
          `- Organization admins have special permission to revoke any certificate`
        )
        await closeIssue(token, owner, repo, issueNumber, false)
        return
      }

      console.log(`Admin override: @${requester} is an organization admin`)
    }

    // 权限验证通过，执行吊销
    console.log('Permission granted, proceeding with revocation...')

    // TODO: 在这里添加实际的 CRL 更新逻辑
    // await addToCRL(serialNumber, 'keyCompromise')

    await createComment(
      token,
      owner,
      repo,
      issueNumber,
      `✅ **证书吊销成功 / Certificate Revoked Successfully**\n\n` +
      `- **序列号 / Serial Number**: \`${serialNumber}\`\n` +
      `- **吊销时间 / Revoked At**: ${new Date().toISOString()}\n` +
      `- **请求者 / Requested By**: @${requester}${ownership.isOwner ? '' : ' (Organization Admin)'}\n` +
      (ownership.actualOwner && !ownership.isOwner
        ? `- **证书所有者 / Certificate Owner**: @${ownership.actualOwner}\n`
        : '') +
      (ownership.issueNumber ? `- **原始 Issue / Original Issue**: #${ownership.issueNumber}\n` : '') +
      `\n---\n\n` +
      `**重要提示 / Important Notes**:\n\n` +
      `1. ✅ 该证书已被添加到吊销列表 / The certificate has been added to the revocation list\n` +
      `2. ⚠️  使用此证书签名的模块将不再被信任 / Modules signed with this certificate will no longer be trusted\n` +
      `3. 🔄 如需新证书，请创建新的 \`[keyring]\` issue / To get a new certificate, create a new \`[keyring]\` issue\n` +
      `4. 📋 吊销信息将在下次 CRL 更新时生效 / Revocation will take effect on the next CRL update\n\n` +
      `**安全建议 / Security Recommendations**:\n` +
      `- 如果私钥泄露，请立即停止使用该证书签名 / If the private key was compromised, stop using it immediately\n` +
      `- 使用新证书重新签名所有模块 / Re-sign all modules with your new certificate\n` +
      `- 保护好新的私钥，不要与任何人分享 / Protect your new private key, never share it with anyone`
    )

    await addLabel(token, owner, repo, issueNumber, 'revoked')
    await closeIssue(token, owner, repo, issueNumber, true)

    console.log(`Certificate ${serialNumber} revoked successfully`)

    // 更新 CRL 并提交到仓库（自动触发网站部署）
    await updateAndCommitCRL(token, owner, repo, `Certificate revoked: ${serialNumber}`)
  } catch (error) {
    console.error('Error handling revoke issue:', error)
    console.error('Error stack:', error.stack)

    try {
      const token = process.env.REPO_TOKEN
      const { owner, repo } = getRepo()
      const issue = context.payload.issue

      if (issue) {
        await createComment(
          token,
          owner,
          repo,
          issue.number,
          `❌ **系统错误 / System Error**\n\n` +
          `处理吊销请求时发生错误。\n` +
          `An error occurred while processing the revocation request.\n\n` +
          `**错误信息 / Error**: ${error.message}\n\n` +
          `请联系管理员或在仓库中报告此问题。\n` +
          `Please contact an administrator or report this issue in the repository.`
        )
      }
    } catch (commentError) {
      console.error('Failed to post error comment:', commentError)
    }

    throw error
  }
}

module.exports = {
  handleRevokeIssue,
  extractSerialNumber
}
