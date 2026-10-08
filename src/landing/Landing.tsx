import { useRef, useState } from 'react';
import { ArrowRight, ArrowUp, Bot, FilePen, FileText, FlaskConical, Landmark, Receipt, Users, Volume2, WifiOff, HardDrive, UserX } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AccentBar, Logo } from '../ui/brand';

/** Public repository. Links to it are hidden until it's set. */
const REPO_URL = 'https://github.com/WannaBeSolopreneur/redacto';
const APP_URL = '/app/';

const NAV = [['How it works', '#how'], ['Use cases', '#uses'], ['Verify', '#verify'], ['FAQ', '#faq']] as const;

/** Autoplays muted (browsers require it); one tap turns the voice-over on and restarts from the top. */
function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  return (
    <figure className="relative border bg-card shadow-sm">
      <video
        ref={ref}
        className="block aspect-video w-full"
        src="/video/redacto-demo.mp4"
        poster="/video/redacto-demo-poster.webp"
        autoPlay
        muted
        loop
        playsInline
        controls={!muted}
        preload="metadata"
        aria-label="Demo with voice-over: a lab report's personal details are replaced with labels before it is sent to an AI chatbot"
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
      />
      {muted && (
        <Button
          size="sm"
          className="absolute right-3 bottom-3 shadow-md"
          onClick={() => {
            const v = ref.current;
            if (!v) return;
            v.muted = false;
            v.currentTime = 0;
            void v.play();
          }}
        >
          <Volume2 /> Sound on
        </Button>
      )}
    </figure>
  );
}

/** GitHub's mark (lucide has no brand icons). Sized and coloured like the other icons. */
function GitHubMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={cn('size-4', className)} {...props}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Chip({ type, children }: { type: string; children: React.ReactNode }) {
  return (
    <code data-type={type} className="bg-ent-bg px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-ent shadow-[inset_0_0_0_1px_var(--ent)]">
      {children}
    </code>
  );
}

function Section({ id, index, title, alt, children }: { id: string; index: string; title: string; alt?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-16 border-t py-14 md:py-20', alt && 'bg-card')}>
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-8 flex items-baseline gap-4">
          <span className="font-mono text-xs tracking-wider text-primary">{index}</span>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight text-balance md:text-[2rem]">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

function TryButton({ className }: { className?: string }) {
  return (
    <Button asChild size="lg" className={className}>
      <a href={APP_URL}>
        Try it free <ArrowRight />
      </a>
    </Button>
  );
}

export function Landing() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-primary focus:px-4 focus:py-3 focus:font-semibold focus:text-primary-foreground">
        Skip to content
      </a>
      <AccentBar />
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
          <a href="#top" aria-label="Redacto home"><Logo /></a>
          <nav aria-label="Primary" className="hidden gap-1 md:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {REPO_URL && (
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <a href={REPO_URL}><GitHubMark /> GitHub</a>
              </Button>
            )}
            <Button asChild size="sm">
              <a href={APP_URL}>Try it free</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero + live demo */}
        <section id="top" aria-labelledby="hero-title" className="mx-auto grid max-w-6xl gap-10 px-5 pt-10 pb-14 md:px-8 lg:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.3fr)] lg:items-start lg:pt-14">
          <div className="flex flex-col gap-6 lg:pt-10">
            <h1 id="hero-title" className="text-4xl leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.4rem]">
              Remove personal details <span className="text-primary">before AI sees them.</span>
            </h1>
            <p className="max-w-[38ch] text-lg leading-snug text-secondary-foreground">
              Names, emails and account numbers become <Chip type="PERSON">[PERSON_1]</Chip>. On your device.
            </p>
            <div className="flex flex-wrap gap-2">
              <TryButton />
              <Button asChild size="lg" variant="outline">
                <a href={REPO_URL}>
                  <GitHubMark /> 100% open source
                </a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">PDF · Word · Excel · CSV · images · text. Free, no account.</p>
          </div>
          <HeroVideo />
        </section>

        {/* Trust strip: the reasons to believe the hero, before anything else. */}
        <section aria-label="Why you can trust Redacto" className="border-y bg-card">
          <ul className="mx-auto grid max-w-6xl gap-x-8 gap-y-6 px-5 py-7 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
            {TRUST.map(({ Icon, title, body, href }) => {
              const inner = (
                <>
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <b className="block font-semibold">{title}{href && <span aria-hidden className="ml-1 text-primary">→</span>}</b>
                    <span className="text-sm text-muted-foreground">{body}</span>
                  </div>
                </>
              );
              return (
                <li key={title}>
                  {href ? <a href={href} className="group flex gap-3 hover:[&_b]:text-primary">{inner}</a> : <div className="flex gap-3">{inner}</div>}
                </li>
              );
            })}
          </ul>
        </section>

        <Section id="problem" index="01" title="Do you know how much personal data you’re giving ChatGPT, Claude and Grok?">
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.1fr)]">
            <figure className="flex flex-col gap-3">
              <figcaption className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">What you type</figcaption>
              <div className="flex flex-1 flex-col justify-end gap-3 border bg-card p-4">
                <span className="mb-auto flex items-center gap-2 border-b pb-3 text-xs text-muted-foreground">
                  <Bot className="size-4" aria-hidden /> ChatGPT, Claude, Grok…
                </span>
                <span className="flex w-fit items-center gap-2 border bg-muted px-2.5 py-1.5 text-xs">
                  <FileText className="size-3.5 text-primary" aria-hidden /> lab_results.pdf
                </span>
                <div className="flex items-center justify-between gap-3 border px-3 py-2.5">
                  <span>What should I be concerned about?</span>
                  <span className="grid size-7 place-items-center bg-foreground text-background" aria-hidden><ArrowUp className="size-4" /></span>
                </div>
              </div>
            </figure>
            <ArrowRight className="mx-auto size-6 rotate-90 self-center text-muted-foreground lg:mt-6 lg:rotate-0" aria-hidden />
            <figure className="flex flex-col gap-3">
              <figcaption className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">What the AI receives</figcaption>
              <ul className="flex-1 divide-y border bg-card text-sm">
                {SENT.map(([type, what, value]) => (
                  <li key={what} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">{what}</span>
                    <span className="truncate"><Chip type={type}>{value}</Chip></span>
                  </li>
                ))}
                <li className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 bg-muted/50 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">Your results</span>
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>HbA1c 6.8% · LDL 168 mg/dL · …</span>
                    <span className="text-xs text-muted-foreground">kept: the AI needs these</span>
                  </span>
                </li>
              </ul>
            </figure>
          </div>
          <p className="mt-6 max-w-[60ch] text-lg text-secondary-foreground">
            A one-line question sends the whole report. Everything that says who you are leaves your device when you press send, to be stored on someone else's servers. <b className="font-semibold text-foreground">Redacto removes who you are and keeps what the AI needs</b>, all on your device.
          </p>
        </Section>

        <Section id="placeholders" index="02" title="It doesn’t need all of that to answer your question." alt>
          <div className="grid gap-4 md:grid-cols-2">
            <ReportCard title="Before" note="What you’d normally upload">
              {(v) => <Hl type={v[0]}>{v[1]}</Hl>}
            </ReportCard>
            <ReportCard title="After" note="What Redacto gives you to upload" good>
              {(v) => <Chip type={v[0]}>{v[2]}</Chip>}
            </ReportCard>
          </div>
          <div className="mt-4 border bg-background p-5">
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">The AI’s answer, from the “after” version</span>
            <p className="mt-2 max-w-[70ch] text-[15px]">
              “Your HbA1c of 6.8% is in the diabetes range, and your LDL cholesterol of 168 mg/dL is high. Both are worth discussing with your
              doctor; a repeat HbA1c test would confirm the first result.”
            </p>
          </div>
          <p className="mt-6 max-w-[60ch] text-lg text-secondary-foreground">
            Same question, same useful answer. <b className="font-semibold text-foreground">Your results stay; who you are doesn’t.</b>
          </p>
        </Section>

        <Section id="how" index="03" title="Three steps, all on your device.">
          <ol className="grid gap-6 md:grid-cols-3">
            {[
              ['Open', 'a PDF, Word file or spreadsheet.', <div key="o" className="flex gap-2"><span className="border border-dashed border-[#c25a14]/50 px-3 py-2 font-mono text-[11px] font-semibold text-[#c25a14]">PDF</span><span className="border border-dashed border-teal/60 px-3 py-2 font-mono text-[11px] font-semibold text-teal-700">XLSX</span></div>],
              ['Review', 'every flag. Fix misses.', <div key="r" className="flex w-40 flex-col gap-1.5 border bg-card p-2.5"><i className="h-1.5 bg-border" /><i data-type="PERSON" className="h-2.5 w-3/5 bg-ent-bg shadow-[inset_0_0_0_1px_var(--ent)]" /><i className="h-1.5 w-4/5 bg-border" /><i data-type="EMAIL" className="h-2.5 w-3/4 bg-ent-bg shadow-[inset_0_0_0_1px_var(--ent)]" /></div>],
              ['Export', 'a clean copy for AI.', <div key="e" className="flex w-40 flex-col gap-1.5 border bg-card p-2.5"><i className="h-1.5 bg-border" /><span className="w-fit text-[10px]"><Chip type="PERSON">[PERSON_1]</Chip></span><i className="h-1.5 w-3/4 bg-border" /><span className="w-fit text-[10px]"><Chip type="EMAIL">[EMAIL_1]</Chip></span></div>],
            ].map(([n, rest, art]) => (
              <li key={n as string} className="flex flex-col gap-3 border-t-2 border-foreground pt-3">
                <div className="grid h-28 place-items-center border bg-muted">{art}</div>
                <h3 className="text-[15px] text-secondary-foreground"><b className="font-semibold text-foreground">{n}</b> {rest}</h3>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="uses" index="04" title="Made for what you actually paste." alt>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {([[Landmark, 'Bank statements'], [Receipt, 'Pay stubs & tax forms'], [FilePen, 'Contracts'], [Users, 'Customer spreadsheets'], [FlaskConical, 'Research data']] as const).map(([Icon, label]) => (
              <li key={label} className="flex min-h-24 flex-col gap-3 border bg-background p-4 text-sm font-semibold last:col-span-2 md:last:col-span-1">
                <Icon className="size-5 text-primary" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="verify" index="05" title="Verify, don't trust.">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <figure className="flex flex-col items-center gap-3 border bg-background p-6 lg:row-span-2" role="img" aria-label="Your file is processed and stays on your device. The path to the cloud is crossed out.">
              <svg viewBox="0 0 320 150" className="w-full max-w-sm" aria-hidden>
                <rect x="18" y="28" width="130" height="94" fill="#fff" stroke="#121118" strokeWidth="1.5" />
                <rect x="28" y="38" width="110" height="64" fill="#f1f1ee" stroke="#d4d4cf" />
                <rect x="40" y="48" width="70" height="8" fill="#e3e3df" />
                <rect x="40" y="61" width="86" height="12" fill="#ffecb0" stroke="#a86f00" />
                <text x="44" y="69.5" fontFamily="ui-monospace,Menlo,monospace" fontSize="7.5" fill="#a86f00">[PERSON_1]</text>
                <rect x="40" y="78" width="54" height="8" fill="#e3e3df" />
                <text x="83" y="140" textAnchor="middle" fontSize="11" fontWeight="600" fill="#121118">Your device</text>
                <path d="M158 75h52" stroke="#a3a2ab" strokeWidth="1.5" strokeDasharray="4 3" />
                <path d="M200 68l10 7-10 7" fill="none" stroke="#a3a2ab" strokeWidth="1.5" />
                <line x1="168" y1="62" x2="208" y2="88" stroke="#e0459f" strokeWidth="2" />
                <line x1="168" y1="88" x2="208" y2="62" stroke="#e0459f" strokeWidth="2" />
                <ellipse cx="262" cy="72" rx="36" ry="16" fill="#fff" stroke="#d4d4cf" />
                <ellipse cx="262" cy="86" rx="36" ry="16" fill="#fff" stroke="#a3a2ab" />
                <text x="262" y="90" textAnchor="middle" fontSize="10" fill="#5f5e69">Cloud / AI</text>
                <text x="262" y="140" textAnchor="middle" fontSize="11" fontWeight="600" fill="#e0459f">No upload</text>
              </svg>
              <figcaption className="font-mono text-xs text-muted-foreground">Your file is processed here, then stays here.</figcaption>
            </figure>
            <div className="flex flex-col gap-2 border bg-card p-5">
              <span className="font-mono text-xs text-muted-foreground">check it yourself</span>
              <p className="font-semibold">Open your browser's developer tools and watch the Network tab while you redact. Nothing is sent. Or go offline once the page has loaded: everything keeps working.</p>
              {REPO_URL && <a href={REPO_URL} className="mt-1 text-sm font-semibold text-primary hover:underline">Read the source code →</a>}
            </div>
            <p className="text-sm text-secondary-foreground">
              <b className="text-foreground">For teams:</b> no accounts, nothing stored by us. Not a compliance certification.
            </p>
          </div>
        </Section>

        <Section id="faq" index="06" title="Questions" alt>
          <Accordion type="single" collapsible className="max-w-3xl border-t">
            {FAQ.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-[15px]">{q}</AccordionTrigger>
                <AccordionContent className="max-w-[62ch] text-[15px] text-secondary-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Section>

        <section aria-labelledby="final-title" className="border-t py-14 md:py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 md:flex-row md:items-end md:justify-between md:px-8">
            <h2 id="final-title" className="max-w-[16ch] text-3xl font-semibold tracking-tight text-balance md:text-[2.6rem] md:leading-[1.05]">
              Share the document. Keep the details.
            </h2>
            <TryButton />
          </div>
        </section>
      </main>

      <footer className="border-t bg-card py-8 text-sm text-muted-foreground">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 md:grid-cols-[auto_1fr_auto] md:items-start md:gap-12 md:px-8">
          <Logo className="text-foreground" />
          <ul className="flex flex-col gap-1.5">
            {["We don't collect anything.", 'Automatic detection can miss things. Review before sharing.', 'Not affiliated with OpenAI, Anthropic, xAI or Google.'].map((n) => (
              <li key={n} className="flex items-start gap-2"><span aria-hidden className="mt-2.5 h-px w-2.5 shrink-0 bg-gold" />{n}</li>
            ))}
          </ul>
          <nav aria-label="Footer" className="flex gap-4 font-medium text-secondary-foreground">
            {REPO_URL && <a href={REPO_URL} className="hover:text-primary">Source</a>}
            <a href="#faq" className="hover:text-primary">FAQ</a>
            <a href={APP_URL} className="hover:text-primary">Open the app</a>
          </nav>
        </div>
      </footer>
    </>
  );
}

/** The fictional lab report: [type, original, replacement] for each personal detail. */
const REPORT = {
  name: ['PERSON', 'Maria Delgado', '[PERSON_1]'],
  dob: ['DATE', '04/12/1987', '[DATE_1]'],
  mrn: ['ID_NUMBER', 'MRN 00483921', '[ID_NUMBER_1]'],
  address: ['ADDRESS', '1842 W Fulton St, Chicago, IL 60612', '[ADDRESS_1]'],
  doctor: ['PERSON', 'Dr. James Whitfield', '[PERSON_2]'],
} as const;
type Detail = (typeof REPORT)[keyof typeof REPORT];

/** Highlighted original detail (the "before" side). */
function Hl({ type, children }: { type: string; children: React.ReactNode }) {
  return <span data-type={type} className="bg-ent-bg px-0.5 shadow-[inset_0_-2px_0_var(--ent)]">{children}</span>;
}

function ReportCard({ title, note, good, children: show }: { title: string; note: string; good?: boolean; children: (v: Detail) => React.ReactNode }) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-1">
      <span className="text-xs leading-6 text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
  return (
    <figure className="flex flex-col border bg-background">
      <figcaption className="flex items-baseline justify-between gap-3 border-b px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn('size-2', good ? 'bg-teal' : 'bg-magenta')} aria-hidden /> {title}
        </span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </figcaption>
      <div className="px-5 py-4 text-sm">
        <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">lab_results.pdf · fictional</p>
        {row('Patient', show(REPORT.name))}
        {row('Date of birth', show(REPORT.dob))}
        {row('Patient ID', show(REPORT.mrn))}
        {row('Address', show(REPORT.address))}
        {row('Ordered by', show(REPORT.doctor))}
        <div className="mt-2 border-t pt-2">
          {row('HbA1c', <span>6.8% <span className="text-xs font-semibold text-destructive">HIGH</span></span>)}
          {row('LDL', <span>168 mg/dL <span className="text-xs font-semibold text-destructive">HIGH</span></span>)}
        </div>
      </div>
    </figure>
  );
}

const TRUST = [
  { Icon: GitHubMark, title: '100% open source', body: 'Every line of code that touches your file is public on GitHub. Read it, or run it yourself.', href: REPO_URL },
  { Icon: WifiOff, title: 'Works with Wi-Fi off', body: 'Once it’s loaded, turn off your Wi-Fi. Redacto keeps working, because nothing needs the internet.' },
  { Icon: HardDrive, title: 'Nothing is uploaded', body: 'Your files are read and redacted on your device, and never sent anywhere.' },
  { Icon: UserX, title: 'No account, no tracking', body: 'No sign-up, no analytics, no cookies. Close the tab and your files are gone.' },
];

/** What a lab report sends along with the question (fictional). Results are listed separately: they stay. */
const SENT: Array<[string, string, string]> = [
  ['PERSON', 'Your name', 'Maria Delgado'],
  ['DATE', 'Date of birth', '04/12/1987'],
  ['ID_NUMBER', 'Patient ID', 'MRN 00483921'],
  ['ADDRESS', 'Home address', '1842 W Fulton St, Chicago'],
  ['PERSON', 'Your doctor', 'Dr. James Whitfield'],
];

const FAQ: Array<[string, string]> = [
  ['Does my file get uploaded?', "No. Files are read and processed in your browser. There's no server that receives them, and we don't collect analytics."],
  ['Does it catch everything?', 'No. Automatic detection can miss things: unusual names, text inside images, details that identify someone indirectly. Review every result before sharing.'],
  ['Can I anonymize an Excel file?', 'You can pseudonymize it: names, emails and IDs become consistent labels (the same customer keeps the same label in every row) while amounts stay, so totals still work. It reduces what you share; it can’t promise a dataset can never be re-identified.'],
  ['Does it work offline?', 'Yes, once it has loaded. Open Redacto and wait for “Ready offline” at the top, then turn off your Wi-Fi: opening files, finding personal details and exporting all keep working, because everything runs on your device.'],
  ['Is it really free and open source?', 'Yes. It’s free in the browser with no account, and the source code is public.'],
];
