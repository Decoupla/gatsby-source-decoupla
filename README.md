# Gatsby source plugin for Decoupla

This plugin is based on `gatsby-source-graphql`.

# Documentation

Documentation can be found at: [https://decoupla.com/api-docs/gatsby/gatsby-integration/](https://decoupla.com/api-docs/gatsby/gatsby-integration/)

# Usage

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

```graphql
query {
	Decoupla {
		...your data would be avilable here
	}
}
```
