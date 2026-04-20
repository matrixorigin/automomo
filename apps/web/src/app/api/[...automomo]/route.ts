import { proxyAutomomoRequest } from "./proxy";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return proxyAutomomoRequest(request);
}

export function POST(request: Request) {
  return proxyAutomomoRequest(request);
}

export function PUT(request: Request) {
  return proxyAutomomoRequest(request);
}

export function PATCH(request: Request) {
  return proxyAutomomoRequest(request);
}

export function DELETE(request: Request) {
  return proxyAutomomoRequest(request);
}
