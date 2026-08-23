"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const prompts = [
  "List upcoming events and flag waitlists.",
  "Preview moving Build Night to 5 PM and notifying approved guests.",
  "Summarize registrations without exposing guest identities.",
];

export function PromptExamples() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyPrompt(prompt: string, index: number) {
    try {
      await copyToClipboard(prompt);
      setCopyFailed(false);
      setCopiedIndex(index);
    } catch {
      setCopiedIndex(null);
      setCopyFailed(true);
    }
  }

  return (
    <div className="prompt-deck" data-reveal>
      <div className="prompt-deck-heading">
        <span className="section-kicker">Try a real operation</span>
        <p>Copy a prompt. Keep the final say.</p>
      </div>

      <div className="prompt-grid">
        {prompts.map((prompt, index) => {
          const isCopied = copiedIndex === index;

          return (
            <Card className="prompt-card" key={prompt}>
              <CardHeader>
                <CardTitle>
                  <span>Prompt 0{index + 1}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>“{prompt}”</p>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => copyPrompt(prompt, index)}
                  aria-label={`${isCopied ? "Copied" : "Copy prompt"}: ${prompt}`}
                >
                  {isCopied ? (
                    <CheckIcon data-icon="inline-start" aria-hidden="true" />
                  ) : (
                    <CopyIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {isCopied ? "Copied" : "Copy prompt"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <span className="sr-only" aria-live="polite">
        {copiedIndex !== null
          ? `Prompt ${copiedIndex + 1} copied to clipboard.`
          : copyFailed
            ? "Could not copy the prompt. Select it manually."
            : ""}
      </span>
    </div>
  );
}
