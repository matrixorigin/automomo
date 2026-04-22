import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { prisma } from "@/lib/prisma"

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!membership) {
    redirect("/login")
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
