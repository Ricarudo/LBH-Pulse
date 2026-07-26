import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const inputFromStdin = process.argv[2] === "--stdin";
const config = inputFromStdin
  ? JSON.parse(readFileSync(0, "utf8"))
  : (() => {
      const envFile = process.argv[2] || ".env.production";
      const result = spawnSync(
        "docker",
        ["compose", "--env-file", envFile, "-f", "compose.production.yaml", "config", "--format", "json"],
        { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
      );
      if (result.status !== 0) throw new Error("Production Compose interpolation failed; inspect the required variable names above.");
      return JSON.parse(result.stdout);
    })();
const failures = [];
const services = config.services || {};
const publicServices = Object.entries(services).filter(([, service]) => Array.isArray(service.ports) && service.ports.length);
if (publicServices.length !== 1 || publicServices[0]?.[0] !== "gateway") {
  failures.push("only the gateway may publish host ports");
}

const gatewayTargets = new Set((services.gateway?.ports || []).map((port) => `${port.target}/${port.protocol || "tcp"}`));
for (const required of ["80/tcp", "443/tcp", "443/udp"]) {
  if (!gatewayTargets.has(required)) failures.push(`gateway is missing ${required}`);
}

const forbiddenCommand = /(?:tsx\s+watch|next\s+dev|npm\s+(?:ci|install)|nodemon|--watch)/i;
for (const [name, service] of Object.entries(services)) {
  const command = Array.isArray(service.command) ? service.command.join(" ") : String(service.command || "");
  if (forbiddenCommand.test(command)) failures.push(`${name} contains a development or startup-install command`);
  for (const volume of service.volumes || []) {
    if (volume.type === "bind") failures.push(`${name} uses a source bind mount`);
  }
}

for (const name of ["api", "web"]) {
  const service = services[name];
  if (!service) {
    failures.push(`${name} service is missing`);
    continue;
  }
  if (service.build?.target !== "production") failures.push(`${name} does not use its production image target`);
  if (service.restart !== "unless-stopped") failures.push(`${name} lacks the production restart policy`);
  if (!service.read_only) failures.push(`${name} root filesystem is writable`);
  if (!service.healthcheck?.test) failures.push(`${name} lacks an explicit health check`);
  if (!(service.cap_drop || []).includes("ALL")) failures.push(`${name} does not drop Linux capabilities`);
}

if (services.api?.environment?.NODE_ENV !== "production") failures.push("API NODE_ENV is not production");
if (services.web?.environment?.NODE_ENV !== "production") failures.push("web NODE_ENV is not production");
if (!config.networks?.backend?.internal || !config.networks?.frontend?.internal) {
  failures.push("application networks are not internal");
}
if (services.postgres?.ports?.length) failures.push("PostgreSQL publishes a host port");
if (services.minio?.ports?.length) failures.push("MinIO publishes a host port");

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  throw new Error("Production Compose policy validation failed.");
}
console.log("Production Compose policy validation passed: immutable app targets, no bind mounts/dev commands, internal data services, gateway-only ports.");
