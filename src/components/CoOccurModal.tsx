/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { Note, CoOccurNode, CoOccurEdge } from "../types";
import { parseCoOccurData, getFolderFromKeywords, extractWikiLinks, extractNoteKeywords } from "../utils/graphDataParser";

interface CoOccurModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  filterStart: string;
  filterEnd: string;
  excludedKeywords?: string[];
  onExcludeKeyword?: (kw: string) => void;
  onIncludeKeyword?: (kw: string) => void;
  focusNote?: Note | null;
}

export default function CoOccurModal({
  isOpen,
  onClose,
  notes,
  filterStart,
  filterEnd,
  excludedKeywords = [],
  onExcludeKeyword,
  onIncludeKeyword,
  focusNote
}: CoOccurModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);

  // Extract keywords of the focused note if provided
  const noteKeywords = useMemo(() => {
    return focusNote ? extractNoteKeywords(focusNote) : [];
  }, [focusNote]);

  const [isFocusedMode, setIsFocusedMode] = useState<boolean>(() => {
    return Boolean(focusNote && noteKeywords.length > 0);
  });

  // Re-sync focus mode if focusNote changes
  useEffect(() => {
    if (focusNote && noteKeywords.length > 0) {
      setIsFocusedMode(true);
    } else {
      setIsFocusedMode(false);
    }
  }, [focusNote, noteKeywords.length]);
  
  // States to empower "Invisible connections / correlation" discoveries
  const [metricMode, setMetricMode] = useState<"cooccur" | "correlation">("correlation");
  const [minLinkScore, setMinLinkScore] = useState<number>(0.12);
  const [activeSelectedNode, setActiveSelectedNode] = useState<CoOccurNode | null>(null);

  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; content: string }>({
    show: false,
    x: 0,
    y: 0,
    content: ""
  });

  // 1. Calculate folder categorization mapping for each keyword node
  const keywordFolderRepresentations = useMemo(() => {
    const counts: { [kw: string]: { [folder: string]: number } } = {};
    notes.forEach(note => {
      const folder = getFolderFromKeywords(note.keywords);
      const wikilinks = Array.from(new Set(extractWikiLinks(note.content)));
      wikilinks.forEach(kw => {
        const cleanKw = kw.trim();
        if (!counts[cleanKw]) counts[cleanKw] = {};
        counts[cleanKw][folder] = (counts[cleanKw][folder] || 0) + 1;
      });
    });

    const mapping: { [kw: string]: string } = {};
    Object.keys(counts).forEach(kw => {
      let maxFolder = "未分類";
      let maxVal = -1;
      Object.keys(counts[kw]).forEach(f => {
        if (counts[kw][f] > maxVal) {
          maxVal = counts[kw][f];
          maxFolder = f;
        }
      });
      mapping[kw] = maxFolder;
    });
    return mapping;
  }, [notes]);

  // 2. Setup colors based on folders to group keywords semantically
  const folderColors = useMemo(() => {
    const uniqueFolders = Array.from(new Set(notes.map(n => getFolderFromKeywords(n.keywords))));
    const colorMap: { [key: string]: string } = {};
    uniqueFolders.forEach((f, i) => {
      const hue = (i * (360 / Math.max(1, uniqueFolders.length))) % 360;
      colorMap[f] = `hsl(${hue}, 60%, 55%)`;
    });
    return colorMap;
  }, [notes]);

  // Handle default thresholds when switching metrics
  const handleMetricModeChange = (mode: "cooccur" | "correlation") => {
    setMetricMode(mode);
    setMinLinkScore(mode === "correlation" ? 0.12 : 2);
  };

  // 3. Extract the raw co-occurrence data (using focusKeywords if focused mode is active)
  const rawGraphData = useMemo(() => {
    const activeFocusKws = (isFocusedMode && noteKeywords.length > 0) ? noteKeywords : undefined;
    return parseCoOccurData(notes, filterStart, filterEnd, 60, excludedKeywords, activeFocusKws);
  }, [notes, filterStart, filterEnd, excludedKeywords, isFocusedMode, noteKeywords]);

  // 4. Transform and enrich Graph edges with Jaccard Similarity (Correlation index)
  const enrichedGraphData = useMemo(() => {
    const nodeMap = new Map<string, number>();
    rawGraphData.nodes.forEach(n => nodeMap.set(n.id, n.count));

    // Calculate Jaccard Score for each edge dynamically
    const enrichedEdges = rawGraphData.edges.map(e => {
      const srcId = typeof e.source === "string" ? e.source : (e.source as any).id;
      const tgtId = typeof e.target === "string" ? e.target : (e.target as any).id;
      const countA = nodeMap.get(srcId) || 1;
      const countB = nodeMap.get(tgtId) || 1;
      const unionCount = countA + countB - e.weight;
      // Jaccard Correlation metric
      const jaccard = unionCount > 0 ? Number((e.weight / unionCount).toFixed(3)) : 0;
      
      return {
        ...e,
        source: srcId,
        target: tgtId,
        jaccard
      };
    });

    // Filter edges dynamically based on user controls
    const filteredEdges = enrichedEdges.filter(e => {
      if (metricMode === "correlation") {
        return e.jaccard >= minLinkScore;
      } else {
        return e.weight >= minLinkScore;
      }
    });

    // Make sure nodes are only ones present in current viewport or top criteria
    return {
      nodes: rawGraphData.nodes.map(n => ({
        ...n,
        folder: keywordFolderRepresentations[n.id] || "未分類"
      })),
      edges: filteredEdges
    };
  }, [rawGraphData, metricMode, minLinkScore, keywordFolderRepresentations]);

  // 5. Generate metrics summary for sidebar
  const allCorrelationsList = useMemo(() => {
    const list: Array<{ source: string; target: string; weight: number; jaccard: number }> = [];
    const nodeMap = new Map<string, number>();
    rawGraphData.nodes.forEach(n => nodeMap.set(n.id, n.count));

    rawGraphData.edges.forEach(e => {
      const srcId = typeof e.source === "string" ? e.source : (e.source as any).id;
      const tgtId = typeof e.target === "string" ? e.target : (e.target as any).id;
      const countA = nodeMap.get(srcId) || 1;
      const countB = nodeMap.get(tgtId) || 1;
      const unionCount = countA + countB - e.weight;
      const jaccard = unionCount > 0 ? Number((e.weight / unionCount).toFixed(3)) : 0;

      list.push({
        source: srcId,
        target: tgtId,
        weight: e.weight,
        jaccard
      });
    });

    // Sort by jaccard desc or weight desc based on mode
    return list.sort((a, b) => {
      if (metricMode === "correlation") return b.jaccard - a.jaccard;
      return b.weight - a.weight;
    });
  }, [rawGraphData, metricMode]);

  // 6. Selected node correlations for inspector
  const activeNodeCorrelations = useMemo(() => {
    if (!activeSelectedNode) return [];
    const id = activeSelectedNode.id;
    const items: Array<{ partnerId: string; weight: number; jaccard: number }> = [];

    allCorrelationsList.forEach(e => {
      if (e.source === id) {
        items.push({ partnerId: e.target, weight: e.weight, jaccard: e.jaccard });
      } else if (e.target === id) {
        items.push({ partnerId: e.source, weight: e.weight, jaccard: e.jaccard });
      }
    });

    return items.sort((a, b) => {
      if (metricMode === "correlation") return b.jaccard - a.jaccard;
      return b.weight - a.weight;
    });
  }, [activeSelectedNode, allCorrelationsList, metricMode]);

  // 7. Graph rendering via D3 Force Simulation
  useEffect(() => {
    if (!isOpen || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clean up previous renders
    svg.attr("width", width).attr("height", height);

    if (enrichedGraphData.nodes.length === 0) {
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--muted)")
        .style("font-size", "14px")
        .text("表示条件に一致するキーワード・相関関係がありません。しきい値を下げてみてください。");
      return;
    }

    // Prepare deep clones to prevent mutations from crashing react states
    const nodes: any[] = enrichedGraphData.nodes.map(d => ({ ...d }));
    const links: any[] = enrichedGraphData.edges.map(d => ({
      source: d.source,
      target: d.target,
      weight: d.weight,
      jaccard: d.jaccard
    }));

    const maxCount = d3.max(nodes, d => d.count) || 1;
    const maxLinkValue = d3.max(links, l => metricMode === "correlation" ? l.jaccard : l.weight) || 1;

    // Scales
    const radiusScale = d3.scaleSqrt().domain([1, maxCount]).range([12, 36]);
    const linkWidthScale = d3.scaleLinear()
      .domain([0, maxLinkValue])
      .range(metricMode === "correlation" ? [1.5, 9.0] : [1.0, 7.5]);

    // Zoomable container sheet
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5.0])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);

    // Dynamic forces - stronger negative charges keep the structure pristine, with high velocityDecay to settle fast
    const simulation = d3.forceSimulation<any>(nodes)
      .velocityDecay(0.55)
      .force("link", d3.forceLink<any, any>(links).id(d => d.id).distance(110))
      .force("charge", d3.forceManyBody().strength(-240))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<any>().radius(d => radiusScale(d.count) + 9).iterations(1));

    simulationRef.current = simulation;

    const boxConstraint = (val: number, dim: number, buffer: number) => {
      return Math.max(buffer, Math.min(dim - buffer, val));
    };

    // Render correlation links (lines)
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "co-occur-link")
      .attr("stroke", "#4b9cd3")
      .attr("stroke-opacity", 0.45)
      .attr("stroke-width", d => linkWidthScale(metricMode === "correlation" ? d.jaccard : d.weight))
      .on("mouseover", function (event, d: any) {
        if (activeSelectedNode) return;
        d3.select(this).attr("stroke-opacity", 0.9).attr("stroke", "var(--purple)");

        const [mx, my] = d3.pointer(event, container);
        const scoreStr = metricMode === "correlation" 
          ? `相関度 (Jaccard): <strong class="text-[var(--purple)] text-[13px]">${(d.jaccard * 100).toFixed(1)}%</strong>`
          : `共起回数: <strong class="text-[var(--blue)] text-[13px]">${d.weight} 回</strong>`;

        setTooltip({
          show: true,
          x: mx + 15,
          y: my - 30,
          content: `
            <div class="font-[system-ui] text-left">
              <div class="text-[11px] text-[var(--muted)]">接続リンク</div>
              <div class="flex items-center gap-1.5 font-bold my-1 text-[var(--text)]">
                <span>${d.source.id}</span> ↔ <span>${d.target.id}</span>
              </div>
              <div class="mt-1">${scoreStr}</div>
            </div>
          `
        });
      })
      .on("mousemove", (event) => {
        const [mx, my] = d3.pointer(event, container);
        setTooltip(prev => ({ ...prev, x: mx + 15, y: my - 30 }));
      })
      .on("mouseout", function () {
        if (activeSelectedNode) return;
        d3.select(this).attr("stroke-opacity", 0.45).attr("stroke", "#4b9cd3");
        setTooltip(prev => ({ ...prev, show: false }));
      });

    // Drag helper callbacks
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.2).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Nodes (Circular Bubbles)
    const nodeGroup = g.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("class", "co-occur-node")
      .attr("r", d => radiusScale(d.count))
      .attr("fill", d => folderColors[d.folder] || "#6e7681")
      .style("cursor", "pointer")
      .attr("data-id", d => d.id)
      .call(
        d3.drag<SVGCircleElement, any>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      )
      .on("mouseover", function (event, d) {
        if (activeSelectedNode) return;
        d3.select(this)
          .style("stroke", "var(--bright)")
          .style("stroke-width", "2.5px");

        const [mx, my] = d3.pointer(event, container);
        setTooltip({
          show: true,
          x: mx + 15,
          y: my - 50,
          content: `
            <div class="text-left font-sans">
              <div class="text-[9px] text-[var(--muted)] uppercase tracking-wide">代表分類: ${d.folder}</div>
              <div class="font-[Heading] font-bold text-[14px] text-[var(--bright)] my-0.5">[[${d.id}]]</div>
              <div class="text-[11px] text-[var(--text)] mt-1">出現ノート数: <span class="font-bold text-[var(--blue)]">${d.count} 回</span></div>
            </div>
          `
        });
      })
      .on("mousemove", (event) => {
        const [mx, my] = d3.pointer(event, container);
        setTooltip(prev => ({ ...prev, x: mx + 15, y: my - 50 }));
      })
      .on("mouseout", function () {
        if (activeSelectedNode) return;
        d3.select(this)
          .style("stroke", "none");
        setTooltip(prev => ({ ...prev, show: false }));
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        setActiveSelectedNode(prev => (prev && prev.id === d.id) ? null : d);
        setTooltip(prev => ({ ...prev, show: false }));
      });

    // Labels centered above bubbles
    const label = g.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .attr("class", "co-occur-label")
      .attr("text-anchor", "middle")
      .attr("dy", "0.3em")
      .style("pointer-events", "none")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .style("fill", "#ffffff")
      .style("text-shadow", "0 1.5px 3px rgba(0,0,0,0.9), 0 0 2.5px rgba(0,0,0,0.75)")
      .text(d => d.id);

    // Tick layout solver
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      nodeGroup
        .attr("cx", d => d.x = boxConstraint(d.x!, width, radiusScale(d.count) + 5))
        .attr("cy", d => d.y = boxConstraint(d.y!, height, radiusScale(d.count) + 5));

      label
        .attr("x", d => d.x!)
        .attr("y", d => d.y!);
    });

    // Outer backdrop interaction to deselect highlight focus
    svg.on("click", () => {
      setActiveSelectedNode(null);
    });

    g.attr("opacity", 0).transition().duration(400).attr("opacity", 1);

    return () => {
      simulation.stop();
    };
  }, [isOpen, enrichedGraphData, folderColors, metricMode, minLinkScore]);

  // 8. Handle highlighting dynamically when activeSelectedNode changes
  useEffect(() => {
    if (!isOpen || !svgRef.current) return;
    const svg = d3.select(svgRef.current);

    if (!activeSelectedNode) {
      // Clear focus opacity
      svg.selectAll(".co-occur-node")
        .style("opacity", 1)
        .style("stroke", "none");
      svg.selectAll(".co-occur-label")
        .style("opacity", 1);
      svg.selectAll(".co-occur-link")
        .style("opacity", 0.45)
        .style("stroke", "#4b9cd3");
    } else {
      const selectedId = activeSelectedNode.id;
      const connectedIds = new Set<string>();
      connectedIds.add(selectedId);

      // Determine the connection partners
      svg.selectAll(".co-occur-link").each(function(l: any) {
        const srcId = l.source.id ?? l.source;
        const tgtId = l.target.id ?? l.target;
        if (srcId === selectedId) {
          connectedIds.add(tgtId);
        } else if (tgtId === selectedId) {
          connectedIds.add(srcId);
        }
      });

      // Highlight links
      svg.selectAll(".co-occur-link")
        .style("opacity", (l: any) => {
          const srcId = l.source.id ?? l.source;
          const tgtId = l.target.id ?? l.target;
          return (srcId === selectedId || tgtId === selectedId) ? 1.0 : 0.05;
        })
        .style("stroke", (l: any) => {
          const srcId = l.source.id ?? l.source;
          const tgtId = l.target.id ?? l.target;
          return (srcId === selectedId || tgtId === selectedId) ? "var(--purple)" : "#30363d";
        });

      // Highlight nodes & hide labels for disconnected elements
      svg.selectAll(".co-occur-node")
        .style("opacity", (n: any) => connectedIds.has(n.id) ? 1.0 : 0.1)
        .style("stroke", (n: any) => n.id === selectedId ? "var(--bright)" : "none")
        .style("stroke-width", (n: any) => n.id === selectedId ? "3.5px" : "0px");

      svg.selectAll(".co-occur-label")
        .style("opacity", (n: any) => connectedIds.has(n.id) ? 1.0 : 0.08);
    }
  }, [activeSelectedNode, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#0d1117] z-[1000] flex flex-col md:flex-row animate-[fadeIn_0.2s_ease-out]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Main Graph Panel */}
      <div className="flex-1 flex flex-col h-2/3 md:h-full min-w-0">
        
        {/* Header */}
        <div className="p-4 px-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface)] shrink-0">
          <div className="text-sm md:text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <span>🌐</span> キーワード相関・共起ネットワーク (潜在的つながりの抽出)
          </div>
          <div
            className="cursor-pointer text-xl text-[var(--muted)] hover:text-[var(--red)] transition-colors select-none"
            onClick={onClose}
            title="閉じる"
          >
            ✕
          </div>
        </div>

        {/* Focus Note Banner */}
        {focusNote && (
          <div className="px-6 py-2 bg-[#1f293d] border-b border-[#388bfd44] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-[#388bfd33] text-[#58a6ff] font-bold border border-[#388bfd66] text-[11px] flex items-center gap-1">
                📌 この記事の共起関係
              </span>
              <span className="text-[var(--bright)] font-semibold max-w-[240px] sm:max-w-md truncate" title={focusNote.title}>
                {focusNote.title}
              </span>
              <span className="text-[var(--muted)] text-[11px]">
                ({noteKeywords.length}個のキーワード)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-[#161b22] border border-[var(--border2)] rounded-md p-0.5 text-xs">
                <button
                  onClick={() => setIsFocusedMode(true)}
                  disabled={noteKeywords.length === 0}
                  className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                    isFocusedMode ? "bg-[#388bfd33] text-[#58a6ff] font-bold border border-[#388bfd55]" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                  }`}
                >
                  記事の共起 ({noteKeywords.length})
                </button>
                <button
                  onClick={() => setIsFocusedMode(false)}
                  className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                    !isFocusedMode ? "bg-[var(--border)] text-[var(--bright)] font-bold" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                  }`}
                >
                  全体共起
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Interactive Controller Bar */}
        <div className="p-3 px-6 bg-[#161b22] border-b border-[var(--border)] flex flex-wrap gap-4 items-center shrink-0 text-xs">
          
          {/* Analysis mode toggles */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--muted)] font-bold">🎯 分析モードの切り替え</span>
            <div className="flex bg-[#0d1117] border border-[var(--border2)] rounded p-0.5">
              <button
                type="button"
                className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${metricMode === "correlation" ? "bg-[var(--purple)] text-white" : "text-[var(--text)] hover:bg-[#ffffff0c]"}`}
                onClick={() => handleMetricModeChange("correlation")}
                title="同じノートに一緒に登場する割合の高さ（類似度）を基に関係をあぶり出す"
              >
                🔗 相関係数 (Jaccard)
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${metricMode === "cooccur" ? "bg-[var(--blue)] text-white" : "text-[var(--text)] hover:bg-[#ffffff0c]"}`}
                onClick={() => handleMetricModeChange("cooccur")}
                title="純粋な累積共起（同一ノートでの登場回数）をグラフの線にする"
              >
                📊 共起回数 (Raw)
              </button>
            </div>
          </div>

          {/* Slider threshold filter */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px] max-w-[320px]">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[var(--muted)] font-bold">🧬 接続密度のしきい値(フィルター)</span>
              <span className="text-[var(--bright)] font-mono font-bold">
                {metricMode === "correlation" ? `Jaccard ≧ ${Math.round(minLinkScore * 100)}%` : `${minLinkScore} 回以上`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full accent-[var(--purple)] cursor-pointer h-1 bg-[#21262d] rounded-lg appearance-none"
                min={metricMode === "correlation" ? 0.02 : 1}
                max={metricMode === "correlation" ? 0.50 : 8}
                step={metricMode === "correlation" ? 0.02 : 1}
                value={minLinkScore}
                onChange={(e) => setMinLinkScore(Number(e.target.value))}
              />
              <span className="text-[10px] text-[var(--muted)] shrink-0 select-none">
                {metricMode === "correlation" ? "低 ↔ 高" : "少 ↔ 多"}
              </span>
            </div>
          </div>

          {/* Quick manual alert / helper */}
          <div className="hidden lg:flex items-center gap-1.5 text-[var(--muted)] bg-[#1f242c] px-3 py-1.5 rounded border border-[#30363d] ml-auto text-[11px]">
            <span>💡</span> 
            <span>バブルをクリックすると<b>個別相関インスペクター</b>が起動。明暗で結びつきを強調表示します。</span>
          </div>
        </div>

        {/* Canvas & Canvas Tooltip */}
        <div ref={containerRef} className="flex-1 relative bg-[#0d1117] overflow-hidden select-none">
          <svg ref={svgRef} className="w-full h-full"></svg>

          {/* Back drop to clear selection helper */}
          {activeSelectedNode && (
            <div className="absolute top-3 left-4 bg-[#79c0ff18] border border-[#79c0ff44] px-2.5 py-1 rounded-full text-[11px] text-[var(--blue)] font-bold animate-[fadeIn_0.2s_ease-out] flex items-center gap-1.5">
              <span>🎯 選択中: [[{activeSelectedNode.id}]]</span>
              <button
                type="button"
                className="hover:text-[var(--bright)] text-[var(--muted)] hover:bg-[#ffffff11] p-0.5 rounded ml-1 bg-transparent border-0 cursor-pointer text-[10px] transition-all font-bold"
                onClick={() => setActiveSelectedNode(null)}
                title="選択をクリア"
              >
                ✕
              </button>
            </div>
          )}

          {tooltip.show && (
            <div
              className="absolute bg-[rgba(22,27,34,0.95)] border border-[var(--border2)] rounded-md p-2.5 px-3.5 text-xs text-[var(--text)] pointer-events-none transition-opacity duration-150 backdrop-blur-[4px] shadow-xl z-[1010]"
              style={{ left: tooltip.x, top: tooltip.y }}
              dangerouslySetInnerHTML={{ __html: tooltip.content }}
            />
          )}
        </div>
      </div>

      {/* Correlation Inspector Sidebar (Right side) */}
      <div className="w-full md:w-[320px] bg-[var(--surface)] border-t md:border-t-0 md:border-l border-[var(--border)] flex flex-col h-1/3 md:h-full shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[var(--border)] bg-[#161b22]/50 flex justify-between items-center text-xs text-[var(--muted)] font-bold font-mono">
          <span>⚙ 相関インスペクター (INSPECTOR)</span>
          <span className="bg-[#21262d] px-2 py-0.5 rounded text-[10px]">
            検出数: {enrichedGraphData.nodes.length}語
          </span>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          
          {!activeSelectedNode ? (
            /* ================= MODE: OVERVIEW ================= */
            <div className="space-y-4 text-xs animate-[fadeIn_0.2s_ease-out]">
              
              <div className="bg-[#1f242c] p-3.5 rounded-lg border border-[var(--border2)]">
                <span className="font-bold text-[var(--bright)] mb-1 block">🔍 見えない関係の抽出とは？</span>
                <p className="text-[var(--muted)] leading-relaxed text-[11px]">
                  同じノート内に同時に出現するキーワード達の<b>「出現パターン」</b>を統計分析します。
                  Jaccard係数を使用することで、<b>「普段は出現しないが、特定のトピックの時に必ずセットで登場する親密な関係」</b>が、線の太さや距離で浮かび上がります。
                </p>
              </div>

              {/* Top strongest correlation pairs */}
              <div>
                <div className="text-[11px] font-bold text-[var(--muted)] tracking-wider uppercase mb-2">
                  🏆 全体の中で最も相関が強い関係ペア
                </div>
                <div className="space-y-1.5">
                  {allCorrelationsList.slice(0, 10).map((p, idx) => {
                    return (
                      <div 
                        key={idx}
                        className="p-2 py-2.5 rounded bg-[#161b22] hover:bg-[#30363d]/50 transition-colors flex justify-between items-center border border-[var(--border2)]/50 cursor-pointer"
                        onClick={() => {
                          const foundNode = enrichedGraphData.nodes.find(n => n.id === p.source || n.id === p.target);
                          if (foundNode) setActiveSelectedNode(foundNode);
                        }}
                      >
                        <div className="flex items-center gap-1 min-w-0 flex-1 pr-2">
                          <span className="text-[#8b949e] font-mono text-[10px] w-4 shrink-0">#{idx + 1}</span>
                          <span className="font-semibold text-[var(--bright)] truncate">[[{p.source}]]</span>
                          <span className="text-[#8b949e] shrink-0 text-[10px]">↔</span>
                          <span className="font-semibold text-[var(--bright)] truncate">[[{p.target}]]</span>
                        </div>
                        <div className="text-right shrink-0">
                          {metricMode === "correlation" ? (
                            <span className="text-[var(--purple)] font-bold font-mono">
                              {Math.round(p.jaccard * 100)}%
                            </span>
                          ) : (
                            <span className="text-[var(--blue)] font-bold font-mono bg-[#1f242c] px-1.5 py-0.5 rounded text-[10px]">
                              {p.weight} 回
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {allCorrelationsList.length === 0 && (
                    <div className="p-3 text-center text-[var(--muted)] bg-[#161b22] rounded border border-dashed border-[var(--border)]">
                      相関関係が見つかりません。
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* ================= MODE: SELECTED NODE DETAILS ================= */
            <div className="space-y-4 text-xs animate-[fadeIn_0.2s_ease-out]">
              
              {/* Selected card details */}
              <div 
                className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--purple)]/40 relative overflow-hidden space-y-2"
                style={{ borderLeftWidth: "4px", borderLeftColor: folderColors[keywordFolderRepresentations[activeSelectedNode.id] || "未分類"] || "var(--purple)" }}
              >
                <div className="flex justify-between items-start gap-1">
                  <div>
                    <span className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-wider">
                      代表カテゴリー分化
                    </span>
                    <span className="text-[var(--text)] bg-[#21262d] py-0.5 px-2 rounded-full font-bold ml-2 text-[10px]">
                      📁 {activeSelectedNode.folder || "未分類"}
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setActiveSelectedNode(null)} 
                    className="text-[var(--subtle)] hover:text-white bg-transparent border-0 cursor-pointer p-0.5 text-[11px]"
                  >
                    解除 ✕
                  </button>
                </div>
                
                <h3 className="text-base font-bold text-[var(--bright)] font-sans m-0 pt-1">
                  [[{activeSelectedNode.id}]]
                </h3>

                <div className="flex justify-between items-center pt-2 text-[#8b949e] border-t border-[var(--border2)]/40 text-[11px]">
                  <span>出現するノート総数:</span>
                  <span className="font-mono font-bold text-[var(--blue)] text-xs">
                    {activeSelectedNode.count} ノート
                  </span>
                </div>

                <div className="pt-2 text-right">
                  <button
                    type="button"
                    className="w-full py-1.5 px-3 bg-[#f8514930] hover:bg-[#f851494e] border border-[#f5363644] rounded text-[#f85149] cursor-pointer font-bold text-[10px] transition-all"
                    onClick={() => {
                      onExcludeKeyword?.(activeSelectedNode.id);
                      setActiveSelectedNode(null);
                    }}
                  >
                    🚫 不要なキーワードとして除外
                  </button>
                </div>
              </div>

              {/* Direct connections (Correlation Ranking) for the selected node */}
              <div>
                <div className="text-[11px] font-bold text-[var(--muted)] tracking-wider uppercase mb-2">
                  ⛓ [[{activeSelectedNode.id}]] との相関度ランキング
                </div>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {activeNodeCorrelations.map((conn, idx) => {
                    const targetRepresentedFolder = keywordFolderRepresentations[conn.partnerId] || "未分類";
                    const isTargetPresent = enrichedGraphData.nodes.some(n => n.id === conn.partnerId);

                    return (
                      <div 
                        key={idx}
                        className={`p-2.5 rounded bg-[#161b22] hover:bg-[#30363d]/50 transition-colors flex justify-between items-center border border-[var(--border2)]/50 cursor-pointer ${!isTargetPresent ? "opacity-40" : ""}`}
                        title={!isTargetPresent ? "現在の接続しきい値(フィルター)を下回っているためグラフ線が閉じられています" : "クリックしてフォーカス"}
                        onClick={() => {
                          const partnerNode = enrichedGraphData.nodes.find(n => n.id === conn.partnerId);
                          if (partnerNode) setActiveSelectedNode(partnerNode);
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                          {/* Folder color bullet */}
                          <span 
                            className="w-2 h-2 rounded-full shrink-0" 
                            style={{ backgroundColor: folderColors[targetRepresentedFolder] || "#6e7681" }}
                          />
                          <span className="font-semibold text-[var(--bright)] truncate">
                            [[{conn.partnerId}]]
                          </span>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-1.5">
                          {metricMode === "correlation" ? (
                            <span className="text-[var(--purple)] font-mono font-bold">
                              {Math.round(conn.jaccard * 100)}%
                            </span>
                          ) : (
                            <span className="text-[var(--blue)] font-mono font-bold">
                              {conn.weight} 回
                            </span>
                          )}
                          {!isTargetPresent && <span className="text-[9px] text-amber-500 font-bold" title="しきい値未満">(非表示)</span>}
                        </div>
                      </div>
                    );
                  })}
                  {activeNodeCorrelations.length === 0 && (
                    <div className="p-3 text-center text-[var(--muted)] bg-[#161b22] rounded border border-dashed border-[var(--border)]">
                      接続されているキーワードがありません。
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Excluded Panel built in the sidebar bottom */}
        {excludedKeywords && excludedKeywords.length > 0 && (
          <div className="p-3.5 bg-[#161b22] border-t border-[var(--border)] shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--muted)] mb-1.5 block">
              🚫 除外中のキーワード ({excludedKeywords.length})
            </span>
            <div className="flex flex-wrap gap-1 max-h-[85px] overflow-y-auto">
              {excludedKeywords.map(kw => (
                <span
                  key={kw}
                  onClick={() => onIncludeKeyword?.(kw)}
                  className="px-2 py-0.5 rounded-full bg-[#21262d] hover:bg-red-950/80 hover:text-red-300 text-[10px] cursor-pointer transition-all border border-[#30363d] font-mono text-[10px]"
                  title="除外を解除"
                >
                  {kw} ✕
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
