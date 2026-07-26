// Retained as an explicit safety stop for operators who used the pre-0.1 command.
// RequestUpdate adoption is handled by the reviewed baseline and the dedicated
// compatibility preview. Historical compatibility SQL must never be replayed.

const apply = process.argv.includes("--apply");

console.log(JSON.stringify({
  mode: apply ? "APPLY_REFUSED" : "PREVIEW",
  status: "retired",
  changes: 0,
  reason: "The historical RequestUpdate migration is not replay-safe and was retired for Pulse 0.1.",
  nextStep: "Run npm run compatibility:checklists:preview and review the baseline adoption runbook."
}, null, 2));

if (apply) {
  console.error("Refusing to reapply historical RequestUpdate compatibility SQL.");
  process.exitCode = 2;
}
