import { OperationsWorkspace } from "@/components/OperationsWorkspace";
import { PulseShell } from "@/components/PulseShell";
import { projectRows } from "@/lib/starterData";

export default function ProjectsPage() {
  return (
    <PulseShell
      activePage="projects"
      title="Projects"
      subtitle="Project execution, tasks, closeout, and job costing live here."
    >
      <OperationsWorkspace
        title="Projects"
        primaryAction="New Project"
        secondaryAction="Advance First"
        rows={projectRows}
        newRow={{
          id: "PRJ",
          title: "New approved project",
          customer: "New Customer",
          detail: "Job costing starts inside project",
          owner: "Project Manager User",
          status: "Ready",
          due: "2026-06-10",
          value: "$0"
        }}
        nextStatus="In Progress"
        valueLabel="Budget"
      />
    </PulseShell>
  );
}

