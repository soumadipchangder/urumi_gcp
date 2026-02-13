import path from 'path';
import { KubeConfig, AppsV1Api, CoreV1Api } from '@kubernetes/client-node';
import { spawn } from 'child_process';

const kc = new KubeConfig();
kc.loadFromDefault();

export const appsApi = kc.makeApiClient(AppsV1Api);
const coreApi = kc.makeApiClient(CoreV1Api);

export function helmInstallStore(opts: {
  storeId: string;
  namespace: string;
  engine: 'woocommerce' | 'medusa';
  mysqlPassword: string;
  mysqlRootPassword: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const releaseName = `store-${opts.storeId}`;
    // resolve chart path relative to workspace (keeps Helm invocation deterministic)
    const chartPath = path.resolve(__dirname, '..', '..', 'charts', 'store');

    const helmEnv = (process.env.HELM_ENV || 'local').toLowerCase();
    const valuesFile = path.resolve(__dirname, '..', '..', 'charts', 'store', `values-${helmEnv}.yaml`);

    const args: string[] = [
      'upgrade',
      '--install',
      releaseName,
      chartPath,
      '--namespace',
      opts.namespace,
      '--create-namespace',
      '-f',
      valuesFile,
      '--set',
      `storeId=${opts.storeId}`,
      '--set',
      `engine=${opts.engine}`,
      '--set',
      `mysql.password=${opts.mysqlPassword}`,
      '--set',
      `mysql.rootPassword=${opts.mysqlRootPassword}`,
      '--rollback-on-failure',
      '--timeout',
      '10m'
    ];

    const child = spawn('helm', args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`helm exited with code ${code}`));
    });
  });
}

export function helmUninstallStore(storeId: string, namespace: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const releaseName = `store-${storeId}`;
    const args = ['uninstall', releaseName, '--namespace', namespace];
    const child = spawn('helm', args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`helm uninstall exited with code ${code}`));
    });
  });
}

export async function deleteNamespaceAndWait(namespace: string, timeoutMs = 120000) {
  // Trigger deletion
  await coreApi.deleteNamespace(namespace).catch((err) => {
    // if namespace not found, treat as success
    if (err?.response?.statusCode === 404) return;
    // otherwise rethrow
    throw err;
  });

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await coreApi.readNamespace(namespace);
      // still exists — wait a bit
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    } catch (err: any) {
      // not found => deletion complete
      if (err?.response?.statusCode === 404) return;
      // other errors: keep retrying until timeout
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`namespace ${namespace} not deleted within timeout`);
}

export async function waitForWordpress(namespace: string) {
  const maxAttempts = 30;
  const delayMs = 10000;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await appsApi
      .readNamespacedDeployment('wordpress', namespace)
      .catch(() => null);
    const ready = (res?.body?.status?.readyReplicas as number | undefined) || 0;
    if (ready >= 1) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('WordPress not ready in time');
}

