import type { LucideIcon } from "lucide-react";
import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  CalendarCheckIcon,
  GitForkIcon,
  ScanSearchIcon,
  SendIcon,
  ShieldCheckIcon,
  TerminalSquareIcon,
  TicketCheckIcon,
  UserRoundCogIcon,
  UsersRoundIcon,
} from "lucide-react";
import Image from "next/image";

import { InstallCommand } from "@/components/install-command";
import { MotionOrchestrator } from "@/components/motion-orchestrator";
import { PromptExamples } from "@/components/prompt-examples";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getNpmDownloadStats } from "@/lib/npm-stats";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/Blackie360/luma-events-mcp";
const NPM_URL = "https://www.npmjs.com/package/luma-events";
const ISSUES_URL = `${GITHUB_URL}/issues/new`;

type Capability = {
  title: string;
  description: string;
  eyebrow: string;
  metric: string;
  detail: string;
  layout: "feature" | "wide" | "compact";
  icon: LucideIcon;
};

const capabilities: Capability[] = [
  {
    title: "Event operations",
    description: "Create, update, and safely cancel events.",
    eyebrow: "Calendar control",
    metric: "Full lifecycle",
    detail: "Create → preview → confirm",
    layout: "feature",
    icon: CalendarCheckIcon,
  },
  {
    title: "Guest control",
    description: "Add guests and manage every approval state.",
    eyebrow: "Guest states",
    metric: "4 states",
    detail: "Approved · Pending · Waitlisted · Declined",
    layout: "wide",
    icon: UsersRoundIcon,
  },
  {
    title: "Ticketing",
    description: "Manage free, paid, and flexible-price tickets.",
    eyebrow: "Ticket modes",
    metric: "3 models",
    detail: "Free · Paid · Flexible",
    layout: "wide",
    icon: TicketCheckIcon,
  },
  {
    title: "Host coordination",
    description: "Assign managers, check-in staff, and access levels.",
    eyebrow: "Team access",
    metric: "Role-aware",
    detail: "Managers and check-in staff",
    layout: "compact",
    icon: UserRoundCogIcon,
  },
  {
    title: "Audience growth",
    description: "Preview and invite past audiences without duplicates.",
    eyebrow: "Audience tools",
    metric: "0 duplicates",
    detail: "Preview before every invite",
    layout: "compact",
    icon: SendIcon,
  },
  {
    title: "Registration intelligence",
    description: "Summarize registrations and check-ins without exposing identities.",
    eyebrow: "Private by design",
    metric: "Identity-safe",
    detail: "Aggregate registration insight",
    layout: "compact",
    icon: ScanSearchIcon,
  },
];

const flowSteps = [
  {
    number: "01",
    label: "Prompt",
    title: "Describe the change",
    copy: "Ask from the AI client you already use.",
  },
  {
    number: "02",
    label: "Preview",
    title: "Inspect the operation",
    copy: "Review targets, notifications, and impact.",
  },
  {
    number: "03",
    label: "Confirm",
    title: "Keep control",
    copy: "Every write waits for explicit confirmation.",
  },
  {
    number: "04",
    label: "Complete",
    title: "Verify the result",
    copy: "Get a clear, structured outcome.",
  },
];

const installSteps = [
  {
    number: "01",
    title: "Run the setup wizard",
    copy: "One command detects your supported AI clients.",
  },
  {
    number: "02",
    title: "Verify your Luma key",
    copy: "Your masked key is verified before anything changes.",
  },
  {
    number: "03",
    title: "Start operating",
    copy: "Restart your selected clients and ask: “Verify my Luma connection.”",
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function ExternalArrow() {
  return <ArrowDownRightIcon data-icon="inline-end" aria-hidden="true" />;
}

export default async function Home() {
  const downloadStats = await getNpmDownloadStats();
  const downloadValue = `${downloadStats.downloads.toLocaleString("en-US")}${
    downloadStats.isFallback ? "+" : ""
  }`;
  const downloadDetail = downloadStats.isFallback
    ? `Verified ${formatDate(downloadStats.end)}`
    : `Since ${formatDate(downloadStats.start)}`;

  return (
    <div className="site-shell">
      <MotionOrchestrator />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="site-header">
        <div className="container-shell header-inner">
          <a className="brand-lockup" href="#top" aria-label="Luma Events home">
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              className="brand-mark"
              priority
            />
            <span>Luma Events</span>
          </a>

          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#capabilities">Capabilities</a>
            <a href="#workflow">Workflow</a>
            <a href="#install">Install</a>
          </nav>

          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            <GitForkIcon data-icon="inline-start" aria-hidden="true" />
            GitHub
          </a>
        </div>
      </header>

      <main id="main-content">
        <section className="hero-section" id="top" aria-labelledby="hero-title">
          <div className="container-shell hero-grid">
            <div className="hero-copy">
              <h1 id="hero-title">
                Your Luma calendar,
                <span> now agent-operable.</span>
              </h1>
              <p className="hero-lede">
                Manage events, guests, tickets, and hosts from your AI workspace.
              </p>

              <InstallCommand
                label="Copy the Luma Events setup command"
                animated
              />

              <div className="hero-actions">
                <a
                  className={buttonVariants({ variant: "default", size: "lg" })}
                  href="#install"
                >
                  Start setup
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                </a>
                <a className="text-link" href="#capabilities">
                  Explore 23 tools
                  <ArrowDownRightIcon aria-hidden="true" />
                </a>
              </div>

              <p className="hero-note">
                Independent and community-built. Not affiliated with or endorsed by
                Luma.
              </p>
            </div>

            <div
              className="operator-panel"
              aria-label="Example confirmation-first operation"
            >
              <div className="panel-chrome">
                <div className="chrome-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span>operator.session</span>
                <Badge variant="secondary">Connected</Badge>
              </div>

              <div className="operator-content">
                <div className="operator-prompt">
                  <span className="console-label">You</span>
                  <p>
                    Move Build Night to 5 PM and notify everyone—but show me the
                    change first.
                  </p>
                </div>

                <div className="operator-response">
                  <div className="response-heading">
                    <span className="console-label">Luma Events</span>
                    <Badge variant="outline">Preview only</Badge>
                  </div>
                  <div className="change-row">
                    <span>Start time</span>
                    <code>16:00 → 17:00 EAT</code>
                  </div>
                  <div className="change-row">
                    <span>Guest notification</span>
                    <code>Enabled</code>
                  </div>
                  <Separator />
                  <div className="confirmation-row">
                    <ShieldCheckIcon aria-hidden="true" />
                    <div>
                      <strong>Confirmation required</strong>
                      <span>No write has been made.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel-footer">
                <span>Protocol MCP 2025-06-18</span>
                <span>Safety gate active</span>
              </div>
            </div>
          </div>
        </section>

        <section className="status-section" aria-label="Product status">
          <div className="container-shell metrics-rail" data-reveal>
            <div className="metric-block">
              <span className="metric-value">23</span>
              <span className="metric-label">Purpose-built tools</span>
            </div>
            <div className="metric-block">
              <span className="metric-value">5</span>
              <span className="metric-label">Supported AI clients</span>
            </div>
            <div className="metric-block">
              <span className="metric-value">100%</span>
              <span className="metric-label">Writes need confirmation</span>
            </div>
            <div className="metric-block metric-downloads">
              <span className="metric-live">
                <i aria-hidden="true" /> Live npm pulse
              </span>
              <span className="metric-value">{downloadValue}</span>
              <span className="metric-label">
                <a href={NPM_URL} target="_blank" rel="noreferrer">
                  npm downloads · {downloadDetail}
                </a>
              </span>
            </div>
          </div>
        </section>

        <section className="section-block" id="workflow" aria-labelledby="workflow-title">
          <div className="container-shell">
            <div className="section-heading split-heading" data-reveal>
              <div>
                <span className="section-kicker">A visible control loop</span>
                <h2 id="workflow-title">Agent speed. Human control.</h2>
              </div>
              <p>
                Preview the change, keep the final say, and verify the result.
              </p>
            </div>

            <div className="signal-flow" data-reveal>
              {flowSteps.map((step, index) => (
                <article className="signal-step" key={step.number}>
                  <div className="signal-node" aria-hidden="true">
                    <span>{step.number}</span>
                  </div>
                  <Badge variant={index === 2 ? "default" : "outline"}>
                    {step.label}
                  </Badge>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="section-block capabilities-section"
          id="capabilities"
          aria-labelledby="capabilities-title"
        >
          <div className="container-shell">
            <div className="section-heading" data-reveal>
              <span className="section-kicker">One server, full event context</span>
              <h2 id="capabilities-title">Operate the entire event.</h2>
              <p>
                One natural-language surface for every stage.
              </p>
            </div>

            <PromptExamples />

            <div className="capability-grid" data-reveal>
              {capabilities.map(
                ({
                  title,
                  description,
                  eyebrow,
                  metric,
                  detail,
                  layout,
                  icon: Icon,
                }) => (
                <Card
                  key={title}
                  role="article"
                  className={cn(
                    "capability-card",
                    `capability-card--${layout}`,
                  )}
                >
                  <CardHeader>
                    <CardTitle>
                      <h3>{title}</h3>
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                    <CardAction>
                      <Icon aria-hidden="true" />
                    </CardAction>
                  </CardHeader>

                  <CardContent>
                    {layout === "feature" ? (
                      <div className="event-preview" aria-hidden="true">
                        <div className="event-preview-head">
                          <span>operator.preview</span>
                          <Badge variant="outline">Awaiting confirmation</Badge>
                        </div>
                        <div className="event-preview-row">
                          <span>APR 18</span>
                          <strong>Build Night</strong>
                          <code>17:00 EAT</code>
                        </div>
                        <div className="event-preview-row">
                          <span>Guests</span>
                          <strong>Approved audience</strong>
                          <code>Notify: on</code>
                        </div>
                      </div>
                    ) : null}

                    <div className="capability-metric">
                      <strong>{metric}</strong>
                      <span>{detail}</span>
                    </div>
                  </CardContent>

                  <CardFooter>
                    <span>{eyebrow}</span>
                    <Badge variant="outline">Available</Badge>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="section-block proof-section" aria-labelledby="proof-title">
          <div className="container-shell">
            <div className="section-heading split-heading" data-reveal>
              <div>
                <span className="section-kicker">Real output, redacted responsibly</span>
                <h2 id="proof-title">Readable from prompt to result.</h2>
              </div>
              <p>
                Real product output, with private guest identities removed.
              </p>
            </div>

            <div className="screenshot-grid" data-reveal>
              <figure className="screenshot-card screenshot-card-wide">
                <div className="screenshot-meta">
                  <span>01 / Discovery</span>
                  <Badge variant="secondary">Tool inventory</Badge>
                </div>
                <Image
                  src="/product/capabilities.png"
                  alt="Luma Events describing its event, guest, and registration capabilities with confirmation safeguards"
                  width={956}
                  height={511}
                  sizes="(max-width: 768px) 100vw, 66vw"
                />
                <figcaption>Know what is available before you act.</figcaption>
              </figure>

              <figure className="screenshot-card">
                <div className="screenshot-meta">
                  <span>02 / Schedule</span>
                  <Badge variant="secondary">Upcoming events</Badge>
                </div>
                <Image
                  src="/product/upcoming-events.png"
                  alt="Upcoming Luma events listed with dates, locations, registration settings, and capacity"
                  width={946}
                  height={428}
                  sizes="(max-width: 768px) 100vw, 48vw"
                />
                <figcaption>Scan your calendar at a glance.</figcaption>
              </figure>

              <figure className="screenshot-card">
                <div className="screenshot-meta">
                  <span>03 / Insight</span>
                  <Badge variant="secondary">Privacy-conscious</Badge>
                </div>
                <Image
                  src="/product/guest-insights-redacted.png"
                  alt="Aggregate repeat-attendance insights with guest names removed for privacy"
                  width={739}
                  height={619}
                  sizes="(max-width: 768px) 100vw, 48vw"
                />
                <figcaption>See patterns without exposing identities.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="section-block install-section" id="install" aria-labelledby="install-title">
          <div className="container-shell install-layout">
            <div className="install-intro" data-reveal>
              <span className="section-kicker">From zero to connected</span>
              <h2 id="install-title">One command to connect.</h2>
              <p>
                Setup detects your clients, verifies your key, and previews every change.
              </p>
              <InstallCommand label="Copy the setup command from the installation section" />
              <div className="client-list" aria-label="Supported clients">
                {[
                  "OpenAI Codex",
                  "Cursor",
                  "Claude Code",
                  "Gemini CLI",
                  "Grok CLI",
                ].map((client) => (
                  <Badge variant="outline" key={client}>
                    {client}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="install-steps" data-reveal>
              {installSteps.map((step) => (
                <article key={step.number}>
                  <span className="step-number">{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="safety-section" aria-labelledby="safety-title">
          <div className="container-shell" data-reveal>
            <Alert>
              <ShieldCheckIcon aria-hidden="true" />
              <AlertTitle id="safety-title">Built around explicit intent</AlertTitle>
              <AlertDescription>
                Every write requires <code>confirmed=true</code>. Event deletion,
                paid-ticket changes, host removal, and invitations include an impact
                preview.
              </AlertDescription>
            </Alert>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="final-cta-title">
          <div className="container-shell final-cta-inner" data-reveal>
            <div>
              <span className="section-kicker">Keep the work moving</span>
              <h2 id="final-cta-title">Operate Luma from your AI workspace.</h2>
            </div>
            <div className="final-actions">
              <a className={buttonVariants({ variant: "default", size: "lg" })} href="#install">
                Install Luma Events
                <TerminalSquareIcon data-icon="inline-end" aria-hidden="true" />
              </a>
              <a
                className={buttonVariants({ variant: "outline", size: "lg" })}
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
              >
                View source
                <ExternalArrow />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container-shell footer-grid">
          <div className="footer-brand">
            <div className="brand-lockup">
              <Image src="/logo.png" alt="" width={36} height={36} className="brand-mark" />
              <span>Luma Events</span>
            </div>
            <p>Safe Luma operations from your AI workspace.</p>
          </div>
          <div className="footer-links">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              Repository
            </a>
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              npm package
            </a>
            <a href={ISSUES_URL} target="_blank" rel="noreferrer">
              Support
            </a>
          </div>
          <p className="footer-legal">
            MIT licensed. Independent and community-built; not affiliated with or
            endorsed by Luma.
          </p>
        </div>
      </footer>
    </div>
  );
}
