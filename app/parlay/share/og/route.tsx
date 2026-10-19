import { ImageResponse } from "next/og";
import { decodeParlay, riskLabel } from "@/lib/share";

const RISK_COLOR: Record<string, string> = {
  "Low risk": "#22c55e",
  "Medium risk": "#fbbf24",
  "High risk": "#f87171",
  "Very high risk": "#f87171",
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// The preview card shown when a shared parlay link is pasted into WhatsApp,
// Telegram and similar apps. Only flexbox layouts work here.
export async function GET(request: Request) {
  const d = new URL(request.url).searchParams.get("d");
  const parlay = d ? await decodeParlay(d) : null;
  const size = { width: 1200, height: 630 };

  if (!parlay) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#090d12",
            color: "#e8edf3",
            fontSize: 56,
          }}
        >
          Football Dashboard · Parlay builder
        </div>
      ),
      size,
    );
  }

  const risk = riskLabel(parlay.chance).label;
  const shown = parlay.picks.slice(0, 6);
  const more = parlay.picks.length - shown.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#090d12",
          color: "#e8edf3",
          padding: "48px 56px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, color: "#8b9bb0" }}>
          <div style={{ display: "flex" }}>Football Dashboard · Parlay builder</div>
          <div style={{ display: "flex", color: RISK_COLOR[risk] ?? "#fbbf24", fontWeight: 700 }}>{risk}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 20 }}>
          <div style={{ display: "flex", fontSize: 128, fontWeight: 800, color: "#34d399", lineHeight: 1 }}>
            {`x${parlay.odds.toFixed(2)}`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 36, marginBottom: 8, fontSize: 32, color: "#8b9bb0" }}>
            <div style={{ display: "flex" }}>{`${parlay.picks.length}-leg ${parlay.plan.toLowerCase()} parlay`}</div>
            <div style={{ display: "flex" }}>{`${(parlay.chance * 100).toFixed(1)}% chance all hit`}</div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            borderTop: "2px solid #232d3a",
          }}
        >
          {shown.map((p, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 30,
                padding: "11px 0",
                borderBottom: "1px solid #232d3a",
              }}
            >
              <div style={{ display: "flex" }}>{clip(`${p.pick} · ${p.match}`, 58)}</div>
              <div style={{ display: "flex", fontWeight: 700, color: "#34d399" }}>{p.odds.toFixed(2)}</div>
            </div>
          ))}
          {more > 0 && (
            <div style={{ display: "flex", fontSize: 26, color: "#8b9bb0", paddingTop: 12 }}>{`+ ${more} more ${more === 1 ? "leg" : "legs"}`}</div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
