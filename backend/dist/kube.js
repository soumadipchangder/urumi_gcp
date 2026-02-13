"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appsApi = void 0;
exports.helmInstallStore = helmInstallStore;
exports.helmUninstallStore = helmUninstallStore;
exports.deleteNamespaceAndWait = deleteNamespaceAndWait;
exports.waitForWordpress = waitForWordpress;
const path_1 = __importDefault(require("path"));
const client_node_1 = require("@kubernetes/client-node");
const child_process_1 = require("child_process");
const kc = new client_node_1.KubeConfig();
kc.loadFromDefault();
exports.appsApi = kc.makeApiClient(client_node_1.AppsV1Api);
const coreApi = kc.makeApiClient(client_node_1.CoreV1Api);
function helmInstallStore(opts) {
    return new Promise((resolve, reject) => {
        const releaseName = `store-${opts.storeId}`;
        // resolve chart path relative to workspace (keeps Helm invocation deterministic)
        const chartPath = path_1.default.resolve(__dirname, '..', '..', 'charts', 'store');
        const helmEnv = (process.env.HELM_ENV || 'local').toLowerCase();
        const valuesFile = path_1.default.resolve(__dirname, '..', '..', 'charts', 'store', `values-${helmEnv}.yaml`);
        const args = [
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
        const child = (0, child_process_1.spawn)('helm', args, { stdio: 'inherit' });
        child.on('exit', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`helm exited with code ${code}`));
        });
    });
}
function helmUninstallStore(storeId, namespace) {
    return new Promise((resolve, reject) => {
        const releaseName = `store-${storeId}`;
        const args = ['uninstall', releaseName, '--namespace', namespace];
        const child = (0, child_process_1.spawn)('helm', args, { stdio: 'inherit' });
        child.on('exit', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`helm uninstall exited with code ${code}`));
        });
    });
}
async function deleteNamespaceAndWait(namespace, timeoutMs = 120000) {
    // Trigger deletion
    await coreApi.deleteNamespace(namespace).catch((err) => {
        // if namespace not found, treat as success
        if (err?.response?.statusCode === 404)
            return;
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
        }
        catch (err) {
            // not found => deletion complete
            if (err?.response?.statusCode === 404)
                return;
            // other errors: keep retrying until timeout
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    throw new Error(`namespace ${namespace} not deleted within timeout`);
}
async function waitForWordpress(namespace) {
    const maxAttempts = 30;
    const delayMs = 10000;
    for (let i = 0; i < maxAttempts; i++) {
        const res = await exports.appsApi
            .readNamespacedDeployment('wordpress', namespace)
            .catch(() => null);
        const ready = res?.body?.status?.readyReplicas || 0;
        if (ready >= 1)
            return;
        await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error('WordPress not ready in time');
}
