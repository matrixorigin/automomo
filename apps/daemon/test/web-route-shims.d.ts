declare module "@/app/api/daemon/events/route" {
  export function POST(request: Request): Promise<Response>;
}

declare module "@/app/api/daemon/fail/route" {
  export function POST(request: Request): Promise<Response>;
}

declare module "@/app/api/daemon/heartbeat/route" {
  export function POST(request: Request): Promise<Response>;
}

declare module "@/app/api/daemon/lease/route" {
  export function POST(request: Request): Promise<Response>;
}

declare module "@/app/api/daemon/lease/renew/route" {
  export function POST(request: Request): Promise<Response>;
}

declare module "@/app/api/daemon/outcome/route" {
  export function POST(request: Request): Promise<Response>;
}

declare module "@/app/api/daemon/register/route" {
  export function POST(request: Request): Promise<Response>;
}

declare module "@/lib/prisma" {
  export const prisma: any;
  export function disconnectPrismaForTests(): Promise<void>;
}
