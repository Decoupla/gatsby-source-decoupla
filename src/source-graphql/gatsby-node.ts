import { uuid } from "gatsby-core-utils"
import { buildSchema, printSchema } from "gatsby/graphql"
import { wrapSchema, introspectSchema, RenameTypes } from "@graphql-tools/wrap"
import { linkToExecutor } from "@graphql-tools/links"
import { createHttpLink } from "@apollo/client"
import { fetchWrapper } from "./fetch"
import { NamespaceUnderFieldTransform, StripNonQueryTransform } from "./transforms"
import { createDataloaderLink } from "./batching/dataloder-link"

// eslint-disable-next-line @typescript-eslint/naming-convention
export const pluginOptionsSchema = ({ Joi }) =>
  Joi.object({
    url: Joi.string(),
    typeName: Joi.string().required(),
    fieldName: Joi.string().required(),
    headers: Joi.alternatives().try(Joi.object(), Joi.function()),
    fetch: Joi.function(),
    fetchOptions: Joi.object(),
    createLink: Joi.function(),
    createSchema: Joi.function(),
    batch: Joi.boolean(),
    transformSchema: Joi.function(),
    dataLoaderOptions: Joi.object({
      batch: Joi.boolean(),
      maxBatchSize: Joi.number(),
      batchScheduleFn: Joi.function(),
      cache: Joi.boolean(),
      cacheKeyFn: Joi.function(),
      cacheMap: Joi.object({
        get: Joi.function(),
        set: Joi.function(),
        delete: Joi.function(),
        clear: Joi.function(),
      }),
    }),
  }).or(`url`, `createLink`)

export const createSchemaCustomization = async ({ actions, createNodeId }, options) => {
  const { addThirdPartySchema } = actions

  const {
    url,
    typeName,
    fieldName,
    headers = {},
    fetch = fetchWrapper,
    fetchOptions = {},
    createLink,
    createSchema,
    batch = false,
    transformSchema,
  } = options

  let link

  if (createLink) {
    link = await createLink(options)
  } else {
    const options = {
      uri: url,
      fetch,
      fetchOptions,
      headers: typeof headers === `function` ? await headers() : headers,
    }

    link = batch ? createDataloaderLink(options) : createHttpLink(options)
  }

  let introspectionSchema

  if (createSchema) {
    introspectionSchema = await createSchema(options)
  } else {
    let sdl = null

    if (!sdl) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      introspectionSchema = await introspectSchema(linkToExecutor(link) as any)

      sdl = printSchema(introspectionSchema)
    } else {
      introspectionSchema = buildSchema(sdl)
    }

    // await cache.set(cacheKey, sdl)
  }

  // This node is created in `sourceNodes`.

  const nodeId = createSchemaNodeId({
    typeName,
    createNodeId,
  })

  const resolver = (_parent, _args, context) => {
    context.nodeModel.createPageDependency({
      path: context.path,
      nodeId: nodeId,
    })

    return {}
  }

  const defaultTransforms = [
    new StripNonQueryTransform(),
    new RenameTypes((name) => `${typeName}_${name}`),
    new NamespaceUnderFieldTransform({
      typeName,
      fieldName,
      resolver,
    }),
  ]

  const schema = transformSchema
    ? transformSchema({
        schema: introspectionSchema,
        link,
        resolver,
        defaultTransforms,
        options,
      })
    : wrapSchema({
        schema: introspectionSchema,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        executor: linkToExecutor(link) as any,
        transforms: defaultTransforms,
      })

  addThirdPartySchema({
    schema,
  })
}

export const sourceNodes = async ({ actions, createNodeId, createContentDigest }, options) => {
  const { createNode } = actions

  const { typeName, fieldName, refetchInterval } = options

  const nodeId = createSchemaNodeId({
    typeName,
    createNodeId,
  })

  const node = createSchemaNode({
    id: nodeId,
    typeName,
    fieldName,
    createContentDigest,
  })

  createNode(node)

  if (process.env.NODE_ENV !== `production`) {
    if (refetchInterval) {
      const msRefetchInterval = refetchInterval * 1000

      const refetcher = () => {
        createNode(
          createSchemaNode({
            id: nodeId,
            typeName,
            fieldName,
            createContentDigest,
          })
        )

        setTimeout(refetcher, msRefetchInterval)
      }

      setTimeout(refetcher, msRefetchInterval)
    }
  }
}

function createSchemaNodeId({ typeName, createNodeId }) {
  return createNodeId(`gatsby-source-graphql-${typeName}`)
}

function createSchemaNode({ id, typeName, fieldName, createContentDigest }) {
  const nodeContent = uuid.v4()

  const nodeContentDigest = createContentDigest(nodeContent)

  return {
    id,
    typeName: typeName,
    fieldName: fieldName,
    parent: null,
    children: [],
    internal: {
      type: `GraphQLSource`,
      contentDigest: nodeContentDigest,
      ignoreType: true,
    },
  }
}
