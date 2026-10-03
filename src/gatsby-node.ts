import { CreateSchemaCustomizationArgs, SourceNodesArgs } from "gatsby"
import { createSchemaCustomization as createSchemaCustomizationBase, sourceNodes as sourceNodesBase } from "./source-graphql/gatsby-node"

export interface IPluginOptions {
  workspace: string
  token: string
  contentView?: "live" | "preview"
  requestTimeoutMs?: number
}

const normalizeOptions = (opts: IPluginOptions) => {
  const view = opts.contentView ?? "live"
  if (view !== "live" && view !== "preview") throw new Error("contentView must be live or preview")
  const requestTimeoutMs = opts.requestTimeoutMs ?? 30_000
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) throw new Error("requestTimeoutMs must be a positive integer")
  const endpoint = `https://api.decoupla.com/public/api/workspace/${encodeURIComponent(opts.workspace)}/graphql?api_type=${view}`
  return {
    typeName: `Decoupla`,
    fieldName: `Decoupla`,
    url: endpoint,
    fetchOptions: { timeout: requestTimeoutMs },
    headers: {
      Authorization: `Bearer ${opts.token}`,
    },
  }
}

export const createSchemaCustomization = async (args: CreateSchemaCustomizationArgs, opts: IPluginOptions) =>
  createSchemaCustomizationBase(args, normalizeOptions(opts))

export const sourceNodes = async (args: SourceNodesArgs, opts: IPluginOptions) =>
  sourceNodesBase(args, normalizeOptions(opts))

// eslint-disable-next-line @typescript-eslint/naming-convention
export const pluginOptionsSchema = ({ Joi }) =>
  Joi.object({
    workspace: Joi.string().required(),
    token: Joi.string().required(),
    contentView: Joi.string().valid("live", "preview").default("live"),
    requestTimeoutMs: Joi.number().integer().positive().default(30_000),
} )
