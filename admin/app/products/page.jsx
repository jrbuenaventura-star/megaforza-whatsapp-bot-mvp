// admin/app/products/page.jsx
"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../lib/api";

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await apiGet("/products"); // <- IMPORTANTE: /api/products lo añade el helper
        if (alive) setProducts(list);
      } catch (e) {
        setError(e.message || "Error cargando productos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function saveRow(p) {
    try {
      setSavingId(p.id);
      await apiPatch(`/products/${p.id}`, {
        price_per_bag: Number(p.price_per_bag),
        active: !!p.active,
      }); // <- IMPORTANTE: /api/products/:id lo añade el helper
    } catch (e) {
      alert(e.message || "Error guardando producto");
    } finally {
      setSavingId(null);
    }
  }

  function updateField(id, key, value) {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: value } : p))
    );
  }

  if (loading) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (error) return <p style={{ padding: 24, color: "crimson" }}>{error}</p>;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
        Productos
      </h1>

      <table style={{ width: "100%", borderCollapse: "collapse" }} border={1}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>SKU</th>
            <th style={{ textAlign: "left", padding: 8 }}>Nombre</th>
            <th style={{ textAlign: "right", padding: 8 }}>Precio/Bulto</th>
            <th style={{ textAlign: "center", padding: 8 }}>Activo</th>
            <th style={{ textAlign: "center", padding: 8 }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td style={{ padding: 8 }}>{p.sku}</td>
              <td style={{ padding: 8 }}>{p.name}</td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <input
                  type="number"
                  value={p.price_per_bag ?? ""}
                  onChange={(e) =>
                    updateField(p.id, "price_per_bag", e.target.value)
                  }
                  style={{ width: 120, textAlign: "right" }}
                />
              </td>
              <td style={{ padding: 8, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={!!p.active}
                  onChange={(e) => updateField(p.id, "active", e.target.checked)}
                />
              </td>
              <td style={{ padding: 8, textAlign: "center" }}>
                <button onClick={() => saveRow(p)} disabled={savingId === p.id}>
                  {savingId === p.id ? "Guardando…" : "Guardar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
