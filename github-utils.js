const { context, getOctokit } = require('@actions/github')

function getPrNumber () {
  const pullRequest = context.payload.pull_request
  if (!pullRequest) {
    return undefined
  }

  return pullRequest.number
}

function getIssueNumber () {
  const issue = context.payload.issue
  if (!issue) {
    return undefined
  }

  return issue.number
}

function getRepo () {
  return context.repo
}

async function getIssue (token) {
  const octokit = getOctokit(token)
  let issueNumber
  if (getIssueNumber() !== undefined) {
    issueNumber = getIssueNumber()
  } else if (getPrNumber() !== undefined) {
    issueNumber = getPrNumber()
  } else {
    throw new Error('No Issue Provided')
  }

  const { data } = await octokit.rest.issues.get({
    ...getRepo(),
    issue_number: issueNumber
  })

  return data
}

async function setLabel (token, owner, repo, issueNumber, label) {
  const octokit = getOctokit(token)
  await octokit.rest.issues.setLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [label]
  })
}

async function addLabel (token, owner, repo, issueNumber, label) {
  const octokit = getOctokit(token)
  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [label]
  })
}

async function closeIssue (token, owner, repo, issueNumber, isCompleted = false) {
  const octokit = getOctokit(token)
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: 'closed',
    state_reason: isCompleted ? 'completed' : 'not_planned'
  })
  await octokit.rest.issues.lock({
    owner,
    repo,
    issue_number: issueNumber,
    lock_reason: 'resolved'
  })
}

async function lockSpamIssue (token, owner, repo, issueNumber) {
  const octokit = getOctokit(token)
  await octokit.rest.issues.lock({
    owner,
    repo,
    issue_number: issueNumber,
    lock_reason: 'spam'
  })
}

async function orgBlockUser (token, owner, username) {
  const octokit = getOctokit(token)
  await octokit.rest.orgs.blockUser({
    org: owner,
    username
  })
}

async function createComment (token, owner, repo, issueNumber, body) {
  const octokit = getOctokit(token)
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body
  })
}

async function removeLabel (token, owner, repo, issueNumber, label) {
  const octokit = getOctokit(token)
  await octokit.rest.issues.removeLabel({
    owner,
    repo,
    issue_number: issueNumber,
    name: label
  })
}

async function updateIssue (token, owner, repo, issueNumber, state, stateReason) {
  const octokit = getOctokit(token)
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state,
    state_reason: stateReason
  })
}

module.exports = {
  getRepo,
  getIssue,
  setLabel,
  addLabel,
  closeIssue,
  lockSpamIssue,
  orgBlockUser,
  createComment,
  removeLabel,
  updateIssue
}
