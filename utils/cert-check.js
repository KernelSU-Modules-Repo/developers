#!/usr/bin/env bun

/**
 * 测试脚本：检查用户的证书状态
 *
 * 使用方法：
 * bun utils/cert-check.js <username>
 *
 * 环境变量：
 * REPO_TOKEN - GitHub Personal Access Token
 * GITHUB_REPOSITORY - 仓库名称（格式: owner/repo）
 */

const { checkExistingCertificate, getCertificateStatistics } = require('../cert-manager')

async function main () {
  const username = process.argv[2]
  if (!username) {
    console.error('Usage: node test-cert-check.js <username>')
    process.exit(1)
  }

  const token = process.env.REPO_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    console.error('Error: REPO_TOKEN or GITHUB_TOKEN environment variable not set')
    process.exit(1)
  }

  const repository = process.env.GITHUB_REPOSITORY || 'kernelsu-modules-repo/developers'
  const [owner, repo] = repository.split('/')

  console.log('='.repeat(60))
  console.log(`检查用户证书状态 / Checking Certificate Status`)
  console.log('='.repeat(60))
  console.log(`用户 / User: ${username}`)
  console.log(`仓库 / Repository: ${owner}/${repo}`)
  console.log('')

  try {
    // 检查是否有有效证书
    console.log('正在查询... / Querying...\n')
    const result = await checkExistingCertificate(username, token, owner, repo)

    if (result.hasActiveCert) {
      console.log('✅ 找到有效证书 / Active Certificate Found')
      console.log('─'.repeat(60))
      console.log(`序列号 / Serial Number: ${result.certificate.serialNumber}`)
      console.log(`指纹 / Fingerprint: ${result.certificate.fingerprint || 'N/A'}`)
      console.log(`签发时间 / Issued: ${result.certificate.issuedAt}`)
      console.log(`过期时间 / Expires: ${result.certificate.expiresAt}`)
      console.log(`Issue 编号 / Issue Number: #${result.issueNumber}`)
      console.log('─'.repeat(60))
      console.log('\n❌ 该用户不能申请新证书 / User CANNOT apply for new certificate')
    } else {
      console.log('❌ 未找到有效证书 / No Active Certificate Found')
      console.log('─'.repeat(60))
      if (result.error) {
        console.log(`⚠️  检查过程出错 / Error: ${result.error}`)
      }
      console.log('\n✅ 该用户可以申请新证书 / User CAN apply for new certificate')
    }

    // 获取统计信息
    console.log('\n')
    console.log('='.repeat(60))
    console.log('证书统计 / Certificate Statistics')
    console.log('='.repeat(60))

    const stats = await getCertificateStatistics(username, token, owner, repo)
    console.log(`总计 / Total: ${stats.total}`)
    console.log(`有效 / Active: ${stats.active}`)
    console.log(`过期 / Expired: ${stats.expired}`)
    console.log(`已吊销 / Revoked: ${stats.revoked}`)
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ 错误 / Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
