import { File, FileImage, FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** App icon (top hat on a redacted page) and wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <img src="/brand/icon.webp" alt="" width={28} height={28} className="size-7" />
      <span className="text-[17px] font-bold tracking-tight">Redacto</span>
    </span>
  );
}

/** The brand's four-colour rule: violet, magenta, gold, teal. */
export function AccentBar() {
  return (
    <div aria-hidden className="grid h-0.5 grid-cols-[4fr_1fr_1fr_1fr]">
      <i className="bg-primary" />
      <i className="bg-magenta" />
      <i className="bg-gold" />
      <i className="bg-teal" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('size-3.5 shrink-0 animate-spin', className)} />;
}

export function KindIcon({ kind, className }: { kind?: string; className?: string }) {
  const Icon = kind === 'image' ? FileImage : kind === 'csv' || kind === 'xlsx' ? FileSpreadsheet : kind === 'pdf' || kind === 'docx' || kind === 'text' ? FileText : File;
  return <Icon aria-hidden className={cn('size-4', className)} />;
}
