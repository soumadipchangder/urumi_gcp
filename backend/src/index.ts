import express from 'express';
import cors from 'cors';
import { db } from './db';
import crypto from 'crypto';
import { helmInstallStore, helmUninstallStore, waitForWordpress, deleteNamespaceAndWait } from './kube';

const app = express();
app.use(cors());
app.use(express.json());

type StoreRow = {
  id: string;
  name: string;
  engine: string;
  status: string;
  url: string | null;
  error: string | null;
  createdAt: string;
};

const INSERT_STORE = db.prepare(`
  INSERT INTO stores (id, name, engine, status, url, error, createdAt)
  VALUES (@id, @name, @engine, @status, @url, @error, @createdAt)
`);
const UPDATE_STATUS = db.prepare(
  `UPDATE stores SET status=@status, error=@error, url=@url WHERE id=@id`
);
const LIST_STORES = db.prepare(`SELECT * FROM stores ORDER BY datetime(createdAt) DESC`);
const GET_STORE = db.prepare(`SELECT * FROM stores WHERE id = ?`);
const DELETE_STORE_ROW = db.prepare(`DELETE FROM stores WHERE id = ?`);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/stores', (_req, res) => {
  const rows = LIST_STORES.all() as StoreRow[];
  res.json(rows);
});

app.post('/stores', async (req, res) => {
  const { name, engine } = req.body as { name?: string; engine?: string };
  if (!name || !engine) {
    return res.status(400).json({ error: 'name and engine required' });
  }

  if (engine !== 'woocommerce' && engine !== 'medusa') {
    return res.status(400).json({ error: 'engine must be woocommerce or medusa' });
  }

  const id = crypto.randomUUID().split('-')[0];
  const namespace = `store-${id}`;
  const now = new Date().toISOString();

  const helmEnv = (process.env.HELM_ENV || 'local').toLowerCase();
  const baseDomain = helmEnv === 'prod' ? 'example.com' : 'localtest.me';
  const host = `${namespace}.${baseDomain}`;

  // generate DB credentials (secure, per-request)
  const dbPassword = crypto.randomBytes(16).toString('hex');
  const rootPassword = crypto.randomBytes(16).toString('hex');

  INSERT_STORE.run({
    id,
    name,
    engine,
    status: 'PROVISIONING',
    url: `http://${host}`,
    error: null,
    createdAt: now
  });

  res.status(202).json({ id, status: 'PROVISIONING' });

  try {
    await helmInstallStore({
      storeId: id,
      namespace,
      engine: engine as any,
      mysqlPassword: dbPassword,
      mysqlRootPassword: rootPassword
    });

    await waitForWordpress(namespace);
    UPDATE_STATUS.run({ id, status: 'READY', error: null, url: `http://${host}` });
  } catch (err: any) {
    UPDATE_STATUS.run({
      id,
      status: 'FAILED',
      error: err?.message ?? 'provisioning failed',
      url: null
    });
  }
});

app.delete('/stores/:id', async (req, res) => {
  const { id } = req.params;
  const row = GET_STORE.get(id) as StoreRow | undefined;
  if (!row) {
    return res.status(404).json({ error: 'not found' });
  }

  UPDATE_STATUS.run({ id, status: 'DELETING', error: null, url: row.url });
  res.status(202).json({ id, status: 'DELETING' });

  const namespace = `store-${id}`;

  try {
    // uninstall Helm release first
    await helmUninstallStore(id, namespace);

    // delete the namespace and wait until it's fully removed (prevents orphaned resources/PVCs)
    await deleteNamespaceAndWait(namespace);

    // only now remove the metadata row from the DB
    DELETE_STORE_ROW.run(id);
  } catch (err: any) {
    UPDATE_STATUS.run({
      id,
      status: 'FAILED',
      error: err?.message ?? 'delete failed',
      url: row.url
    });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Orchestrator listening on port ${port}`);
});

