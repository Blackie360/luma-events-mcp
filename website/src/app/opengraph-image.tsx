import { ImageResponse } from "next/og";

export const alt = "Luma Events — safe event operations from your AI workspace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#070A12",
        color: "#F4F7FF",
        padding: "64px 72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #3B82F6, #D8FF3E)",
            color: "#070A12",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          L
        </div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Luma Events</div>
        <div
          style={{
            marginLeft: "auto",
            border: "1px solid #283247",
            borderRadius: 999,
            padding: "10px 18px",
            color: "#9CA8BC",
            fontSize: 18,
          }}
        >
          MCP server
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ color: "#60A5FA", fontSize: 22 }}>
          Prompt → Preview → Confirm → Complete
        </div>
        <div
          style={{
            maxWidth: 940,
            fontSize: 68,
            lineHeight: 1.02,
            letterSpacing: "-3px",
            fontWeight: 700,
          }}
        >
          Your Luma calendar, now agent-operable.
        </div>
      </div>
      <div style={{ color: "#9CA8BC", fontSize: 22 }}>
        Safe event operations from Codex, Cursor, Claude Code, Gemini CLI, and Grok CLI.
      </div>
    </div>,
    size,
  );
}
