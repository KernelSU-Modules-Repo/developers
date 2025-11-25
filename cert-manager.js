const { getOctokit } = require('@actions/github')

/**
 * 使用 GraphQL 查询用户的证书和吊销记录
 * @param {string} token - GitHub token
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名
 * @param {string} username - 用户名
 * @returns {Promise<{keyringIssues: Array, revokeIssues: Array}>}
 */
async function fetchUserCertificateIssues (token, owner, repo, username) {
  const octokit = getOctokit(token)

  const query = `
    query($owner: String!, $repo: String!, $username: String!) {
      repository(owner: $owner, name: $repo) {
        keyringIssues: issues(
          first: 100
          filterBy: { createdBy: $username, states: CLOSED, labels: ["approved"] }
          orderBy: { field: CREATED_AT, direction: DESC }
        ) {
          nodes {
            number
            title
            createdAt
            closedAt
            body
            labels(first: 10) {
              nodes {
                name
              }
            }
            comments(first: 100) {
              nodes {
                id
                body
                createdAt
                author {
                  login
                }
              }
            }
          }
        }
        revokeIssues: issues(
          first: 100
          filterBy: { createdBy: $username, states: CLOSED, labels: ["revoked"] }
          orderBy: { field: CREATED_AT, direction: DESC }
        ) {
          nodes {
            number
            title
            body
            createdAt
            closedAt
          }
        }
      }
    }
  `

  try {
    const result = await octokit.graphql(query, {
      owner,
      repo,
      username
    })

    return {
      keyringIssues: result.repository.keyringIssues.nodes || [],
      revokeIssues: result.repository.revokeIssues.nodes || []
    }
  } catch (error) {
    console.error('GraphQL query failed:', error)
    throw new Error(`Failed to fetch certificate issues: ${error.message}`)
  }
}

/**
 * 从 issue 评论中提取证书信息
 * @param {Array} comments - Issue 评论列表
 * @returns {{serialNumber: string, fingerprint: string, issuedAt: Date, expiresAt: Date} | null}
 */
function extractCertificateInfo (comments) {
  // 查找证书签发评论
  const certComment = comments.find(c =>
    c.body &&
    c.body.includes('✅ Certificate successfully issued') &&
    c.body.includes('Serial Number')
  )

  if (!certComment) {
    return null
  }

  // 提取序列号
  const serialMatch = certComment.body.match(/Serial Number.*?`([^`]+)`/i)
  const serialNumber = serialMatch ? serialMatch[1] : null

  // 提取指纹
  const fingerprintMatch = certComment.body.match(/Fingerprint \(SHA-256\).*?`([^`]+)`/i)
  const fingerprint = fingerprintMatch ? fingerprintMatch[1] : null

  if (!serialNumber) {
    return null
  }

  // 计算有效期（1年）
  const issuedAt = new Date(certComment.createdAt)
  const expiresAt = new Date(issuedAt.getTime() + 365 * 24 * 60 * 60 * 1000)

  return {
    serialNumber,
    fingerprint,
    issuedAt,
    expiresAt
  }
}

/**
 * 检查证书是否在吊销列表中
 * @param {string} serialNumber - 证书序列号
 * @param {Array} revokeIssues - 吊销 issue 列表
 * @returns {boolean}
 */
function isCertificateRevoked (serialNumber, revokeIssues) {
  return revokeIssues.some(issue =>
    issue.title.toLowerCase().includes('[revoke]') &&
    issue.body &&
    issue.body.includes(serialNumber)
  )
}

/**
 * 检查用户是否已有有效证书
 * @param {string} username - GitHub 用户名
 * @param {string} token - GitHub token
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名
 * @returns {Promise<{hasActiveCert: boolean, certificate?: object, issueNumber?: number}>}
 */
async function checkExistingCertificate (username, token, owner, repo) {
  try {
    console.log(`Checking existing certificates for user: ${username}`)

    // 使用 GraphQL 获取用户的 issue
    const { keyringIssues, revokeIssues } = await fetchUserCertificateIssues(
      token,
      owner,
      repo,
      username
    )

    console.log(`Found ${keyringIssues.length} keyring issues and ${revokeIssues.length} revoke issues`)

    // 过滤出真正的 keyring issue（标题包含 [keyring]）
    const validKeyringIssues = keyringIssues.filter(issue =>
      issue.title.toLowerCase().includes('[keyring]')
    )

    if (validKeyringIssues.length === 0) {
      console.log('No keyring issues found for user')
      return { hasActiveCert: false }
    }

    const now = new Date()

    // 检查每个 keyring issue，从最新到最旧
    for (const issue of validKeyringIssues) {
      const certInfo = extractCertificateInfo(issue.comments.nodes)

      if (!certInfo) {
        console.log(`Issue #${issue.number}: No certificate info found`)
        continue
      }

      console.log(`Issue #${issue.number}: Found certificate ${certInfo.serialNumber}`)
      console.log(`  Issued: ${certInfo.issuedAt.toISOString()}`)
      console.log(`  Expires: ${certInfo.expiresAt.toISOString()}`)

      // 检查是否过期
      if (now > certInfo.expiresAt) {
        console.log(`  Status: EXPIRED`)
        continue
      }

      // 检查是否被吊销
      const isRevoked = isCertificateRevoked(certInfo.serialNumber, revokeIssues)
      if (isRevoked) {
        console.log(`  Status: REVOKED`)
        continue
      }

      // 找到有效证书
      console.log(`  Status: ACTIVE`)
      return {
        hasActiveCert: true,
        certificate: {
          serialNumber: certInfo.serialNumber,
          fingerprint: certInfo.fingerprint,
          issuedAt: certInfo.issuedAt.toISOString(),
          expiresAt: certInfo.expiresAt.toISOString()
        },
        issueNumber: issue.number
      }
    }

    console.log('No active certificate found')
    return { hasActiveCert: false }
  } catch (error) {
    console.error('Error checking existing certificate:', error)
    // 如果检查失败，为了安全起见，假设没有证书（允许签发）
    // 但记录错误以便调试
    console.error('Certificate check failed, allowing issuance by default')
    return { hasActiveCert: false, error: error.message }
  }
}

/**
 * 统计用户的证书情况
 * @param {string} username - GitHub 用户名
 * @param {string} token - GitHub token
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名
 * @returns {Promise<{total: number, active: number, expired: number, revoked: number}>}
 */
async function getCertificateStatistics (username, token, owner, repo) {
  const { keyringIssues, revokeIssues } = await fetchUserCertificateIssues(
    token,
    owner,
    repo,
    username
  )

  const validKeyringIssues = keyringIssues.filter(issue =>
    issue.title.toLowerCase().includes('[keyring]')
  )

  let total = 0
  let active = 0
  let expired = 0
  let revoked = 0

  const now = new Date()

  for (const issue of validKeyringIssues) {
    const certInfo = extractCertificateInfo(issue.comments.nodes)
    if (!certInfo) continue

    total++

    const isRevoked = isCertificateRevoked(certInfo.serialNumber, revokeIssues)
    if (isRevoked) {
      revoked++
    } else if (now > certInfo.expiresAt) {
      expired++
    } else {
      active++
    }
  }

  return { total, active, expired, revoked }
}

/**
 * 验证证书是否属于指定用户
 * @param {string} serialNumber - 证书序列号
 * @param {string} username - 声称拥有证书的用户名
 * @param {string} token - GitHub token
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名
 * @returns {Promise<{isOwner: boolean, actualOwner?: string, issueNumber?: number}>}
 */
async function verifyCertificateOwnership (serialNumber, username, token, owner, repo) {
  try {
    console.log(`Verifying certificate ownership: serial=${serialNumber}, claimed user=${username}`)

    const octokit = require('@actions/github').getOctokit(token)

    // GraphQL 查询所有带有 approved 标签的已关闭 keyring issues
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          issues(
            first: 100
            filterBy: { states: CLOSED, labels: ["approved"] }
            orderBy: { field: CREATED_AT, direction: DESC }
          ) {
            nodes {
              number
              title
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

    const result = await octokit.graphql(query, { owner, repo })
    const issues = result.repository.issues.nodes

    // 搜索包含该序列号的 issue
    for (const issue of issues) {
      if (!issue.title.toLowerCase().includes('[keyring]')) continue

      const certComment = issue.comments.nodes.find(c =>
        c.body &&
        c.body.includes('✅ Certificate successfully issued') &&
        c.body.includes(serialNumber)
      )

      if (certComment) {
        const actualOwner = issue.author.login
        console.log(`Found certificate: serial=${serialNumber}, owner=${actualOwner}, issue=#${issue.number}`)

        return {
          isOwner: actualOwner.toLowerCase() === username.toLowerCase(),
          actualOwner,
          issueNumber: issue.number
        }
      }
    }

    console.log(`Certificate not found: serial=${serialNumber}`)
    return { isOwner: false }
  } catch (error) {
    console.error('Error verifying certificate ownership:', error)
    throw new Error(`Failed to verify certificate ownership: ${error.message}`)
  }
}

/**
 * 检查用户是否是组织管理员
 * @param {string} username - 用户名
 * @param {string} token - GitHub token
 * @param {string} owner - 组织名称
 * @returns {Promise<boolean>}
 */
async function isOrgAdmin (username, token, owner) {
  try {
    const octokit = require('@actions/github').getOctokit(token)

    const { data } = await octokit.rest.orgs.getMembershipForUser({
      org: owner,
      username
    })

    // role 可以是 'admin' 或 'member'
    return data.role === 'admin'
  } catch (error) {
    console.error(`Error checking org admin status for ${username}:`, error.message)
    return false
  }
}

module.exports = {
  checkExistingCertificate,
  fetchUserCertificateIssues,
  getCertificateStatistics,
  extractCertificateInfo,
  isCertificateRevoked,
  verifyCertificateOwnership,
  isOrgAdmin
}
