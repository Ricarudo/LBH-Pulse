import { PulseShell } from "@/components/PulseShell";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";

export default function SettingsPage() {
  return (
    <PulseShell activePage="settings" title="Settings" compactHeader>
      <SettingsWorkspace section="account" />
    </PulseShell>
  );
}
