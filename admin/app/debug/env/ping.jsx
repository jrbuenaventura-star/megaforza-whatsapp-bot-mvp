"use client";

import React from "react";

// LEE el valor embebido en el bundle del cliente (NEXT_PUBLIC_)
const base = process.env.NEXT_PUBLIC_API_BASE;

export default function Ping() {
  const [status, setStatus] = React.useState("comprobando…");
  const [health, setHealth] = React.useState(null);

  React.useEffect(() => {
    const url = `${base}/api/health`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        setHealth(j);
        setStatus(`OK (GET ${url})`);
      })
      .catch((e) => {
        setStatus(`ERROR: ${e.message}`);
      });
  }, []);

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        border: "1px solid #ddd",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Ping al backend</div>
      <div style={{ marginBottom: 8 }}>
        <strong>Estado:</strong> {status}
      </div>
      <pre
        style={{
          background: "#f7f7f7",
          padding: 12,
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        {JSON.stringify(health, null, 2)}
      </pre>
    </div>
  );
}
