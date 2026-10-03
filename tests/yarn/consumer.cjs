const assert = require('node:assert/strict')
const { createRequire, Module } = require('node:module')
const path = require('node:path')
const rootRequire = createRequire(path.join(process.cwd(), 'package.json'))
const { buildSchema, graphqlSync, getIntrospectionQuery, graphql } = rootRequire('graphql')
const pluginRequire = createRequire(rootRequire.resolve('gatsby-source-decoupla'))
const realFetch = pluginRequire('node-fetch')
const schema = buildSchema('type Query { posts: [Post!]! } type Post { id: ID!, title: String! }')
const introspection = graphqlSync({ schema, source: getIntrospectionQuery() })
const originalLoad = Module._load
const mockFetch = Object.assign(async (url, options) => {
  assert.match(url, /api_type=preview$/)
  const query = JSON.parse(options.body).query
  return new realFetch.Response(JSON.stringify(query.includes('__schema')
    ? introspection : { data: { posts: [{ id: '1', title: 'Preview' }] } }))
}, realFetch)
Module._load = function (id, parent, isMain) {
  return id === 'node-fetch' ? mockFetch : originalLoad.call(this, id, parent, isMain)
}
;(async () => {
  const plugin = rootRequire('gatsby-source-decoupla')
  let wrappedSchema, nodeId, dependencyId
  const args = { actions: { addThirdPartySchema: ({ schema }) => { wrappedSchema = schema },
    createNode: node => { nodeId = node.id } }, createNodeId: id => id, createContentDigest: () => 'digest' }
  const options = { workspace: '00000000-0000-4000-8000-000000000001', token: 'placeholder', contentView: 'preview' }
  await plugin.createSchemaCustomization(args, options)
  await plugin.sourceNodes(args, options)
  const result = await graphql({ schema: wrappedSchema, source: '{ Decoupla { posts { id title } } }',
    contextValue: { path: '/', nodeModel: { createPageDependency: ({ nodeId }) => { dependencyId = nodeId } } } })
  assert.equal(result.errors, undefined)
  assert.equal(result.data.Decoupla.posts[0].title, 'Preview')
  assert.equal(dependencyId, nodeId)
  assert.equal(rootRequire('gatsby/graphql').GraphQLSchema, rootRequire('graphql').GraphQLSchema)
  console.log('Yarn consumer: preview query and Gatsby dependencies passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
