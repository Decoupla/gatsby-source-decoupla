# Gatsby source plugin for Decoupla

This plugin is based on `gatsby-source-graphql`.

# Documentation

Documentation can be found at: [https://decoupla.com/api-docs/gatsby/gatsby-integration/](https://decoupla.com/api-docs/gatsby/gatsby-integration/)

# Installation

```bash
npm i gatsby-source-decoupla graphql
# Or: yarn add gatsby-source-decoupla graphql
```

Use GraphQL 16 alongside Gatsby 5. Yarn Classic, Yarn 4 with node-modules, and strict Yarn 4 Plug’n’Play are covered by packed-package consumer checks in CI.

# Usage

Create an API token in your Workspace API Settings. Give production builds published-read permission (`get_entries`); preview builds need draft-read permission (`get_draft_entries`). Store the token in an environment variable on your build server.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: `gatsby-source-decoupla`,
      options: {
        workspace: process.env.DECOUPLA_WORKSPACE, // Workspace API ID: d + UUID
        token: process.env.DECOUPLA_API_TOKEN,
        contentView: `live`, // Use `preview` to read draft content
        requestTimeoutMs: 30000,
      },
    },
  ],
}
```

`contentView` defaults to `live` and is sent explicitly to the API. For preview builds, set it to `preview`, including when using a migrated legacy preview token. The token must have permission for the selected view. Deleting or revoking it causes subsequent builds to fail authorization. Requests, including response bodies, time out after 30 seconds by default.

# Querying data

The genrated GraphQL types and queries for your Workspace are available inside the `Decoupla { ... }` root query.

```graphql
query {
	Decoupla {
		...your data would be avilable here
	}
}
```

*Note*: The generated GraphQL types generated based on models, would be prefixed with `Decoupla_`. 

# Example

Querying a Blog Article Model by slug.

```graphql
query {
  Decoupla {
    blogArticle(filters:{ slug: { eq: "<article_slug>" } } ) {
      node {
        id
        title
      }
    }
  }
}
```


## Keyset pagination for collection queries

The plugin introspects the remote workspace GraphQL schema and forwards its
arguments and response fields. After deploying backend keyset support, queries
can opt into `keyset: true`; existing queries keep their offset behavior.

```graphql
query BlogPage($after: String) {
  Decoupla {
    allBlogArticle(first: 100, after: $after, keyset: true, countLimit: 1000) {
      count
      countIsExact
      edges { cursor node { id title } }
      pageInfo { startCursor endCursor hasNextPage hasPreviousPage }
    }
  }
}
```

Use your generated collection/field names. For the next query, pass the returned
`endCursor` as `$after` while `hasNextPage` is true. For a previous page, use
`last: 100` with the current `startCursor` as `before`. Keep the query scope
unchanged and treat cursors as opaque; they expire after seven days. Display a
capped count as `1000+` when `countIsExact` is false, or omit both count fields
when they are unnecessary. Page sizes are limited to 1–500 in keyset mode.

The plugin delegates individual queries; it does not automatically traverse all
pages or create local Gatsby nodes for every entry. A static page query still
returns only the requested page. Full build-time collection traversal must be
implemented explicitly, for example with the SDK's
`iterateEntries(ContentType, { keyset: true })` in your build code. Each site must
opt in and deploy compatible backend/SDK versions first. Schema introspection
and forwarding tests cover both forward and backward keyset connections.

## Publishing a release

After changes are merged into `main`, open this repository's **Actions → Publish to npm → Run workflow**, select the `main` branch, and choose **patch**, **minor**, or **major**. Publishing is manual; ordinary pushes only run CI.

The workflow bumps the version, builds and tests that version, saves the tested npm package as a workflow artifact, and atomically pushes a version commit and `v<version>` tag. It then publishes that exact archive publicly to npm. If `main` changes while checks run, publishing stops so you can start a fresh run against the new commit. Release runs are serialized.

### One-time setup

In the npm settings for `gatsby-source-decoupla`, add a GitHub Actions trusted publisher:

- Organization/user: `Decoupla`
- Repository: `gatsby-source-decoupla`
- Workflow filename: `publish.yml`
- Environment: leave empty
- Allowed actions: enable direct `npm publish`

The workflow uses OIDC with Node 24; no npm publish token secret is needed. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). The repository must allow the workflow's `GITHUB_TOKEN` to push the version commit to `main` and create release tags. If branch rules prevent that push, the workflow stops before npm publication.

If the npm publish job fails after the version commit/tag succeeds, fix the publishing configuration and choose **Re-run failed jobs** on that run. This reuses the tested archive and version without another bump. The artifact is retained for seven days. GitHub and npm are separate services: the version commit/tag can exist even if npm publication fails.
