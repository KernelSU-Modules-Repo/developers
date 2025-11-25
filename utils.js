/**
 * Utility functions for issue processing
 */

/**
 * Recognize and parse issue title tag
 * @param {string} title - Issue title
 * @returns {{type: string, title: string}} Parsed result
 */
function recognizeTitle (title) {
  const match = title.match(/^\[([^\]]+)]\s*(.*?)\s*$/)
  if (match) {
    match[1] = match[1].toLowerCase()
    if ([
      'appeal',
      'issue',
      'suggestion',
      'keyring',
      'revoke'
    ].indexOf(match[1]) !== -1) {
      return {
        type: match[1],
        title: match[2]
      }
    }
  }
  return {
    type: '',
    title
  }
}

module.exports = {
  recognizeTitle
}
