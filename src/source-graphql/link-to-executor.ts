import { ApolloLink, execute, toPromise } from "@apollo/client/core"
import { getOperationASTFromRequest, observableToAsyncIterable } from "@graphql-tools/utils"

// Use Apollo's core entry point: server-side schema loading does not need React.
export const linkToExecutor = (link: ApolloLink) => (request) => {
  const result = execute(link, {
    query: request.document,
    operationName: request.operationName,
    variables: request.variables,
    context: { graphqlContext: request.context, graphqlResolveInfo: request.info, clientAwareness: {} },
    extensions: request.extensions,
  })
  return getOperationASTFromRequest(request).operation === "subscription"
    ? observableToAsyncIterable(result)
    : toPromise(result)
}
