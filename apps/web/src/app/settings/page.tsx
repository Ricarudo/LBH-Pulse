import { PulseShell } from "@/components/PulseShell";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";

export default function SettingsPage() {
  return (
    <PulseShell
      activePage="settings"
      title="Settings"
      subtitle="Starter workspace preferences and module scope controls."
    >
      <SettingsWorkspace />
    </PulseShell>
  );
}

