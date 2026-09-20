import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  markdown: string;
}

interface MathErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

interface MathErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render-time exceptions coming from the unified/remark/rehype
 * pipeline (e.g. a malformed $$...$$ block) so a single bad note never
 * crashes the whole app. Falls back to plain, unrendered text.
 */
class MathErrorBoundary extends React.Component<
  MathErrorBoundaryProps,
  MathErrorBoundaryState
> {
  constructor(props: MathErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MathErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('MarkdownRenderer: failed to render markdown/math', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ markdown }) => {
  return (
    <MathErrorBoundary
      fallback={<pre className="markdown-fallback">{markdown}</pre>}
    >
      <div className="markdown-renderer">
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[
            [
              rehypeKatex,
              {
                // Never throw on invalid LaTeX — render the offending
                // formula in errorColor instead of blowing up the tree.
                throwOnError: false,
                strict: false,
                errorColor: '#cc0000',
              },
            ],
          ]}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </MathErrorBoundary>
  );
};

export default MarkdownRenderer;
