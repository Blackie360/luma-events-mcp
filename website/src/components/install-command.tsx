"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const INSTALL_COMMAND = "npx -y luma-events setup";

type CopyState = "idle" | "copied" | "error";

export function InstallCommand({
  label = "Install command",
  animated = false,
}: {
  label?: string;
  animated?: boolean;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [typedLength, setTypedLength] = useState(
    animated ? 0 : INSTALL_COMMAND.length,
  );
  const [celebration, setCelebration] = useState(0);

  useEffect(() => {
    if (!animated) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const revealFrame = window.requestAnimationFrame(() => {
        setTypedLength(INSTALL_COMMAND.length);
      });
      return () => window.cancelAnimationFrame(revealFrame);
    }

    let nextLength = 0;
    const typingTimer = window.setInterval(() => {
      nextLength += 1;
      setTypedLength(nextLength);

      if (nextLength >= INSTALL_COMMAND.length) {
        window.clearInterval(typingTimer);
      }
    }, 48);

    return () => window.clearInterval(typingTimer);
  }, [animated]);

  useEffect(() => {
    if (copyState !== "copied") return;

    const resetTimer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(resetTimer);
  }, [copyState]);

  async function copyCommand() {
    try {
      await copyToClipboard(INSTALL_COMMAND);
      setCopyState("copied");
      setCelebration((value) => value + 1);
    } catch {
      setCopyState("error");
    }
  }

  const feedback =
    copyState === "copied"
      ? "Command copied"
      : copyState === "error"
        ? "Copy failed"
        : "Copy";

  return (
    <div
      className="command-shell"
      data-copy-state={copyState}
      data-typing={typedLength < INSTALL_COMMAND.length}
      aria-label={label}
    >
      <span className="command-prompt" aria-hidden="true">
        $
      </span>
      <code className="typed-command">
        <span aria-hidden="true">{INSTALL_COMMAND.slice(0, typedLength)}</span>
        <span className="sr-only">{INSTALL_COMMAND}</span>
      </code>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={copyCommand}
        aria-label={`${feedback}: ${INSTALL_COMMAND}`}
      >
        {copyState === "copied" ? (
          <CheckIcon data-icon="inline-start" />
        ) : (
          <CopyIcon data-icon="inline-start" />
        )}
        {feedback}
      </Button>
      {copyState === "copied" ? (
        <span className="copy-confetti" key={celebration} aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {copyState === "copied"
          ? "Installation command copied to clipboard."
          : copyState === "error"
            ? "Could not copy the installation command. Select the command manually."
            : ""}
      </span>
    </div>
  );
}
