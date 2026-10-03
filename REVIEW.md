# Gatsby plugin review — 2026-10-03

Reviewed against the current contenthive-backend implementation, including unified API tokens. The findings below record the original review. Fixes have been applied and verified locally.

## Compatibility with unified tokens

The plugin sends a bearer token to the public workspace GraphQL endpoint. A new token with published-read permission works for production reads, which default to live content. Migrated preview tokens retain their legacy GraphQL default. A newly created unified token needs an explicit requested view to read preview content, which this plugin currently cannot configure.

## Findings

### 1. High: Gatsby page dependencies reference a different node ID

Locations: `src/gatsby-node.ts:3`, `src/gatsby-node.ts:13`, `src/source-graphql/gatsby-node.ts:92`, `src/source-graphql/gatsby-node.ts:133`.

`createSchemaCustomization` supplies `typeName: 'Decoupla'` and `fieldName: 'Decoupla'` to the base implementation. `sourceNodes` is re-exported directly, so Gatsby passes the original `{ workspace, token }` options without those values.

The resolver registers dependencies on `gatsby-source-graphql-Decoupla`, while `sourceNodes` creates `gatsby-source-graphql-undefined`. Incremental invalidation therefore cannot follow the intended dependency node.

Reproduction: calling the built plugin's `sourceNodes` with valid wrapper options created `gatsby-source-graphql-undefined`.

Recommended fix: wrap both Gatsby hooks and share the same normalized options, then test that resolver dependencies match the created node ID.

### 2. Medium: no explicit live/preview option for unified tokens

Location: `src/gatsby-node.ts:5`.

The plugin exposes only `workspace` and `token`, and the GraphQL URL has no `api_type`. New tokens default to live reads, so a preview-capable unified token cannot select drafts through plugin configuration. A token with only draft-read permission fails against the default live view.

Recommended fix: add a validated `contentView: 'live' | 'preview'` option with a live default and send the corresponding `api_type` query parameter. Document the read permission required for each view and use environment variables for token examples.

### 3. Medium: no regression tests or CI workflow

Locations: `jest.config.js`, `package.json`.

`npm test` exits with code 1 because the repository contains no tests. There is no committed GitHub Actions workflow. The token/view and dependency-registration paths therefore have no automated coverage.

Recommended fix: add mocked GraphQL tests for successful reads, authorization failures, explicit preview selection, and matching Gatsby dependency IDs. Run those tests and the TypeScript build in CI.

### 4. Low: transport errors lack useful diagnostics and time limits

Location: `src/source-graphql/fetch.ts`.

Non-success responses produce a generic HTTP error rather than a useful API permission message. Requests have no explicit timeout, so an unresponsive API can stall schema introspection or delegated queries.

Recommended fix: use an abortable timeout and retain safe HTTP/API error information without printing bearer tokens.

## Validation

- `npm ci --ignore-scripts`: passed.
- `npm run build`: passed.
- `npm test -- --runInBand`: failed with “No tests found.”
- Built-plugin hook invocation reproduced the dependency node mismatch with placeholder credentials and no remote API calls.
- No application source files or lockfiles were changed.

Suggested order: fix the shared Gatsby hook options, add explicit content-view selection, and cover both with tests before publishing a plugin update.


## Fixes applied locally

- Both Gatsby hooks share normalized options, so page dependencies reference the node created by `sourceNodes`.
- Explicit `contentView` selects live/preview with a live default. Preview builds using legacy tokens must also set `contentView: 'preview'`.
- Transport preserves HTTP/permission explanations, omits raw non-JSON error bodies, and enforces a configurable timeout covering the response body.
- Mocked GraphQL tests cover both views, dependency registration, validation, permission errors, and timeouts. A GitHub Actions workflow builds and tests the plugin on Node 20 and 22.
- README examples use environment variables and describe permissions and preview selection.


## Verification after fixes

- Gatsby regression suite: **8 passed, 0 failed**.
- Clean TypeScript build: passed. Test files are excluded from published build output.
- Changes were verified locally; no package was published or pushed.


## Manual publishing workflow

Added `.github/workflows/publish.yml` with a manual patch/minor/major selector, main-only checks, serialized releases, tests before publication, version/lockfile updates, an atomic version commit/tag push, and OIDC npm publishing of the tested artifact in a separate retryable job. README documents npm trusted-publisher setup and retry behavior. Workflow changes were verified locally.


### Publishing workflow verification

- `actionlint` passed for both CI and publish workflows; YAML structure and every shell block also passed validation.
- Main-branch guard accepted `main` and rejected feature branches and tags.
- Patch/minor/major increments were tested in temporary directories; manifest and both npm lockfile version fields remained synchronized.
- An isolated patch release build passed all package tests and produced a valid npm archive. SDK type tests passed and its packaged CLI reported the bumped version; Gatsby archives excluded test files.
- Archive metadata parsing handles both npm 11's array and npm 12's package-keyed object formats.
- Source repository versions remain unchanged. No push, npm publish, or external account configuration was performed during verification.
