/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Note } from "../types";
import { parseHeatmapData } from "../utils/graphDataParser";

interface HeatmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  filterStart: string;
  filterEnd: string;
  excludedKeywords?: string[];
  onExcludeKeyword?: (kw: string) => void;
  onIncludeKeyword?: (kw: string) => void;
}

export default function HeatmapModal({
  isOpen,
  onClose,
  notes,
  filterStart,
  filterEnd,
  excludedKeywords = [],
  onExcludeKeyword,
  onIncludeKeyword
}: HeatmapModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isWeekly, setIsWeekly] = useState(false);
  const [excludeExpanded, setExcludeExpanded] = useState(false);
  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; title: string; keyword: string; value: number }>({
    show: false,
    x: 0,
    y: 0,
    title: "",
    keyword: "",
    value: 0
  });

  useEffect(() => {
    if (!isOpen || !svgRef.current || !containerRef.current) return;

    // Fetch real parsed note data with excludedKeywords and isWeekly flag
    const data = parseHeatmapData(notes, filterStart, filterEnd, 15, excludedKeywords, isWeekly);

    const container = containerRef.current;
    // Adapt width and height dynamically based on dates and keywords count to enable perfect scrollability
    const width = Math.max(container.clientWidth - 48, data.dates.length * 35 + 160);
    const height = Math.max(container.clientHeight - 48, data.keywords.length * 28 + 140);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous drawing

    svg.attr("width", width).attr("height", height);

    if (data.keywords.length === 0 || data.dates.length === 0) {
      // Empty State
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--muted)")
        .style("font-size", "14px")
        .text("指定した期間に WikiLink キーワードを含むノートがありません");
      return;
    }

    // Increased bottom margin to accommodate longer vertically rotated date labels
    const margin = { top: 40, right: 30, bottom: 85, left: 110 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleBand()
      .range([0, innerWidth])
      .domain(data.dates)
      .padding(0.05);

    const yScale = d3.scaleBand()
      .range([0, innerHeight])
      .domain(data.keywords)
      .padding(0.05);

    // Color Scale: Blues/Purples
    const allValues = data.matrix.flat();
    const maxVal = d3.max(allValues) || 1;

    const colorScale = d3.scaleSequential()
      .interpolator(d3.interpolateBlues)
      .domain([0, maxVal * 1.1]);

    // X-Axis
    g.append("g")
      .style("font-size", "11px")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(
        d3.axisBottom(xScale)
          .tickSize(0)
          .ticks(window.innerWidth < 768 ? 6 : undefined as any)
          .tickFormat(d => {
            const rawStr = String(d);
            // Convert YYYY-MM-DD to MM/DD
            return rawStr.replace(/^\d{4}-/, '').replace('-', '/');
          })
      )
      .select(".domain").remove();

    // Rotate labels vertically
    g.selectAll(".tick text")
      .attr("fill", "var(--subtle)")
      .attr("dx", "-0.8em")
      .attr("dy", "0.5em")
      .style("transform", "rotate(-90deg)")
      .style("text-anchor", "end");

    // Y-Axis (with click to exclude functionality)
    g.append("g")
      .style("font-size", "11px")
      .call(d3.axisLeft(yScale).tickSize(0))
      .select(".domain").remove();

    g.selectAll(".tick text")
      .attr("fill", "var(--subtle)")
      .attr("dx", "-0.5em")
      .style("cursor", "pointer")
      .style("transition", "fill 0.15s")
      .attr("title", "クリックして除外設定")
      .on("mouseover", function() {
        d3.select(this).attr("fill", "var(--red)");
      })
      .on("mouseout", function() {
        d3.select(this).attr("fill", "var(--subtle)");
      })
      .on("click", (event, d) => {
        onExcludeKeyword?.(d as string);
      });

    // Flatten cell array for rendering
    const cells: { keyword: string; date: string; value: number }[] = [];
    data.keywords.forEach((kw, i) => {
      data.dates.forEach((date, j) => {
        cells.push({
          keyword: kw,
          date,
          value: data.matrix[i][j] || 0
        });
      });
    });

    // Drawing Rectangles!
    const rects = g.selectAll(".heatmap-cell")
      .data(cells)
      .enter()
      .append("rect")
      .attr("class", "heatmap-cell")
      .attr("x", d => xScale(d.date) || 0)
      .attr("y", d => yScale(d.keyword) || 0)
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .style("fill", d => d.value === 0 ? "var(--border)" : colorScale(d.value))
      .style("stroke", "var(--border2)")
      .style("stroke-width", 1)
      .style("transition", "stroke 0.15s, opacity 0.15s")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .style("stroke", "var(--bright)")
          .style("stroke-width", 2)
          .style("opacity", 0.85);

        // Compute relative screen coordinates
        const [mx, my] = d3.pointer(event, container);

        setTooltip({
          show: true,
          x: mx + 15,
          y: my - 35,
          title: d.date,
          keyword: d.keyword,
          value: d.value
        });
      })
      .on("mousemove", function (event) {
        const [mx, my] = d3.pointer(event, container);
        setTooltip(prev => ({
          ...prev,
          x: mx + 15,
          y: my - 35
        }));
      })
      .on("mouseleave", function () {
        d3.select(this)
          .style("stroke", "var(--border2)")
          .style("stroke-width", 1)
          .style("opacity", 1);

        setTooltip(prev => ({ ...prev, show: false }));
      });

    // Enter Animation
    rects.attr("opacity", 0)
      .transition()
      .duration(600)
      .delay((_, i) => i * 3)
      .attr("opacity", 1);

  }, [isOpen, notes, filterStart, filterEnd, excludedKeywords, isWeekly]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#0d1117] z-[1000] flex flex-col animate-[fadeIn_0.2s_ease-out]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div className="p-4 px-6 md:px-8 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface)]">
        <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
          <span>📊</span> WikiLink キーワード発生状況ヒートマップ (実データ分析)
        </div>
        
        {/* Aggregation Control Toggle */}
        <div className="flex gap-2 items-center">
          <div className="flex bg-[#1c2128] border border-[var(--border2)] rounded-md p-0.5 text-xs mr-4">
            <button
              onClick={() => setIsWeekly(false)}
              className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                !isWeekly ? "bg-[var(--border)] text-[var(--blue)] font-bold" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
              }`}
            >
              デイリー
            </button>
            <button
              onClick={() => setIsWeekly(true)}
              className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                isWeekly ? "bg-[var(--border)] text-[var(--blue)] font-bold" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
              }`}
            >
              週単位
            </button>
          </div>
          <div
            className="cursor-pointer text-xl text-[var(--muted)] hover:text-[var(--red)] transition-colors"
            onClick={onClose}
            title="閉じる"
          >
            ✕
          </div>
        </div>
      </div>

      {/* Excluded Keywords Management Panel */}
      {excludedKeywords && excludedKeywords.length > 0 ? (
        <div className="px-6 md:px-8 py-2 bg-[#161b22]/75 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <div className={`flex items-center gap-1.5 ${excludeExpanded ? "flex-wrap" : "flex-nowrap overflow-hidden max-w-[65vw] sm:max-w-[75vw]"}`}>
            <span className="font-semibold flex items-center gap-1 text-[var(--muted)] mr-1 shrink-0">
              <span className="text-amber-500">⚠</span> 除外中のキーワード (クリックで解除):
            </span>
            {excludedKeywords.map(kw => (
              <span
                key={kw}
                onClick={() => onIncludeKeyword?.(kw)}
                className="px-2.5 py-0.5 rounded-full bg-[#30363d] hover:bg-red-950/80 hover:text-red-300 hover:border-red-900/60 text-[var(--subtle)] cursor-pointer transition-all flex items-center gap-1 border border-[#30363d] font-mono text-[11px]"
                title="除外を解除"
              >
                {kw} <span className="text-[9px] opacity-70">✕</span>
              </span>
            ))}
          </div>
          {excludedKeywords.length > 3 && (
            <button
              onClick={() => setExcludeExpanded(!excludeExpanded)}
              className="shrink-0 ml-auto block text-[9.5px] hover:text-[var(--text)] text-[var(--muted)] transition-colors px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] cursor-pointer mt-1 sm:mt-0 font-medium whitespace-nowrap"
            >
              {excludeExpanded ? "▲ 1列に折りたたむ" : `▼ もっと見る (${excludedKeywords.length})`}
            </button>
          )}
        </div>
      ) : (
        <div className="px-6 md:px-8 py-2.5 bg-[#161b22]/40 border-b border-[var(--border)] text-[11px] text-[var(--muted)] flex items-center gap-1.5 font-medium">
          💡 <span className="font-mono">ヒートマップの左のキーワード名を直接クリックすると、不要なキーワードを除外リストに登録できます。</span>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={containerRef} id="heatmap-container" className="flex-1 relative overflow-auto p-6 bg-[#0d1117]">
        <svg ref={svgRef} id="heatmap-svg" className="block"></svg>

        {tooltip.show && (
          <div
            className="absolute bg-[rgba(22,27,34,0.95)] border border-[var(--border2)] rounded-md p-2 px-3 text-xs text-[var(--text)] pointer-events-none transition-opacity duration-150 backdrop-blur-[4px] shadow-lg z-[1100]"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="text-[var(--muted)] text-[10px] uppercase tracking-wider mb-1 font-mono">
              {isWeekly ? `${tooltip.title} 週` : tooltip.title}
            </div>
            <div className="flex justify-between gap-4 items-center">
              <span className="font-medium text-[var(--bright)]">[[{tooltip.keyword}]]</span>
              <span className="text-[var(--blue)] font-bold text-sm">{tooltip.value} 回出現</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
