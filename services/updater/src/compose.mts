import type { Installation } from './store.mts';
import type { Manifest } from './release.mts';
import { requireThat, digest } from './release.mts';

type Service = Record<string, any>;
export type Deployment = { schemaVersion: 1; compose: { services: Record<string, Service>; networks: Record<string, any>; volumes: Record<string, any> } };
export function parseDeployment(bytes: Uint8Array, manifest: Manifest): Deployment {
  requireThat(digest(bytes) === manifest.deployment.sha256, 'BUNDLE_HASH_MISMATCH');
  const deployment = JSON.parse(Buffer.from(bytes).toString('utf8')) as Deployment;
  requireThat(deployment?.schemaVersion === 1 && deployment.compose?.services?.api && deployment.compose.services.web, 'INVALID_DEPLOYMENT');
  // The bundle is signed, but these invariants remain mandatory across releases.
  for (const [name, service] of Object.entries(deployment.compose.services)) {
    requireThat(!service.privileged && !service.pid && (!service.network_mode || service.network_mode === 'none') && !service.devices && !service.volumes_from, 'UNSAFE_DEPLOYMENT');
    requireThat(!(service.ports?.length) || name === 'gateway', 'UNSAFE_DEPLOYMENT');
    requireThat(!(service.volumes || []).some((v: any) => JSON.stringify(v).includes('docker.sock')), 'UNSAFE_DEPLOYMENT');
  }
  return deployment;
}
export function imageEnvironment(m: Manifest, mode: Installation['mode']) {
  return {
    PULSE_RELEASE_TAG: m.version, PULSE_API_IMAGE: m.images.api, PULSE_WEB_IMAGE: m.images.web,
    PULSE_MAINTENANCE_IMAGE: m.images.maintenance, PULSE_GATEWAY_IMAGE: mode === 'public' ? m.images.gatewayPublic : m.images.gatewayInternal,
    PULSE_MINIO_IMAGE: m.images.minio, PULSE_POSTGRES_IMAGE: m.images.postgres, PULSE_MINIO_INIT_IMAGE: m.images.minioInit,
    PULSE_MINIO_MC_IMAGE: m.images.minioMc, PULSE_CLAMAV_IMAGE: m.images.clamav, PULSE_BACKUP_CRYPTO_IMAGE: m.images.backupCrypto
  };
}
export function renderCompose(bundle: Deployment, manifest: Manifest, install: Installation, restore?: {project: string; postgres: string; minio: string}) {
  const result = { services: structuredClone(bundle.compose.services), networks: structuredClone(bundle.compose.networks), volumes: structuredClone(bundle.compose.volumes), name: restore?.project ?? install.project };
  const mapping: Record<string,string> = { postgres: manifest.images.postgres, minio: manifest.images.minio, 'minio-init': manifest.images.minioInit, clamav: manifest.images.clamav, api: manifest.images.api, web: manifest.images.web, gateway: install.mode === 'public' ? manifest.images.gatewayPublic : manifest.images.gatewayInternal, 'minio-backup': manifest.images.minioMc, 'minio-restore': manifest.images.minioMc, 'backup-encrypt': manifest.images.backupCrypto, 'backup-decrypt': manifest.images.backupCrypto };
  for (const [name, service] of Object.entries(result.services)) {
    if (['bootstrap-admin','credential-containment'].includes(name)) { delete result.services[name]; continue; }
    delete service.build;
    service.image = mapping[name] ?? manifest.images.maintenance;
    service.platform = 'linux/amd64';
    if (!mapping[name]) requireThat(service.profiles?.includes('maintenance'), 'UNKNOWN_DEPLOYMENT_SERVICE');
    // No application/service container resolves host paths supplied by an API.
    service.volumes = (service.volumes || []).map((v: any) => {
      const targets: Record<string,string> = { '/backup': 'update-work', '/restore': 'update-work', '/archives': 'update-archives', '/run/secrets/age-identity': 'update-secrets', '/run/secrets/bootstrap-password': 'disabled-input', '/run/secrets/credential-containment.json': 'disabled-input' };
      if (!targets[v.target]) { requireThat(v.type !== 'bind','UNEXPECTED_BIND_MOUNT'); return v; }
      requireThat(targets[v.target], 'UNEXPECTED_BIND_MOUNT');
      return { type: 'volume', source: targets[v.target], target: v.target === '/run/secrets/age-identity' ? '/run/pulse-recovery' : v.target, read_only: Boolean(v.read_only) };
    });
    if (name === 'api') {
      service.environment.PULSE_MAINTENANCE_FILE = '/run/pulse/state.json';
      service.environment.PULSE_UPDATER_URL = 'http://pulse-updater:9050';
      service.environment.PULSE_UPDATER_TOKEN_FILE = '/run/pulse-auth/token';
      service.volumes.push({ type: 'volume', source: 'update-status', target: '/run/pulse', read_only: true }, { type: 'volume', source: 'update-auth', target: '/run/pulse-auth', read_only: true });
      service.networks = { backend: {}, control: {} };
    }
    if (name === 'gateway') service.volumes.push({ type: 'volume', source: 'update-status', target: '/etc/caddy/managed', read_only: true });
  }
  for (const [key, name] of Object.entries({ 'postgres-data': restore?.postgres ?? install.postgresVolume, 'minio-data': restore?.minio ?? install.minioVolume, 'caddy-data': install.caddyDataVolume, 'caddy-config': install.caddyConfigVolume })) result.volumes[key] = { name, external: !restore || key.startsWith('caddy') };
  result.volumes['update-work'] = { name: `${install.project}-update-work`, external: true };
  result.volumes['update-status'] = { name: `${install.project}-update-status`, external: true };
  result.volumes['update-auth'] = { name: `${install.project}-update-auth`, external: true };
  result.volumes['update-secrets'] = { name: `${install.project}-update-secrets`, external: true };
  result.volumes['disabled-input'] = { name: `${install.project}-disabled-input`, external: true };
  // Backup jobs use --volumes-from the updater to get /backups; service mounts
  // must not accidentally resolve a Windows host path inside the Linux VM.
  delete result.services['backup-encrypt']; delete result.services['backup-decrypt'];
  delete result.volumes['update-archives'];
  result.networks.control = { name: `${install.project}-control`, external: true };
  for (const [key,network] of Object.entries(result.networks)) if (key !== 'control') network.name = `${result.name}_${key}`;
  result.volumes['clamav-data'] = { name: `${result.name}_clamav-data` };
  result.networks.frontend = { name: `${install.project}_frontend`, external: true };
  if (restore) {
    delete result.services.gateway; delete result.services.web; delete result.services.api;
    for (const service of Object.values(result.services)) delete service.depends_on;
    // Restore provisioning must address isolated storage, never the live stack.
    result.networks = { backend: { internal: true } };
  }
  return result;
}

export function managerCompose(install: Installation, updaterImage: string) {
  const common = { image: updaterImage, platform: 'linux/amd64', restart: 'unless-stopped', init: true, read_only: true, tmpfs: ['/tmp'], security_opt: ['no-new-privileges:true'], cap_drop: ['ALL'] };
  return { name: install.project, services: {
    updater: { ...common, container_name: `${install.project}-updater`, command: ['serve'], environment: { PULSE_PROJECT: install.project }, networks: { control: { aliases: ['pulse-updater'] }, egress: {} }, volumes: [
      { type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock' },
      { type: 'bind', source: install.backupSource, target: '/backups' },
      ...['state', 'status', 'auth', 'secrets', 'work'].map(n => ({ type: 'volume', source: n, target: `/${n}` }))
    ], healthcheck: { test: ['CMD', 'node', '/opt/pulse/src/main.mts', 'ping'], interval: '5s', timeout: '3s', retries: 24 } },
    'update-status': { ...common, user: '1000:1000', command: ['status-server'], networks: { frontend: { aliases: ['pulse-update-status'] } }, volumes: [{ type: 'volume', source: 'status', target: '/status', read_only: true }], healthcheck: { test: ['CMD', 'node', '/opt/pulse/src/main.mts', 'status-ping'], interval: '5s', timeout: '3s', retries: 24 } }
  }, networks: { control: { name: `${install.project}-control`, external: true }, frontend: { name: `${install.project}_frontend`, external: true }, egress: {} }, volumes: Object.fromEntries(['state','status','auth','secrets','work'].map(n => [n, { name: `${install.project}-update-${n}`, external: true }])) };
}
