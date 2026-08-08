import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true
  },
  themeVariables: {
    fontSize: '16px',
    primaryColor: '#121212',
    primaryTextColor: '#c9d1d9',
    primaryBorderColor: '#30363d',
    lineColor: '#58a6ff',
    secondaryColor: '#161b22',
    tertiaryColor: '#000000',
    backgroundColor: 'transparent'
  }
});

interface MermaidViewerProps {
  code: string;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!containerRef.current || !code) return;
    
    // Clear previous
    containerRef.current.innerHTML = '';
    setError(null);
    
    const renderChart = async () => {
      try {
        await document.fonts.ready;
        const id = `mermaid-svg-${Math.floor(Math.random() * 100000)}`;
        const { svg } = await mermaid.render(id, code);
        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err: any) {
        console.error("Mermaid parsing error:", err);
        if (isMounted) {
          setError(err.message || 'Invalid diagram syntax');
          if (containerRef.current) containerRef.current.innerHTML = '';
        }
      }
    };
    
    renderChart();
    return () => {
      isMounted = false;
    };
  }, [code]);

  return (
    <div className="mermaid-container my-6 border border-[var(--border)] bg-[#0d1117] rounded p-4 overflow-x-auto relative break-inside-avoid [&_svg]:!max-w-full [&_svg]:!h-auto print:bg-white print:border-none print:p-0 group">
      <div className="flex justify-between items-center mb-2 no-print">
        <div className="text-[10px] uppercase text-[var(--subtle)] font-bold tracking-widest">
          Diagram Preview
        </div>
        {error && (
          <button 
            onClick={() => { setError(null); }}
            className="text-[9px] bg-[#30363d] hover:bg-[#444c56] text-[var(--text)] px-1.5 py-0.5 rounded transition-colors"
          >
            Retry
          </button>
        )}
      </div>
      {error && (
        <div className="text-red-400 font-mono text-xs whitespace-pre-wrap mb-4 bg-red-900/10 p-2 rounded border border-red-900/30">
          <div className="font-bold mb-1">Mermaid Syntax Error:</div>
          {error}
        </div>
      )}
      <div 
        ref={containerRef} 
        className={`flex justify-center ${error ? 'hidden' : ''}`} 
      />
    </div>
  );
};
