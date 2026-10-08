import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearAll } from '../state/app';

/** Last line of defence: a rendering bug shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="m-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <TriangleAlert className="size-7 text-destructive" />
        <h2 className="text-lg font-semibold">Something went wrong displaying this document.</h2>
        <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button
            variant="outline"
            onClick={() => {
              clearAll();
              this.setState({ error: null });
            }}
          >
            Close all documents
          </Button>
        </div>
      </div>
    );
  }
}
