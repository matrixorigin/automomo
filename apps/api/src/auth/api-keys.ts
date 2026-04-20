import { ApiKey } from "@automomo/protocol";

export function tokenFromAuthorization(value: string | undefined | null) {
  if (!value) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1];
}

export function apiKeyCan(apiKey: ApiKey, action: string, codebaseId?: string) {
  return apiKey.scopes.some((scope) => {
    const actionMatches = scope.actions.includes(action) || scope.actions.includes("*");
    const codebaseMatches = codebaseId ? !scope.codebaseId || scope.codebaseId === codebaseId : !scope.codebaseId;
    return actionMatches && codebaseMatches;
  });
}
