import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { addFiles, dismissToast, store } from '../state/app';
import { useSlice } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';
import { SettingsDrawer } from './SettingsDrawer';
import { TopBar } from './TopBar';
import { Welcome } from './Welcome';
import { Workspace } from './Workspace';

export default function App() {
  const hasDocs = useSlice(store, (s) => s.docs.length > 0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dragging = useGlobalFileDrop();
  usePasteFiles();
  useToasts();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col">
        <TopBar onOpenSettings={() => setSettingsOpen(true)} />
        <ErrorBoundary>{hasDocs ? <Workspace /> : <Welcome />}</ErrorBoundary>
      </div>
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
      {dragging && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-night/70 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gold bg-night-2 px-12 py-10 text-center text-white">
            <Upload className="size-7 text-gold" />
            <strong className="text-lg">Drop to redact</strong>
            <span className="text-sm text-white/70">Files are opened in this tab. Nothing is uploaded.</span>
          </div>
        </div>
      )}
      <Toaster position="bottom-center" richColors closeButton />
    </TooltipProvider>
  );
}

/** Store notifications → toasts. Errors stay until dismissed. */
function useToasts() {
  const t = useSlice(store, (s) => s.toast);
  useEffect(() => {
    if (!t) return;
    if (t.kind === 'error') toast.error(t.msg, { duration: Infinity });
    else toast(t.msg);
    dismissToast();
  }, [t]);
}

/**
 * Files can be dropped anywhere. Default handling is always cancelled: without
 * this a drop outside the drop zone makes the browser navigate to the file,
 * throwing away the session.
 */
function useGlobalFileDrop() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addFiles(Array.from(e.dataTransfer!.files));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return dragging;
}

/** Pasting a screenshot or copied file opens it (text pastes are left to inputs). */
function usePasteFiles() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      addFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `Pasted image ${i + 1}.png`, { type: f.type }))));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);
}
