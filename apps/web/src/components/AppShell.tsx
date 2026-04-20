import Link from "next/link";
import React, { ReactNode } from "react";
import { Overview } from "@automomo/protocol";
import { StatusStrip } from "./StatusStrip";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/work-items", label: "Work Items" },
  { href: "/orchestration", label: "Orchestration" },
  { href: "/sessions", label: "Sessions" },
  { href: "/agents", label: "Agents" },
  { href: "/runtimes", label: "Runtimes" }
];

export function AppShell({ active, children, overview }: { active: string; children: ReactNode; overview?: Overview }) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="identity">
          <div className="mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>automomo</strong>
            <p>Codebase workspace</p>
          </div>
          <Link className="icon-button" aria-label="Settings" href="/settings">
            Setup
          </Link>
        </div>

        <nav className="nav-block" aria-label="Main">
          {navItems.map((item) => (
            <Link key={item.href} className={`nav-item ${active === item.label ? "active" : ""}`} href={item.href}>
              <span className="stack-icon" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="nav-section">
          <span>Runtime Tools</span>
        </div>
        <nav className="nav-block compact" aria-label="Runtime tools">
          <a className="nav-item" href="#handoffs">
            <span className="line-icon" aria-hidden="true" />
            Human Handoffs
          </a>
          <a className="nav-item" href="#outcomes">
            <span className="doc-icon" aria-hidden="true" />
            Outcomes
          </a>
          <a className="nav-item" href="#leases">
            <span className="hour-icon" aria-hidden="true" />
            Lease Queue
          </a>
        </nav>

        <div className="upgrade">
          <div>
            <strong>Local runtime</strong>
            <span>Pi adapter online</span>
          </div>
          <button type="button">Pair</button>
        </div>
      </aside>

      <main className="workspace">
        <StatusStrip overview={overview} />
        {children}
      </main>
    </div>
  );
}
