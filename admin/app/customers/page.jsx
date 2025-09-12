import { apiGet } from "@/lib/api";

async function getData() {
  // apiGet antepone /api al path y usa NEXT_PUBLIC_API_BASE
  return apiGet("/customers");
}

export default async function Page() {
  const data = await getData();

  return (
    <div>
      <h1>Clientes</h1>

      <table
        border={1}
        cellPadding={8}
        style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}
      >
        <thead>
          <tr>
            <th>name</th>
            <th>doc_type</th>
            <th>doc_number</th>
            <th>billing_email</th>
            <th>whatsapp_phone</th>
            <th>discount_pct</th>
            <th>created_at</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              <td>{row.name ?? ""}</td>
              <td>{row.doc_type ?? ""}</td>
              <td>{row.doc_number ?? ""}</td>
              <td>{row.billing_email ?? ""}</td>
              <td>{row.whatsapp_phone ?? ""}</td>
              <td>{row.discount_pct ?? 0}</td>
              <td>
                {row.created_at
                  ? new Date(row.created_at).toLocaleString("es-CO", {
                      timeZone: "America/Bogota",
                    })
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
