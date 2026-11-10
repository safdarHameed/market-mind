"use client";

import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  Compass,
  GraduationCap,
  Lightbulb,
  LineChart,
  Loader2,
  MessagesSquare,
  Newspaper,
  Rocket,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10";

const PROMPTS = [
  "Coffee shop ideas in Lahore",
  "AI tools small shops need",
  "Problems farmers face in Kenya",
  "Online business with a small budget",
  "Gaps in pet care in Dubai",
  "What students struggle to find",
  "Healthy food delivery in Karachi",
  "Software small clinics need",
];

/* ------------------------------------------------------------------ helpers */

/** Fades children in when they scroll into view. */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("reveal", inView && "in", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Cycles through example questions, typing each one out. */
function useTypewriter(words: string[]) {
  const [text, setText] = React.useState("");
  React.useEffect(() => {
    let i = 0;
    let n = 0;
    let deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const w = words[i];
      n += deleting ? -1 : 1;
      setText(w.slice(0, n));
      let wait = deleting ? 28 : 55;
      if (!deleting && n === w.length) {
        deleting = true;
        wait = 1600;
      } else if (deleting && n === 0) {
        deleting = false;
        i = (i + 1) % words.length;
        wait = 300;
      }
      t = setTimeout(tick, wait);
    };
    t = setTimeout(tick, 400);
    return () => clearTimeout(t);
  }, [words]);
  return text;
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: React.ReactNode; text?: string }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-[17px] leading-relaxed text-muted">{text}</p>}
    </Reveal>
  );
}

/* ------------------------------------------------------------------ page */

export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <Nav />
      <Hero />
      <PromptStrip />
      <Pains />
      <ExampleExplorer />
      <Numbers />
      <HowItWorks />
      <AskDemo />
      <Audience />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/75 backdrop-blur-md">
      <div className={`${WRAP} flex h-16 items-center justify-between`}>
        <Link href="/" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex" aria-label="Sections">
          <a href="#examples" className="hover:text-text">Examples</a>
          <a href="#how" className="hover:text-text">How it works</a>
          <a href="#who" className="hover:text-text">Who it’s for</a>
          <a href="#faq" className="hover:text-text">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ButtonLink href="/discover" size="sm">Open app <ArrowRight /></ButtonLink>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  const router = useRouter();
  const typed = useTypewriter(PROMPTS);
  const [q, setQ] = React.useState("");
  const go = (text: string) => router.push(text.trim() ? `/discover?q=${encodeURIComponent(text.trim())}` : "/discover");

  return (
    <section className="relative">
      <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="grid-fade pointer-events-none absolute inset-0 opacity-60" />
      <div className={`${WRAP} relative grid items-center gap-14 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.1fr_1fr]`}>
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-surface/80 px-3 py-1 text-xs font-medium text-muted shadow-card backdrop-blur">
            <Compass className="size-3.5 text-primary" /> Not sure what business to start?
          </span>
          <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Stop guessing. <br className="hidden sm:block" />
            See what the <span className="text-brand">market is saying.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Ask about any idea, city or industry. {BRAND.name} reads news, reports, forums and reviews, then shows you real
            opportunities — with the proof behind each one.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              go(q || typed);
            }}
            className="mt-8 flex max-w-xl items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-pop focus-within:border-primary/40 focus-within:ring-[3px] focus-within:ring-primary/15"
          >
            <Search className="ml-2 size-5 shrink-0 text-subtle" />
            <div className="relative min-w-0 flex-1">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="What do you want to explore?"
                className="h-11 w-full bg-transparent text-[15px] outline-none"
              />
              {!q && (
                <span aria-hidden className="caret pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-[15px] text-subtle">
                  {typed}
                </span>
              )}
            </div>
            <button type="submit" className="bg-brand brand-hover inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white sm:px-5">
              <span className="hidden sm:inline">Find opportunities</span>
              <ArrowRight className="size-4" />
            </button>
          </form>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {["No sign-up needed", "Use your own AI", "Every source linked"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

const STAGES = ["Searching the web", "Reading the pages", "Pulling out key facts", "Finding patterns", "Writing up opportunities"];

/** A looping, illustrative "research in progress → result" card. */
function HeroVisual() {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % (STAGES.length + 4)), 1100);
    return () => clearInterval(t);
  }, []);
  const done = step >= STAGES.length;

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div aria-hidden className="bg-brand absolute -inset-6 -z-10 rounded-[2rem] opacity-15 blur-3xl" />

      <div className="rounded-2xl border border-border bg-surface/95 p-5 shadow-pop backdrop-blur sm:p-6">
        <div className="flex items-center justify-between text-xs text-subtle">
          <span className="flex items-center gap-2"><LogoMark size={20} /> Researching: “Coffee shop ideas in Lahore”</span>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="bg-brand h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, ((step + 1) / STAGES.length) * 100)}%` }} />
        </div>

        <ol className="mt-4 space-y-2 text-sm">
          {STAGES.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2.5 transition-colors", i < step || done ? "text-text" : i === step ? "text-primary" : "text-subtle")}>
              {i < step || done ? (
                <CircleCheck className="size-4 text-success" />
              ) : i === step ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span className="grid size-4 place-items-center"><span className="size-1.5 rounded-full bg-border-strong" /></span>
              )}
              {s}
            </li>
          ))}
        </ol>

        <div className={cn("mt-5 rounded-xl border border-border bg-bg p-4 transition-all duration-500", done ? "opacity-100" : "opacity-40 blur-[1px]")}>
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-primary">Opportunity found</div>
              <div className="mt-1 font-semibold leading-snug">Work-friendly cafés near universities</div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted"><BadgeCheck className="mt-px size-3.5 shrink-0 text-success" /> Students keep asking where to study with Wi-Fi</p>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-muted"><ShieldAlert className="mt-px size-3.5 shrink-0 text-warning" /> Rent near campuses is high</p>
            </div>
            <ScoreRing score={done ? 71 : 0} confidence="moderate" size={56} />
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-subtle">Illustration — real reports link every point to its source.</p>
      </div>

      <div className="float-a absolute -top-5 right-6 hidden rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-pop sm:flex sm:items-center sm:gap-2">
        <TrendingUp className="size-4 text-success" /> Demand is growing
      </div>
      <div className="float-b absolute -bottom-5 left-6 hidden rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-pop sm:flex sm:items-center sm:gap-2">
        <Newspaper className="size-4 text-primary" /> 4 sources agree
      </div>
    </div>
  );
}

/** Endless strip of example questions — click one to start with it. */
function PromptStrip() {
  const items = [...PROMPTS, ...PROMPTS];
  return (
    <section className="marquee-wrap relative border-y border-border/60 bg-surface/50 py-5" aria-label="Example questions">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-bg to-transparent" />
      <div className="marquee flex w-max gap-3">
        {items.map((p, i) => (
          <Link
            key={i}
            href={`/discover?q=${encodeURIComponent(p)}`}
            tabIndex={i >= PROMPTS.length ? -1 : undefined}
            className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Sparkles className="size-3.5 text-primary" /> {p}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pains */

const PAINS = [
  { icon: Lightbulb, quote: "I have ten ideas and no clue which one is worth it.", answer: "Each idea gets a clear score out of 100, explained in plain words." },
  { icon: Wallet, quote: "Will people actually pay for this?", answer: "See what real people say in forums, reviews and the news." },
  { icon: BookOpen, quote: "Research takes weeks and I don’t know where to look.", answer: "Get a full report in minutes, with every source linked." },
];

function Pains() {
  return (
    <section className="py-24">
      <div className={WRAP}>
        <SectionTitle eyebrow="Sound familiar?" title={<>Starting something is hard. <span className="text-brand">Knowing what to start</span> is harder.</>} />
        <div className="grid gap-5 md:grid-cols-3">
          {PAINS.map((p, i) => (
            <Reveal key={p.quote} delay={i * 120}>
              <div className="group h-full rounded-2xl border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-pop">
                <span className="grid size-11 place-items-center rounded-xl bg-warning-soft text-warning"><p.icon className="size-5" /></span>
                <p className="mt-5 text-lg font-medium leading-snug">“{p.quote}”</p>
                <div className="mt-5 flex items-start gap-2.5 border-t border-border pt-5 text-sm text-muted">
                  <span className="bg-brand mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white"><Check className="size-3" /></span>
                  {p.answer}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ examples */

type Example = {
  q: string;
  icon: React.ElementType;
  title: string;
  summary: string;
  score: number;
  dims: [string, number][];
  proof: string[];
  risk: string;
  build: string;
};

const EXAMPLES: Example[] = [
  {
    q: "Coffee shop ideas in Lahore",
    icon: Store,
    title: "Work-friendly cafés near universities",
    summary: "Students and remote workers want a calm place with Wi-Fi and power. Few cafés are built for long stays.",
    score: 71,
    dims: [["People want it", 8], ["Is it growing?", 7], ["Gap in the market", 7], ["Room to compete", 5], ["How doable it is", 7]],
    proof: ["Students on local forums keep asking where to study with Wi-Fi.", "More people in the city now work remotely."],
    risk: "Rent near campuses is high and rising.",
    build: "A quiet café with paid desk hours and student deals.",
  },
  {
    q: "AI tools small shops need",
    icon: Sparkles,
    title: "Stock tracking that works inside WhatsApp",
    summary: "Small shop owners already run their business on WhatsApp but track stock on paper.",
    score: 64,
    dims: [["People want it", 7], ["Is it growing?", 8], ["Gap in the market", 6], ["Room to compete", 6], ["How doable it is", 6]],
    proof: ["Shop owners say stock apps are too complex for them.", "WhatsApp is the main tool for small sellers."],
    risk: "Shop owners may not want to pay monthly.",
    build: "A WhatsApp bot that logs sales and warns before stock runs out.",
  },
  {
    q: "Problems farmers face in Kenya",
    icon: LineChart,
    title: "Shared cold storage for small farmers",
    summary: "A lot of fresh produce spoils before it reaches buyers. Small farmers can’t afford their own cold rooms.",
    score: 69,
    dims: [["People want it", 8], ["Is it growing?", 6], ["Gap in the market", 8], ["Room to compete", 7], ["How doable it is", 5]],
    proof: ["Reports describe large losses after harvest.", "Farmer groups ask for shared storage options."],
    risk: "Needs steady power and upfront money for equipment.",
    build: "Pay-per-crate solar cold rooms near local markets.",
  },
  {
    q: "Online business with a small budget",
    icon: GraduationCap,
    title: "Tutoring in local languages",
    summary: "Parents want tutors who explain in their own language. Most platforms are English-only.",
    score: 58,
    dims: [["People want it", 7], ["Is it growing?", 6], ["Gap in the market", 6], ["Room to compete", 4], ["How doable it is", 8]],
    proof: ["Parents in forums ask for tutors who speak their language.", "Online learning keeps growing."],
    risk: "Many tutors already sell through social media.",
    build: "A simple booking site for vetted local-language tutors.",
  },
];

function ExampleExplorer() {
  const [active, setActive] = React.useState(0);
  const ex = EXAMPLES[active];
  return (
    <section id="examples" className="scroll-mt-20 bg-surface/40 py-24">
      <div className={WRAP}>
        <SectionTitle
          eyebrow="See it in action"
          title={<>Pick a question. <span className="text-brand">See what you’d get.</span></>}
          text="Click an example to see what a result looks like."
        />
        <Reveal>
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div role="tablist" aria-label="Examples" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {EXAMPLES.map((e, i) => (
                <button
                  key={e.q}
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-all",
                    i === active ? "border-transparent bg-brand text-white shadow-pop" : "border-border bg-surface text-muted hover:border-primary/30 hover:text-text",
                  )}
                >
                  <e.icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap lg:whitespace-normal">{e.q}</span>
                  <ArrowRight className={cn("ml-auto hidden size-4 lg:block", i === active ? "opacity-100" : "opacity-0")} />
                </button>
              ))}
            </div>

            <div key={active} className="animate-fade-in rounded-2xl border border-border bg-surface p-6 shadow-pop sm:p-8">
              <div className="flex items-start gap-5">
                <div className="min-w-0 flex-1">
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-subtle">Example result</span>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight">{ex.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{ex.summary}</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <ScoreRing score={ex.score} confidence="moderate" size={72} stroke={6} />
                  <span className="text-xs text-subtle">Score</span>
                </div>
              </div>

              <div className="mt-7 grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  {ex.dims.map(([label, v], i) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{label}</span><span className="font-medium tabular-nums">{v}/10</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="bg-brand bar-grow h-full rounded-full" style={{ width: `${v * 10}%`, animationDelay: `${i * 80}ms` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl bg-success-soft p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><BadgeCheck className="size-4 text-success" /> Why it’s promising</div>
                    <ul className="space-y-1.5 text-sm text-muted">
                      {ex.proof.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-warning-soft p-4 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-semibold"><ShieldAlert className="size-4 text-warning" /> Watch out</div>
                    <p className="text-muted">{ex.risk}</p>
                  </div>
                  <div className="rounded-xl bg-primary-soft p-4 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-primary" /> What you could build</div>
                    <p className="text-muted">{ex.build}</p>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <p className="text-xs text-subtle">Example only. Your real report links every point to the page it came from.</p>
                <ButtonLink href={`/discover?q=${encodeURIComponent(ex.q)}`} size="sm">Try this question <ArrowRight /></ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ numbers */

const NUMBERS = [
  { value: 7, label: "checks on every idea", text: "Demand, pain, growth, gap, competition, effort and source quality." },
  { value: 4, label: "kinds of sources", text: "News, reports, forums and reviews." },
  { value: 0, label: "made-up sources", text: "Every quote is checked against the page it came from." },
  { value: 6, label: "AI providers", text: "Claude, OpenAI, Gemini, Groq, OpenRouter or your own server." },
];

function CountUp({ to }: { to: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 900);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return <span ref={ref}>{n}</span>;
}

function Numbers() {
  return (
    <section className="py-24">
      <div className={WRAP}>
        <div className="bg-brand relative overflow-hidden rounded-3xl px-6 py-14 text-white shadow-pop sm:px-12">
          <div aria-hidden className="absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden className="absolute -bottom-24 -left-10 size-72 rounded-full bg-cyan-300/20 blur-3xl" />
          <Reveal className="relative mb-10 max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Facts, not hype.</h2>
            <p className="mt-3 text-white/80">Every answer comes from real public pages — and you can open each one.</p>
          </Reveal>
          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {NUMBERS.map((s, i) => (
              <Reveal key={s.label} delay={i * 100}>
                <div className="text-5xl font-semibold tabular-nums tracking-tight"><CountUp to={s.value} /></div>
                <div className="mt-2 font-medium">{s.label}</div>
                <p className="mt-1 text-sm text-white/70">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ how */

const STEPS = [
  { icon: Compass, title: "Ask your question", text: "An idea, a city, an industry — or just “what’s worth starting here?”" },
  { icon: Search, title: "We read the market", text: "News, reports, forums and reviews are found, read and checked." },
  { icon: Rocket, title: "Get ideas with proof", text: "Clear opportunities, a score, the risks — and links to every source." },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-24">
      <div className={WRAP}>
        <SectionTitle eyebrow="How it works" title={<>From question to answer <span className="text-brand">in minutes.</span></>} />
        <div className="relative grid gap-8 md:grid-cols-3">
          <div aria-hidden className="bg-brand absolute left-[16%] right-[16%] top-8 hidden h-0.5 opacity-30 md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 150} className="relative text-center">
              <div className="bg-brand mx-auto grid size-16 place-items-center rounded-2xl text-white shadow-pop">
                <s.icon className="size-7" />
              </div>
              <div className="mt-2 text-xs font-semibold text-subtle">STEP {i + 1}</div>
              <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ ask demo */

const CHAT = [
  { me: true, text: "Isn’t this already solved by existing apps?" },
  { me: false, text: "Good question. A few apps exist, but reviews say they’re made for bigger stores and cost too much." },
  { me: false, text: "I searched again and found two more sources. The gap looks real, but smaller than I first thought. Score: 64 → 60." },
];

function AskDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      CHAT.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), 300 + i * 1100)));
    }, { threshold: 0.4 });
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <section className="bg-surface/40 py-24">
      <div className={`${WRAP} grid items-center gap-12 lg:grid-cols-2`}>
        <Reveal>
          <p className="text-sm font-semibold text-primary">Ask the AI</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Not convinced? <span className="text-brand">Push back.</span></h2>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-muted">
            Ask questions about any idea. The AI looks for more evidence, changes its mind when it should, and tells you when it isn’t sure.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              { icon: Scale, t: "Both sides — the case for and against" },
              { icon: MessagesSquare, t: "Simple answers, in plain words" },
              { icon: BadgeCheck, t: "New sources added as it searches" },
            ].map((f) => (
              <li key={f.t} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary"><f.icon className="size-4" /></span>
                {f.t}
              </li>
            ))}
          </ul>
        </Reveal>

        <div ref={ref} className="rounded-2xl border border-border bg-surface p-5 shadow-pop sm:p-6">
          <div className="mb-4 flex items-center gap-2 border-b border-border pb-4 text-sm font-semibold">
            <MessagesSquare className="size-4 text-primary" /> Ask about this opportunity
          </div>
          <div className="flex min-h-[260px] flex-col gap-3">
            {CHAT.slice(0, shown).map((m, i) =>
              m.me ? (
                <div key={i} className="bg-brand animate-fade-in max-w-[85%] self-end rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-white">{m.text}</div>
              ) : (
                <div key={i} className="animate-fade-in flex max-w-[92%] gap-2.5">
                  <LogoMark size={26} className="mt-0.5 shrink-0" />
                  <div className="rounded-2xl rounded-tl-md bg-surface-2 px-4 py-2.5 text-sm leading-relaxed">{m.text}</div>
                </div>
              ),
            )}
            {shown < CHAT.length && shown > 0 && (
              <div className="flex items-center gap-1 pl-10 text-subtle">
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ audience */

const AUDIENCE = [
  { icon: Rocket, who: "First-time founders", text: "Find an idea worth your time and savings." },
  { icon: Store, who: "Small business owners", text: "See what customers around you are missing." },
  { icon: TrendingUp, who: "Investors", text: "Check a market before you put money in." },
  { icon: GraduationCap, who: "Students", text: "Pick a project people actually need." },
];

function Audience() {
  return (
    <section id="who" className="scroll-mt-20 py-24">
      <div className={WRAP}>
        <SectionTitle eyebrow="Who it’s for" title={<>Made for anyone with <span className="text-brand">a big question.</span></>} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE.map((a, i) => (
            <Reveal key={a.who} delay={i * 100}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-pop">
                <div aria-hidden className="bg-brand absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100" />
                <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-brand group-hover:text-white">
                  <a.icon className="size-5" />
                </span>
                <h3 className="mt-5 font-semibold">{a.who}</h3>
                <p className="mt-1.5 text-sm text-muted">{a.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ faq */

const FAQ = [
  { q: "Where does the information come from?", a: "Public web pages: news, industry reports, forums, reviews and government sites. Paywalls and blocked sites are respected." },
  { q: "Can I trust the score?", a: "Use it as a guide. It is kept low when there isn’t much evidence, and every part is explained. Always read the sources before you decide." },
  { q: "What do I need to start?", a: "Just a key from an AI provider. No sign-up, no spreadsheets, no uploads." },
  { q: "Which AI can I use?", a: "Claude, OpenAI, Google Gemini, Groq, OpenRouter, or any OpenAI-compatible server. You pick the model in Settings." },
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-surface/40 py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionTitle eyebrow="FAQ" title="Questions people ask" />
        <div className="space-y-3">
          {FAQ.map((f) => (
            <Reveal key={f.q}>
              <details className="group rounded-2xl border border-border bg-surface px-5 shadow-card open:shadow-pop">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" />
                </summary>
                <p className="pb-5 text-[15px] leading-relaxed text-muted">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ cta + footer */

function FinalCta() {
  return (
    <section className="py-24">
      <div className={WRAP}>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface px-6 py-16 text-center shadow-pop">
            <div aria-hidden className="hero-glow absolute inset-0" />
            <div className="relative">
              <LogoMark size={52} className="mx-auto" />
              <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
                Your next idea is already out there. <span className="text-brand">Let’s find it.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-[17px] text-muted">Free to try with your own AI key. No sign-up.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/discover" size="lg">Open {BRAND.name} <ArrowRight /></ButtonLink>
                <ButtonLink href="#examples" size="lg" variant="secondary"><Star /> See examples</ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className={`${WRAP} flex flex-col items-center justify-between gap-4 text-sm text-muted sm:flex-row`}>
        <Logo />
        <p>Answers from public sources. A guide, not financial advice.</p>
        <Link href="/discover" className="font-medium text-primary hover:underline">Open app →</Link>
      </div>
    </footer>
  );
}
