import { PulseShell } from "@/components/PulseShell";
import { WorkRecordWorkspace } from "@/components/WorkRecordWorkspace";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const initialTab = query?.tab === "files" || query?.tab === "updates"
    ? query.tab
    : "overview";

  return (
    <PulseShell
      activePage="projects"
      title="Project Workspace"
      subtitle="Delivery context, files, and lifecycle updates."
      compactHeader
    >
      <WorkRecordWorkspace stage="project" recordId={id} initialTab={initialTab} />
    </PulseShell>
  );
}
