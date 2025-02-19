import { GraphQLObjectType, GraphQLNonNull } from "gatsby/graphql"

import { mapSchema, MapperKind, addTypes, modifyObjectFields } from "@graphql-tools/utils"

export class NamespaceUnderFieldTransform {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeName: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldName: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolver: any
  constructor({ typeName, fieldName, resolver }) {
    this.typeName = typeName
    this.fieldName = fieldName
    this.resolver = resolver
  }

  transformSchema(schema) {
    const queryConfig = schema.getQueryType().toConfig()

    const nestedQuery = new GraphQLObjectType({
      ...queryConfig,

      name: this.typeName,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let newSchema = addTypes(schema, [nestedQuery as any])

    const newRootFieldConfigMap = {
      [this.fieldName]: {
        type: new GraphQLNonNull(nestedQuery),

        resolve: (parent, args, context, info) => {
          if (this.resolver != null) {
            return this.resolver(parent, args, context, info)
          }

          return {}
        },
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;[newSchema] = modifyObjectFields(newSchema, queryConfig.name, () => true, newRootFieldConfigMap as any)

    return newSchema
  }
}

export class StripNonQueryTransform {
  transformSchema(schema) {
    return mapSchema(schema, {
      [MapperKind.MUTATION]() {
        return null
      },

      [MapperKind.SUBSCRIPTION]() {
        return null
      },
    })
  }
}
