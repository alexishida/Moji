// Fetches contributors from the GitHub API and writes src/contributors.json.
// Runs as a build step (`predist` / `prebuild`) so the About dialog always
// reflects the current contributor list without a hardcoded edit.
// Bot / automation accounts (including anything named "claude") are excluded.

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')

const REPO_OWNER = 'alexishida'
const REPO_NAME = 'Moji'
const OUT_FILE = path.join(__dirname, '..', 'src', 'contributors.json')
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contributors?per_page=100&anon=1`

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        headers: {
          'User-Agent': 'moji-contributors-script',
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub API returned ${res.statusCode}: ${data}`))
            return
          }
          try {
            resolve(JSON.parse(data))
          } catch (err) {
            reject(new Error(`Failed to parse GitHub API response: ${err.message}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function isBot(login) {
  const lower = String(login).toLowerCase()
  return /claude|bot|dependabot|renovate|github-actions|actions/.test(lower)
}

async function main() {
  console.log('[generate-contributors] Fetching contributors from GitHub API...')
  const contributors = await fetchJson(API_URL)

  const list = contributors
    .filter((c) => c.type === 'User' && !isBot(c.login))
    .map((c) => ({ login: c.login, url: c.html_url }))

  // Stable, deterministic ordering: alphabetically by login.
  list.sort((a, b) => a.login.localeCompare(b.login))

  fs.writeFileSync(OUT_FILE, JSON.stringify(list, null, 2) + '\n', 'utf8')
  console.log(`[generate-contributors] Wrote ${list.length} contributors to ${OUT_FILE}`)
}

main().catch((err) => {
  console.error('[generate-contributors] ERROR:', err.message)
  process.exit(1)
})
