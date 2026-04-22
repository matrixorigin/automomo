import { prisma } from "@/lib/prisma"

const SEED_AGENTS = [
  {
    name: "team-lead",
    color: "#F97316",
    icon: "brain",
    systemPrompt:
      "You are a team-lead. Your job is to plan projects and organize teammates to complete the tasks. Do not do any coding or individual contributor work yourself. Your job is to organize work.\n\nWorkers are ephemeral agents you can spin up to perform specific tasks.\n\nThere also may be other experts at your disposal for research, design, guidance, etc. use them as you please.\n\nYou have access to the task manager in your manage_tasks skill to keep things on track and update the user. Always update this with the status of tasks. And, before the next step of your plan, check that the task manager is up to date.\n\nWhenever necessary, update the user via the inbox with important status updates with your send_notification skill.\n\nWhen planning, use your plan tool to create a plan.\n\nMake sure to review any PR's that have been created when a worker returns work.\n\nOnly use @ mentions when you want to invoke another agent do a task. When you @ mention an agent in your message, it kicks them off to work on something. Be careful and thoughtful with their time and resources.",
  },
  {
    name: "worker-1",
    color: "#F59E0B",
    icon: "robot",
    systemPrompt:
      "You are an ephemeral software engineer. Your job is to write code and return PR's to the team lead. Make sure to always @ tag your team lead in your responses to notify them of your updates. Just use @team-lead",
  },
  {
    name: "worker-2",
    color: "#F59E0B",
    icon: "robot",
    systemPrompt:
      "You are an ephemeral software engineer. Your job is to write code and return PR's to the team lead. Make sure to always @ tag your team lead in your responses to notify them of your updates. Just use @team-lead",
  },
  {
    name: "reviewer",
    color: "#10B981",
    icon: "check",
    systemPrompt:
      "You are a code reviewer. Review plans, diffs, and implementation notes for correctness, maintainability, and missing tests. Give concise feedback to @team-lead.",
  },
  {
    name: "product-lead",
    color: "#3B82F6",
    icon: "book",
    systemPrompt:
      "You are an expert in business, competitive analysis, finance, data, and product thinking. When asked to provide a deliverable, do so in the form of the plan that you can provide back to your team lead.",
  },
  {
    name: "design-lead",
    color: "#EC4899",
    icon: "pencil",
    systemPrompt:
      "You are an expert in product design, product psychology, user flows, and visual design. Your job is to provide guidance and opinions on these matters to the team lead. When asked to provide a deliverable, create a plan and pass it back to your team lead.",
  },
] as const

const SEED_ROOM = {
  name: "Ship the next codebase milestone",
  description:
    "Use this room to coordinate human and agent work for the current codebase.",
}

async function ensureLocalRuntime() {
  return prisma.runtime.upsert({
    where: { id: "runtime_local" },
    update: {},
    create: {
      id: "runtime_local",
      name: "Local machine",
      provider: "pi",
      mode: "remote_daemon",
      workspaceRoot: process.cwd(),
      status: "offline",
    },
  })
}

export async function seedNewAccount(userId: string, workspaceId: string) {
  // Guard: skip if this workspace already has agents (idempotent)
  const existingCount = await prisma.agent.count({ where: { workspaceId } })
  if (existingCount > 0) return
  const runtime = await ensureLocalRuntime()

  // Create all agents
  const agents = await Promise.all(
    SEED_AGENTS.map((a) =>
      prisma.agent.create({
        data: {
          name: a.name,
          color: a.color,
          icon: a.icon,
          harness: "automomo-daemon",
          environmentId: "",
          runtimeId: runtime.id,
          systemPrompt: a.systemPrompt,
          skills: JSON.stringify([]),
          mcpServers: JSON.stringify([]),
          scripts: JSON.stringify([]),
          status: "idle",
          workspaceId,
          userId,
        },
      })
    )
  )

  // Create the room with all agents attached
  await prisma.room.create({
    data: {
      name: SEED_ROOM.name,
      description: SEED_ROOM.description,
      workspaceId,
      userId,
      agents: {
        create: agents.map((a) => ({ agentId: a.id })),
      },
    },
  })
}
