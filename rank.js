const { Octokit } = require('@octokit/rest')

/**
 * GitHub Readme Stats 评分算法实现
 * 参考：https://github.com/anuraghazra/github-readme-stats
 */

// 权重配置
const WEIGHTS = {
  COMMITS: 2,
  PRS: 3,
  ISSUES: 1,
  REVIEWS: 1,
  STARS: 4,
  FOLLOWERS: 1
}

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0) // 12

// MEDIAN 参考值（来自 github-readme-stats）
const MEDIANS = {
  COMMITS: 250, // 普通模式
  PRS: 50,
  ISSUES: 25,
  REVIEWS: 2,
  STARS: 50,
  FOLLOWERS: 10
}

// 等级阈值（百分位）
const RANK_THRESHOLDS = {
  S: 1, // 前 1%
  'A+': 12.5, // 1% - 12.5%
  A: 25, // 12.5% - 25%
  'A-': 37.5, // 25% - 37.5%
  'B+': 50, // 37.5% - 50%
  B: 62.5, // 50% - 62.5%
  'B-': 75, // 62.5% - 75%
  'C+': 87.5, // 75% - 87.5%
  C: 100 // 87.5% - 100%
}

/**
 * 指数累积分布函数
 * 用于 commits, PRs, issues, reviews
 */
function exponentialCDF (x) {
  return 1 - Math.pow(2, -x)
}

/**
 * 对数正态累积分布函数（近似）
 * 用于 stars, followers
 */
function logNormalCDF (x) {
  return x / (1 + x)
}

/**
 * 计算开发者等级
 * @param {Object} stats - 开发者统计数据
 * @returns {Object} - { percentile, level, score }
 */
function calculateRank (stats) {
  const {
    commits = 0,
    prs = 0,
    issues = 0,
    reviews = 0,
    stars = 0,
    followers = 0
  } = stats

  // 计算加权评分
  const score =
    WEIGHTS.COMMITS * exponentialCDF(commits / MEDIANS.COMMITS) +
    WEIGHTS.PRS * exponentialCDF(prs / MEDIANS.PRS) +
    WEIGHTS.ISSUES * exponentialCDF(issues / MEDIANS.ISSUES) +
    WEIGHTS.REVIEWS * exponentialCDF(reviews / MEDIANS.REVIEWS) +
    WEIGHTS.STARS * logNormalCDF(stars / MEDIANS.STARS) +
    WEIGHTS.FOLLOWERS * logNormalCDF(followers / MEDIANS.FOLLOWERS)

  // 计算百分位（rank 越小越好）
  const rank = 1 - score / TOTAL_WEIGHT
  const percentile = rank * 100

  // 确定等级
  let level = 'C'
  for (const [rankLevel, threshold] of Object.entries(RANK_THRESHOLDS)) {
    if (percentile <= threshold) {
      level = rankLevel
      break
    }
  }

  return {
    percentile: parseFloat(percentile.toFixed(2)),
    level,
    score: parseFloat(score.toFixed(2))
  }
}

/**
 * 从 GitHub API 获取用户统计数据
 * @param {string} username - GitHub 用户名
 * @param {string} token - GitHub Token
 * @returns {Promise<Object>} - 统计数据
 */
async function fetchUserStats (username, token) {
  const octokit = new Octokit({ auth: token })

  try {
    // 获取用户基本信息
    const { data: user } = await octokit.users.getByUsername({ username })

    // GraphQL 查询获取详细统计
    const query = `
      query($login: String!) {
        user(login: $login) {
          contributionsCollection {
            totalCommitContributions
            totalPullRequestReviewContributions
          }
          pullRequests {
            totalCount
          }
          issues {
            totalCount
          }
          repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
            totalCount
            nodes {
              stargazers {
                totalCount
              }
            }
          }
          followers {
            totalCount
          }
        }
      }
    `

    const { data } = await octokit.graphql(query, { login: username })
    const userData = data.user

    // 计算总星标数
    const totalStars = userData.repositories.nodes.reduce(
      (sum, repo) => sum + repo.stargazers.totalCount,
      0
    )

    return {
      username,
      name: user.name || username,
      commits: userData.contributionsCollection.totalCommitContributions,
      prs: userData.pullRequests.totalCount,
      issues: userData.issues.totalCount,
      reviews: userData.contributionsCollection.totalPullRequestReviewContributions,
      stars: totalStars,
      followers: userData.followers.totalCount,
      createdAt: user.created_at,
      publicRepos: user.public_repos
    }
  } catch (error) {
    throw new Error(`Failed to fetch stats for ${username}: ${error.message}`)
  }
}

/**
 * 评估用户是否符合条件
 * @param {Object} stats - 用户统计数据
 * @returns {Object} - { approved, action, reason, rank }
 */
function evaluateUser (stats) {
  const rank = calculateRank(stats)

  // Top 25% - 自动批准 (S, A+, A)
  if (rank.percentile <= 25) {
    return {
      approved: true,
      action: 'auto_approve',
      reason: `Top ${rank.percentile.toFixed(1)}% developer (Rank: ${rank.level})`,
      rank
    }
  }

  // 低于 75% - 自动拒绝 (C+, C)
  if (rank.percentile > 75) {
    return {
      approved: false,
      action: 'auto_reject',
      reason: `Rank below threshold (${rank.percentile.toFixed(1)}%, Rank: ${rank.level})`,
      rank
    }
  }

  // 25% - 75% - 等待人工审核 (A-, B+, B, B-)
  return {
    approved: null,
    action: 'manual_review',
    reason: `Requires manual review (${rank.percentile.toFixed(1)}%, Rank: ${rank.level})`,
    rank
  }
}

/**
 * 生成详细的评估报告
 * @param {Object} stats - 用户统计数据
 * @param {Object} evaluation - 评估结果
 * @returns {string} - Markdown 格式的报告
 */
function generateReport (stats, evaluation) {
  const { rank } = evaluation

  const report = `## Developer Evaluation Report

**User**: @${stats.username} (${stats.name})
**Account Created**: ${new Date(stats.createdAt).toLocaleDateString()}

### GitHub Statistics

| Metric | Value | Weight | Median |
|--------|-------|--------|--------|
| 💻 Commits | ${stats.commits} | ${WEIGHTS.COMMITS} | ${MEDIANS.COMMITS} |
| 🔀 Pull Requests | ${stats.prs} | ${WEIGHTS.PRS} | ${MEDIANS.PRS} |
| 🐛 Issues | ${stats.issues} | ${WEIGHTS.ISSUES} | ${MEDIANS.ISSUES} |
| 👀 Code Reviews | ${stats.reviews} | ${WEIGHTS.REVIEWS} | ${MEDIANS.REVIEWS} |
| ⭐ Stars | ${stats.stars} | ${WEIGHTS.STARS} | ${MEDIANS.STARS} |
| 👥 Followers | ${stats.followers} | ${WEIGHTS.FOLLOWERS} | ${MEDIANS.FOLLOWERS} |

### Ranking Result

- **Level**: \`${rank.level}\`
- **Percentile**: \`${rank.percentile}%\` (Top ${rank.percentile.toFixed(1)}%)
- **Score**: \`${rank.score}/${TOTAL_WEIGHT}\`

### Decision

**Action**: \`${evaluation.action}\`
**Reason**: ${evaluation.reason}
`

  return report
}

module.exports = {
  calculateRank,
  fetchUserStats,
  evaluateUser,
  generateReport,
  RANK_THRESHOLDS,
  MEDIANS,
  WEIGHTS
}
