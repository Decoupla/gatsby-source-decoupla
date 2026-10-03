import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const mode = process.argv[2]
if (!['classic', 'node-modules', 'pnp'].includes(mode)) throw new Error('Expected classic, node-modules, or pnp')
const fixture = mkdtempSync(path.join(tmpdir(), 'decoupla-yarn-'))
const run = (cmd, args, cwd = fixture, capture = false) => {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' })
  if (result.error || result.status !== 0) throw new Error(result.error?.message || `${cmd} failed: ${result.stderr || result.status}`)
  return result.stdout
}
try {
  const metadata = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', fixture, '--cache', path.join(fixture, 'npm-cache')], process.cwd(), true))
  const tarball = path.join(fixture, Object.values(metadata)[0].filename)
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'decoupla-yarn-consumer', private: true,
    dependencies: { 'gatsby-source-decoupla': `file:${tarball}`, gatsby: 'file:./gatsby', graphql: '^16.7.1', react: '^18.3.1' } }))
  // Only Gatsby's GraphQL wrapper is needed to exercise the plugin. Keeping Gatsby
  // minimal ensures its transitive dependencies cannot hide undeclared imports.
  mkdirSync(path.join(fixture, 'gatsby'))
  writeFileSync(path.join(fixture, 'gatsby/package.json'), JSON.stringify({ name: 'gatsby', version: '5.14.1', dependencies: { graphql: '^16.7.1' } }))
  writeFileSync(path.join(fixture, 'gatsby/graphql.js'), 'module.exports = require("graphql")')
  copyFileSync('tests/yarn/consumer.cjs', path.join(fixture, 'consumer.cjs'))
  if (mode === 'classic') {
    run('yarn', ['install', '--ignore-scripts', '--non-interactive', '--registry', 'https://registry.npmjs.org', '--cache-folder', path.join(fixture, 'yarn-cache')])
    run('yarn', ['node', 'consumer.cjs'])
  } else {
    writeFileSync(path.join(fixture, '.yarnrc.yml'), `nodeLinker: ${mode}\npnpFallbackMode: none\nenableScripts: false\nenableGlobalCache: false\nglobalFolder: ${path.join(fixture, 'global')}\nnpmRegistryServer: "https://registry.npmjs.org"\n`)
    run('yarn', ['install'])
    run('yarn', ['node', 'consumer.cjs'])
  }
} finally { rmSync(fixture, { recursive: true, force: true }) }
