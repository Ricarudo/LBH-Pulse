import { PulseShell } from "@/components/PulseShell";
import {
  SettingsWorkspace,
  type SettingsSection
} from "@/components/SettingsWorkspace";

const sections = new Set<SettingsSection>([
  "account",
  "appearance",
  "privacy",
  "general",
  "users",
  "roles",
  "audit",
  "request-checklists",
  "roadmap"
]);

export default async function SettingsSectionPage({
  params
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const active = sections.has(section as SettingsSection)
    ? section as SettingsSection
    : "account";
  return (
    <PulseShell activePage="settings" title="Settings" compactHeader>
      <SettingsWorkspace section={active} />
    </PulseShell>
  );
}
