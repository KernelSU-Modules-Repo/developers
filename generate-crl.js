#!/usr/bin/env node

/**
 * CRL (Certificate Revocation List) Generator
 *
 * 使用 GraphQL 查询所有已签发和已吊销的证书，生成 CRL JSON 文件
 *
 * 用法：
 * node generate-crl.js [output-path]
 *
 * 环境变量：
 * - REPO_TOKEN: GitHub Personal Access Token
 * - GITHUB_REPOSITORY: 仓库名称（格式: owner/repo）
 */

const fs = require('fs').promises
const path = require('path')
const { getOctokit } = require('@actions/github')

/**
 * 从 issue 评论中提取证书信息（取最后一条）
 */
function extractCertificateInfoFromComments (comments) {
  // 从后往前查找最后一条证书签发评论
  const certComment = comments.slice().reverse().find(c =>
    c.body &&
    c.body.includes('✅ Certificate successfully issued') &&
    c.body.includes('Serial Number')
  )

  if (!certComment) return null

  // 提取序列号
  const serialMatch = certComment.body.match(/Serial Number.*?`([^`]+)`/i)
  const serialNumber = serialMatch ? serialMatch[1] : null

  // 提取指纹
  const fingerprintMatch = certComment.body.match(/Fingerprint \(SHA-256\).*?`([^`]+)`/i)
  const fingerprint = fingerprintMatch ? fingerprintMatch[1] : null

  if (!serialNumber) return null

  return {
    serialNumber,
    fingerprint,
    issuedAt: new Date(certComment.createdAt).toISOString()
  }
}

/**
 * 从 revoke issue 中提取序列号
 */
function extractSerialNumberFromBody (body) {
  if (!body) return null

  // 格式1: Serial Number: `xxxxx`
  const match1 = body.match(/Serial.*?Number.*?`([0-9a-fA-F]+)`/i)
  if (match1) return match1[1]

  // 格式2: serial_number: xxxxx
  const match2 = body.match(/serial[_\s]*number[:：]\s*([0-9a-fA-F]+)/i)
  if (match2) return match2[1]

  // 格式3: 纯序列号
  const match3 = body.match(/\b([0-9a-fA-F]{32,})\b/)
  if (match3) return match3[1]

  return null
}

/**
 * 从 revoke issue 中提取吊销原因
 */
function extractRevocationReason (body) {
  if (!body) return 'unspecified'

  // 格式1: ### Revocation Reason\n\nCompromised (GitHub issue 模板格式)
  const match1 = body.match(/###\s*Revocation\s*Reason\s*\n+(\w+)/i)
  if (match1) {
    const reason = match1[1].toLowerCase()
    return mapRevocationReason(reason)
  }

  // 格式2: reason: xxx 或 reason：xxx
  const match2 = body.match(/reason[:：]\s*(\w+)/i)
  if (match2) {
    const reason = match2[1].toLowerCase()
    return mapRevocationReason(reason)
  }

  return 'unspecified'
}

/**
 * 映射吊销原因到标准 CRL 原因代码
 */
function mapRevocationReason (reason) {
  const reasonMap = {
    compromised: 'keyCompromise',
    lost: 'keyCompromise',
    superseded: 'superseded',
    other: 'unspecified'
  }
  return reasonMap[reason] || 'unspecified'
}

/**
 * 使用 GraphQL 查询所有相关 issues
 */
async function fetchAllIssues (token, owner, repo) {
  const octokit = getOctokit(token)

  console.log('Querying all approved and revoked issues via GraphQL...')

  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        approvedIssues: issues(
          first: 100
          filterBy: { states: CLOSED, labels: ["approved"] }
          orderBy: { field: CREATED_AT, direction: DESC }
        ) {
          nodes {
            number
            title
            createdAt
            closedAt
            author {
              login
            }
            comments(first: 100) {
              nodes {
                body
                createdAt
              }
            }
          }
        }
        revokedIssues: issues(
          first: 100
          filterBy: { states: CLOSED, labels: ["revoked"] }
          orderBy: { field: CREATED_AT, direction: DESC }
        ) {
          nodes {
            number
            title
            body
            createdAt
            closedAt
            author {
              login
            }
            comments(first: 100) {
              nodes {
                body
                createdAt
              }
            }
          }
        }
      }
    }
  `

  try {
    const result = await octokit.graphql(query, { owner, repo })
    return {
      approvedIssues: result.repository.approvedIssues.nodes || [],
      revokedIssues: result.repository.revokedIssues.nodes || []
    }
  } catch (error) {
    console.error('GraphQL query failed:', error)
    throw error
  }
}

/**
 * 生成 CRL 数据
 */
async function generateCRL (token, owner, repo) {
  console.log('='.repeat(60))
  console.log('CRL Generation Started')
  console.log('='.repeat(60))
  console.log(`Repository: ${owner}/${repo}`)
  console.log(`Timestamp: ${new Date().toISOString()}`)
  console.log('')

  // 查询所有 issues
  const { approvedIssues, revokedIssues } = await fetchAllIssues(token, owner, repo)

  console.log(`Found ${approvedIssues.length} approved keyring issues`)
  console.log(`Found ${revokedIssues.length} revoked issues`)
  console.log('')

  // 构建已签发证书列表
  const issuedCertificates = new Map()

  for (const issue of approvedIssues) {
    if (!issue.title.toLowerCase().includes('[keyring]')) continue

    const certInfo = extractCertificateInfoFromComments(issue.comments.nodes)
    if (!certInfo) {
      console.log(`⚠️  Issue #${issue.number}: No certificate info found`)
      continue
    }

    issuedCertificates.set(certInfo.serialNumber, {
      serialNumber: certInfo.serialNumber,
      fingerprint: certInfo.fingerprint,
      owner: issue.author.login,
      issuedAt: certInfo.issuedAt,
      issueNumber: issue.number
    })

    console.log(`✅ Issue #${issue.number}: Certificate ${certInfo.serialNumber} (@${issue.author.login})`)
  }

  console.log('')
  console.log(`Total issued certificates: ${issuedCertificates.size}`)
  console.log('')

  // 处理吊销列表
  const revokedCertificates = []
  const revokedSerials = new Set()

  for (const issue of revokedIssues) {
    if (!issue.title.toLowerCase().includes('[revoke]')) continue

    const serialNumber = extractSerialNumberFromBody(issue.body)
    if (!serialNumber) {
      console.log(`⚠️  Revoke Issue #${issue.number}: No serial number found`)
      continue
    }

    // 检查是否已经在吊销列表中（避免重复）
    if (revokedSerials.has(serialNumber)) {
      console.log(`⚠️  Revoke Issue #${issue.number}: Serial ${serialNumber} already revoked (duplicate)`)
      continue
    }

    // 查找对应的已签发证书
    const issuedCert = issuedCertificates.get(serialNumber)
    if (!issuedCert) {
      console.log(`⚠️  Revoke Issue #${issue.number}: Certificate ${serialNumber} not found in issued list`)
      // 仍然添加到吊销列表（可能是历史数据）
    }

    const reason = extractRevocationReason(issue.body)

    // 从 issue 评论中提取吊销成功的时间
    const revokeComment = issue.comments.nodes.find(c =>
      c.body &&
      c.body.includes('✅') &&
      c.body.includes('Certificate Revoked Successfully')
    )

    const revokedAt = revokeComment
      ? new Date(revokeComment.createdAt).toISOString()
      : new Date(issue.closedAt).toISOString()

    revokedCertificates.push({
      serialNumber,
      fingerprint: issuedCert?.fingerprint || null,
      owner: issuedCert?.owner || issue.author.login,
      revokedAt,
      reason,
      revokeIssueNumber: issue.number,
      originalIssueNumber: issuedCert?.issueNumber || null
    })

    revokedSerials.add(serialNumber)

    console.log(`🚫 Revoke Issue #${issue.number}: Certificate ${serialNumber} revoked (${reason})`)
  }

  console.log('')
  console.log(`Total revoked certificates: ${revokedCertificates.length}`)
  console.log('')

  // 生成 CRL JSON
  const crl = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    issuer: 'KernelSU Module Developers',
    totalIssued: issuedCertificates.size,
    totalRevoked: revokedCertificates.length,
    revokedCertificates: revokedCertificates.sort((a, b) =>
      new Date(b.revokedAt) - new Date(a.revokedAt)
    )
  }

  console.log('='.repeat(60))
  console.log('CRL Generation Completed')
  console.log('='.repeat(60))

  return crl
}

/**
 * 主函数
 */
async function main () {
  try {
    // 获取环境变量
    const token = process.env.REPO_TOKEN || process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error('REPO_TOKEN or GITHUB_TOKEN environment variable not set')
    }

    const repository = process.env.GITHUB_REPOSITORY
    if (!repository) {
      throw new Error('GITHUB_REPOSITORY environment variable not set')
    }

    const [owner, repo] = repository.split('/')
    if (!owner || !repo) {
      throw new Error(`Invalid GITHUB_REPOSITORY format: ${repository}`)
    }

    // 获取输出路径
    const outputPath = process.argv[2] || path.join(__dirname, 'website', 'public', 'crl.json')
    console.log(`Output path: ${outputPath}`)
    console.log('')

    // 生成 CRL
    const crl = await generateCRL(token, owner, repo)

    // 确保输出目录存在
    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    // 写入文件
    await fs.writeFile(
      outputPath,
      JSON.stringify(crl, null, 2),
      'utf8'
    )

    console.log('')
    console.log(`✅ CRL written to: ${outputPath}`)
    console.log(`📊 Statistics:`)
    console.log(`   - Total Issued: ${crl.totalIssued}`)
    console.log(`   - Total Revoked: ${crl.totalRevoked}`)
    console.log(`   - Revocation Rate: ${crl.totalIssued > 0 ? ((crl.totalRevoked / crl.totalIssued) * 100).toFixed(2) : 0}%`)
    console.log('')

    // 生成摘要信息
    if (crl.totalRevoked > 0) {
      console.log('Recent Revocations:')
      crl.revokedCertificates.slice(0, 5).forEach(cert => {
        console.log(`   - ${cert.serialNumber.substring(0, 16)}... (@${cert.owner}) - ${cert.reason}`)
      })
    }

    console.log('')
    console.log('✅ CRL generation completed successfully!')

    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 运行
if (require.main === module) {
  main()
}

module.exports = {
  generateCRL,
  extractCertificateInfoFromComments,
  extractSerialNumberFromBody,
  extractRevocationReason
}
