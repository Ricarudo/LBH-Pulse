import { PulseShell } from "@/components/PulseShell";
import { WorkRecordsWorkspace } from "@/components/WorkRecordsWorkspace";

export default function ProjectsPage() {
  return (
    <PulseShell
      activePage="projects"
      title="Projects"
      subtitle="Project execution, tasks, closeout, and job costing live here."
    >
      <WorkRecordsWorkspace kind="projects" title="Projects" valueLabel="Budget" />
    </PulseShell>
  );
}
