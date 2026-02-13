import React, { useEffect, useState } from 'react';
import './style.css';

type Store = {
  id: string;
  name: string;
  engine: string;
  status: string;
  url?: string | null;
  error?: string | null;
  createdAt: string;
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState('');
  const [engine, setEngine] = useState('woocommerce');
  const [loading, setLoading] = useState(false);

  async function fetchStores() {
    try {
      const res = await fetch(`${API_URL}/stores`);
      const data = (await res.json()) as Store[];
      setStores(data);
    } catch (e) {
      console.error('Failed to load stores', e);
    }
  }

  useEffect(() => {
    fetchStores();
    const id = setInterval(fetchStores, 5000);
    return () => clearInterval(id);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    try {
      await fetch(`${API_URL}/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, engine })
      });
      setName('');
      await fetchStores();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`${API_URL}/stores/${id}`, { method: 'DELETE' });
    await fetchStores();
  }

  return (
    <div className="app-root">
      <h1 className="title">Store Provisioning Dashboard</h1>

      <form className="form-row" onSubmit={handleCreate}>
        <input
          className="input"
          placeholder="Store name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="input"
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
        >
          <option value="woocommerce">WooCommerce</option>
          <option value="medusa" disabled>
            Medusa (coming soon)
          </option>
        </select>
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create Store'}
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Engine</th>
            <th>Status</th>
            <th>URL</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.engine}</td>
              <td>{s.status}</td>
              <td>
                {s.url && s.status === 'READY' && (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
                {s.error && <div className="error-text">{s.error}</div>}
              </td>
              <td>{new Date(s.createdAt).toLocaleString()}</td>
              <td>
                <button className="button danger" onClick={() => handleDelete(s.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {stores.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                No stores yet. Create one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

