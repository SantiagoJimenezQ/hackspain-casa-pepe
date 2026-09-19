import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Casa Pepe — autonomous incident coordination dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATUS = [
  { color: "#3ee08f", label: "operational" },
  { color: "#f5a524", label: "migrating" },
  { color: "#f04444", label: "offline" },
];

const avatar = await readFile(join(process.cwd(), "public/agents/pepe-round.png"));
const avatarSource = `data:image/png;base64,${avatar.toString("base64")}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#141414",
          position: "relative",
        }}
      >
        {/* Satori only honours gradients through backgroundImage, and it drops radial ones. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage: "linear-gradient(225deg, rgba(240,68,68,0.30) 0%, rgba(20,20,20,0) 55%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage: "linear-gradient(45deg, rgba(62,224,143,0.20) 0%, rgba(20,20,20,0) 48%)",
          }}
        />

        <div style={{ display: "flex", height: 8 }}>
          {STATUS.map((status) => (
            <div key={status.label} style={{ display: "flex", flex: 1, background: status.color }} />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "64px 80px 68px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <img src={avatarSource} width={128} height={128} alt="" style={{ borderRadius: 999 }} />
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 30 }}>
              <div
                style={{
                  fontSize: 84,
                  fontWeight: 700,
                  color: "#f5f5f5",
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                Casa Pepe
              </div>
              <div
                style={{
                  fontSize: 21,
                  color: "#8a8a8a",
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  marginTop: 14,
                }}
              >
                Incident coordination
              </div>
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 40, color: "#d4d4d4", lineHeight: 1.32, maxWidth: 900 }}>
            Detects the outage, calls the on-call engineer and drives the recovery — every decision visible
            as it happens.
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            {STATUS.map((status) => (
              <div
                key={status.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginRight: 18,
                  padding: "11px 22px 11px 17px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 13,
                    height: 13,
                    borderRadius: 999,
                    background: status.color,
                    marginRight: 11,
                  }}
                />
                <div style={{ fontSize: 23, color: "#b5b5b5", letterSpacing: "0.05em" }}>{status.label}</div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                marginLeft: "auto",
                fontSize: 23,
                color: "#6f6f6f",
                letterSpacing: "0.2em",
              }}
            >
              LIVE OPERATIONS
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
