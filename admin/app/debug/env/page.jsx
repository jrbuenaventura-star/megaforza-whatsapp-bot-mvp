// admin/app/debug/env/page.jsx

import React from "react";
import Ping from "./ping";

// Server Component: puede leer process.env en el servidor
export default function EnvDebugPage() {
  const base =
    process.env.NEXT_PUBLIC_API_BASE || "(NEXT_PUBLIC_API_BASE NO definido)";

  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Debug: NEXT_PUBLIC_API_BASE
      </h1>

      <div
        style={{
          background: "#f7f7f7",
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
          wordBreak: "break-all",
        }}
      >
        <div style={{ color: "#555", marginBottom: 4 }}>
          Valor leído en build/runtime (server):
        </div>
        <code>{base}</code>
      </div>

      <Ping />
    </div>
  );
}
