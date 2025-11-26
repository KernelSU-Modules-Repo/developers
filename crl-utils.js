const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { generateCRL } = require('./generate-crl')

/**
 * 生成 CRL 并提交到仓库
 * @param {string} token - GitHub token
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名
 * @param {string} reason - 更新原因
 */
async function updateAndCommitCRL (token, owner, repo, reason = 'Update CRL') {
  try {
    console.log('')
    console.log('='.repeat(70))
    console.log('🔄 Updating Certificate Revocation List (CRL)')
    console.log('='.repeat(70))
    console.log(`Reason: ${reason}`)
    console.log('')

    // 生成 CRL
    const crl = await generateCRL(token, owner, repo)

    // CRL 文件路径
    const crlPath = path.join(__dirname, 'website', 'public', 'crl.json')

    // 确保目录存在
    const crlDir = path.dirname(crlPath)
    if (!fs.existsSync(crlDir)) {
      fs.mkdirSync(crlDir, { recursive: true })
      console.log(`✅ Created directory: ${crlDir}`)
    }

    // 写入 CRL 文件
    fs.writeFileSync(crlPath, JSON.stringify(crl, null, 2), 'utf8')
    console.log(`✅ CRL written to: ${crlPath}`)
    console.log(`   - Total Issued: ${crl.totalIssued}`)
    console.log(`   - Total Revoked: ${crl.totalRevoked}`)
    console.log('')

    // Git 配置
    console.log('🔧 Configuring Git...')
    execSync('git config user.name "github-actions[bot]"', { stdio: 'inherit' })
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { stdio: 'inherit' })

    // 检查文件状态
    console.log('📊 Checking Git status...')
    const statusOutput = execSync('git status --porcelain website/public/crl.json', { encoding: 'utf8' })

    if (!statusOutput.trim()) {
      console.log('ℹ️  No changes to CRL, skipping commit')
      console.log('='.repeat(70))
      console.log('')
      return { updated: false, crl }
    }

    console.log('📝 Changes detected in CRL')
    console.log('')

    // Add, commit, push
    console.log('➕ Adding CRL file to Git...')
    execSync('git add website/public/crl.json', { stdio: 'inherit' })

    console.log('💾 Committing changes...')
    const commitMessage = `chore: update CRL - ${reason}

Generated at: ${crl.generatedAt}
Total issued: ${crl.totalIssued}
Total revoked: ${crl.totalRevoked}`

    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' })

    console.log('🚀 Pushing to remote...')
    execSync('git push', { stdio: 'inherit' })

    console.log('')
    console.log('='.repeat(70))
    console.log('✅ CRL updated and pushed successfully!')
    console.log('🌐 Website deployment will be triggered automatically')
    console.log('='.repeat(70))
    console.log('')

    return { updated: true, crl }
  } catch (error) {
    console.error('')
    console.error('='.repeat(70))
    console.error('❌ Failed to update CRL')
    console.error('='.repeat(70))
    console.error('Error:', error.message)

    if (error.stdout) {
      console.error('stdout:', error.stdout.toString())
    }
    if (error.stderr) {
      console.error('stderr:', error.stderr.toString())
    }

    console.error('='.repeat(70))
    console.error('')

    // 不抛出错误，避免阻断主流程
    return { updated: false, error: error.message }
  }
}

module.exports = {
  updateAndCommitCRL
}
