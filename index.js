const core = require('@actions/core')
const { context } = require('@actions/github')
const { setLabel, closeIssue, getIssue, getRepo, lockSpamIssue, orgBlockUser } = require('./github-utils')
const { recognizeTitle } = require('./utils')
const { handleKeyringIssue } = require('./keyring')

async function closeSpam (token, owner, repo, issueNo, username = '') {
  await setLabel(token, owner, repo, issueNo, 'spam')
  await closeIssue(token, owner, repo, issueNo)
  await lockSpamIssue(token, owner, repo, issueNo)
  if (username !== '') await orgBlockUser(token, owner, username)
}

async function run () {
  try {
    if (context.payload.sender.id === 244865617) return // ignore bot

    const token = core.getInput('github-token')
    const { owner, repo } = getRepo()
    const issue = await getIssue(token)
    const { type: prefixTag } = recognizeTitle(issue.title)
    const action = context.payload.action

    const issueNo = issue.number
    const username = issue.user.login

    if (action === 'labeled') {
      const newLabel = context.payload.label.name
      if (newLabel === 'spam') {
        await closeSpam(token, owner, repo, issueNo, username)
      } else if (newLabel === 'approved') {
        if (prefixTag === 'keyring') {
          await handleKeyringIssue()
        }
      }
    } else if (action === 'opened') {
      // close missing tag issue
      if (!prefixTag) {
        await closeSpam(token, owner, repo, issueNo)
        return
      }

      // handle keyring issue (auto-evaluation)
      if (prefixTag === 'keyring') {
        await handleKeyringIssue()
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
