# Gatsby source plugin for Decoupla

This plugin is based on `gatsby-source-graphql`.

# Documentation

Documentation can be found at: [https://decoupla.com/api-docs/gatsby/gatsby-integration/](https://decoupla.com/api-docs/gatsby/gatsby-integration/)

# Installation

```bash
npm i gatsby-source-decoupla
```

# Usage

The `workspace` and `token` can be found in your Workspace API Settings.

```js
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: `gatsby-source-decoupla`,
      options: {
        workspace: `your_workspace_id`,
	token: `your_token`
      },
    },
  ],
}
```

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
