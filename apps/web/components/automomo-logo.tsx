import * as React from "react"
import { cn } from "@/lib/utils"

export function AutomomoLogo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("h-4 w-4", className)}
      {...props}
    >
      <rect x="4" y="4" width="10" height="10" rx="3" fill="currentColor" />
      <rect x="18" y="4" width="10" height="10" rx="3" fill="currentColor" fillOpacity="0.58" />
      <rect x="4" y="18" width="10" height="10" rx="3" fill="currentColor" fillOpacity="0.58" />
      <rect x="18" y="18" width="10" height="10" rx="3" fill="currentColor" />
      <path d="M14 9h4M9 14v4M23 14v4M14 23h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
