import { buildSchema, graphql, graphqlSync, getIntrospectionQuery } from 'graphql'
import nodeFetch from 'node-fetch'
import { createSchemaCustomization, sourceNodes, pluginOptionsSchema } from '../gatsby-node'
import { fetchWrapper } from '../source-graphql/fetch'

jest.mock('node-fetch', () => {
  const actual = jest.requireActual('node-fetch')
  return Object.assign(jest.fn(), actual)
})

const fetchMock = nodeFetch as unknown as jest.Mock
const Response = jest.requireActual('node-fetch').Response
const Joi = require('joi')
const remoteSchema = buildSchema('type Query { posts: [Post!]! } type Post { id: ID!, title: String! }')
const introspection = graphqlSync({ schema: remoteSchema, source: getIntrospectionQuery() })
const opts = { workspace: 'workspace-id', token: 'placeholder' }

beforeEach(() => fetchMock.mockReset())

function args() {
  return { actions: { addThirdPartySchema: jest.fn(), createNode: jest.fn() },
    createNodeId: (name: string) => name, createContentDigest: () => 'digest' } as any
}

test.each(['live', 'preview'] as const)('reads %s and registers matching Gatsby dependencies', async view => {
  fetchMock.mockImplementation(async (_url, init) => {
    const query = JSON.parse(init.body).query
    return new Response(JSON.stringify(query.includes('__schema') ? introspection : { data: { posts: [{ id: '1', title: 'Hello' }] } }))
  })
  const hooks = args()
  await createSchemaCustomization(hooks, { ...opts, contentView: view })
  await sourceNodes(hooks, { ...opts, contentView: view })
  const schema = hooks.actions.addThirdPartySchema.mock.calls[0][0].schema
  const createPageDependency = jest.fn()
  const result = await graphql({ schema, source: '{ Decoupla { posts { id title } } }',
    contextValue: { nodeModel: { createPageDependency }, path: '/test' } })
  expect(result.errors).toBeUndefined()
  expect(result.data?.Decoupla).toEqual({ posts: [{ id: '1', title: 'Hello' }] })
  expect(createPageDependency).toHaveBeenCalledWith({ path: '/test', nodeId: hooks.actions.createNode.mock.calls[0][0].id })
  expect(hooks.actions.createNode.mock.calls[0][0].id).toBe('gatsby-source-graphql-Decoupla')
  expect(fetchMock.mock.calls.every(([url]) => url.endsWith(`?api_type=${view}`))).toBe(true)
  expect(fetchMock.mock.calls[0][1].headers.authorization ?? fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer placeholder')
})

test('defaults to explicit live reads for new and migrated tokens', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(introspection)))
  await createSchemaCustomization(args(), opts)
  expect(fetchMock.mock.calls[0][0]).toContain('?api_type=live')
})

test.each(['forward', 'backward'])('forwards %s keyset cursors and count metadata through the remote schema', async direction => {
  const schema = buildSchema(`
    type Query { allPost(first: Int, last: Int, after: String, before: String, keyset: Boolean = false, countLimit: Int): PostConnection! }
    type PostConnection { count: Int!, countIsExact: Boolean!, edges: [PostEdge!]!, pageInfo: PageInfo! }
    type PostEdge { cursor: String!, node: Post! }
    type Post { id: ID!, title: String! }
    type PageInfo { startCursor: String, endCursor: String, hasPreviousPage: Boolean!, hasNextPage: Boolean! }
  `)
  const calls: any[] = []
  const introspection = graphqlSync({ schema, source: getIntrospectionQuery() })
  fetchMock.mockImplementation(async (_url, init) => {
    const request = JSON.parse(init.body)
    const result = request.query.includes('__schema') ? introspection : await graphql({
      schema, source: request.query, variableValues: request.variables,
      rootValue: { allPost: (args: any) => {
        calls.push(args)
        return { count: 1000, countIsExact: false,
          edges: [{ cursor: 'opaque-edge', node: { id: 'post', title: 'Hello' } }],
          pageInfo: { startCursor: 'opaque-start', endCursor: 'opaque-end', hasPreviousPage: true, hasNextPage: true } }
      } },
    })
    return new Response(JSON.stringify(result))
  })
  const hooks = args()
  await createSchemaCustomization(hooks, opts)
  const wrapped = hooks.actions.addThirdPartySchema.mock.calls[0][0].schema
  const pageArgs = direction === 'forward' ? 'first: 10, after: $cursor' : 'last: 10, before: $cursor'
  const result = await graphql({ schema: wrapped,
    source: `query Page($cursor: String!) { Decoupla { allPost(${pageArgs}, keyset: true, countLimit: 1000) {
      count countIsExact edges { cursor node { id title } }
      pageInfo { startCursor endCursor hasPreviousPage hasNextPage }
    } } }`, variableValues: { cursor: 'opaque-input' },
    contextValue: { nodeModel: { createPageDependency: jest.fn() }, path: '/page' } })
  expect(result.errors).toBeUndefined()
  expect(calls).toEqual([direction === 'forward' ? { first: 10, after: 'opaque-input', keyset: true, countLimit: 1000 } :
    { last: 10, before: 'opaque-input', keyset: true, countLimit: 1000 }])
  expect((result.data?.Decoupla as any).allPost).toMatchObject({ count: 1000, countIsExact: false,
    edges: [{ cursor: 'opaque-edge', node: { id: 'post', title: 'Hello' } }],
    pageInfo: { startCursor: 'opaque-start', endCursor: 'opaque-end' } })
})

test('plugin options validate views and timeouts', async () => {
  const schema = pluginOptionsSchema({ Joi })
  expect(schema.validate(opts).value.contentView).toBe('live')
  expect(schema.validate({ ...opts, contentView: 'invalid' }).error).toBeDefined()
  expect(schema.validate({ ...opts, requestTimeoutMs: 0 }).error).toBeDefined()
  await expect(createSchemaCustomization(args(), { ...opts, contentView: 'invalid' as any })).rejects.toThrow('contentView must')
})

test('authorization failures include the backend permission explanation', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'API key missing permission: get_draft_entries' }), { status: 403 }))
  await expect(createSchemaCustomization(args(), { ...opts, contentView: 'preview' })).rejects.toThrow('get_draft_entries')
})

test('non-JSON failures do not expose response bodies', async () => {
  fetchMock.mockResolvedValue(new Response('private token and data', { status: 502 }))
  await expect(fetchWrapper('https://example.invalid', {})).rejects.toThrow('HTTP 502')
})

test('aborts unresponsive requests', async () => {
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }))
  await expect(fetchWrapper('https://example.invalid', { timeout: 5 })).rejects.toThrow('timed out after 5ms')
})

test('timeout also covers stalled response bodies', async () => {
  fetchMock.mockImplementation(async (_url, init) => ({ ok: true, text: () => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true })
  }) }))
  await expect(fetchWrapper('https://example.invalid', { timeout: 5 })).rejects.toThrow('timed out after 5ms')
})
