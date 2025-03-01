import { CreateSchemaCustomizationArgs } from "gatsby"
import { createSchemaCustomization as createSchemaCustomizationBase } from "./source-graphql/gatsby-node"
export { sourceNodes } from "./source-graphql/gatsby-node"

export interface IPluginOptions {
  workspace: string
  token: string
}

export const createSchemaCustomization = async (args: CreateSchemaCustomizationArgs, opts: IPluginOptions) => {
  const endpoint = `https://api.decoupla.com/public/api/workspace/${opts.workspace}/graphql`
  return createSchemaCustomizationBase(args, {
    typeName: `Decoupla`,
    fieldName: `Decoupla`,
    url: endpoint,
    headers: {
      Authorization: `Bearer ${opts.token}`,
    },
  })
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const pluginOptionsSchema = ({ Joi }) =>
  Joi.object({
    workspace: Joi.string().required(),
    token: Joi.string().required(),
} )
