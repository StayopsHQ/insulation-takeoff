import "./_group.css";

export function Current() {
  return (
    <div className="jobs-current">
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        minHeight: 72,
        padding: "10px max(16px, calc((100vw - 900px) / 2))",
        background: "#fff",
        borderBottom: "1px solid #e4e9ef",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/__mockup/images/fulcher-logo.png" alt="Fulcher #1" style={{ width: "auto", height: 47, objectFit: "contain" }} />
          <span style={{ display: "flex", flexDirection: "column" }}>
            <strong style={{ color: "#102b4c", fontSize: 14, letterSpacing: ".035em" }}>INSULATION TAKEOFF</strong>
            <small style={{ color: "#718096", fontSize: 11, marginTop: 2 }}>Voice-first job calculator</small>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span>Greg</span>
          <button style={{ minHeight: 36, padding: "8px 0", border: 0, color: "#102b4c", background: "transparent" }}>Sign out</button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "22px 16px 70px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, margin: "10px 0 18px" }}>
          <div>
            <h1 style={{ margin: "10px 0 5px", fontSize: "clamp(25px, 5vw, 32px)" }}>Your jobs</h1>
            <p style={{ margin: "4px 0", color: "#656b80", lineHeight: 1.5 }}>Jobs are shared between authorized team accounts.</p>
          </div>
          <button style={{ minHeight: 44, padding: "12px 15px", border: 0, borderRadius: 12, background: "#102f55", color: "#fff", fontWeight: 650, whiteSpace: "nowrap" }}>+ New job</button>
        </div>

        <section style={{ display: "grid", gap: 10 }}>
          <button style={{
            display: "flex",
            width: "100%",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 5,
            padding: 17,
            border: "1px solid #dfe5ec",
            borderBottom: "3px solid #c51f39",
            borderRadius: 12,
            background: "#fff",
            color: "#102b4c",
            textAlign: "left",
            boxShadow: "0 4px 13px #102b4c10",
          }}>
            <strong style={{ fontSize: 18, fontWeight: 650 }}>Test</strong>
            <span style={{ color: "#6d7285" }}>NV · Linden Ct · 28</span>
            <small style={{ color: "#6d7285" }}>In progress · Updated 11/16/2026, 11:48 PM</small>
          </button>
        </section>
      </main>
    </div>
  );
}
