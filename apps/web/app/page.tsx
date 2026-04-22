import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { AutomomoLogo } from "@/components/automomo-logo"
import { Button } from "@/components/ui/button"

export default async function Page() {
  const session = await auth()
  if (session?.user) {
    redirect("/home")
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-7 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border bg-card">
            <AutomomoLogo className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">automomo</h1>
            <p className="text-sm text-muted-foreground">
              Human and AI rooms for codebase work.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
