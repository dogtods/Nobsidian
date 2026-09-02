/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { Note } from "../types";
import { parseBubbleData, extractNoteKeywords, getFolderFromKeywords } from "../utils/graphDataParser";

interface BubbleModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  filterStart: string;
  filterEnd: string;
  excludedKeywords?: string[];
  onExcludeKeyword?: (kw: string) => void;
  onIncludeKeyword?: (kw: string) => void;
  excludedCategories?: string[];
  onExcludeCategory?: (cat: string) => void;
  onIncludeCategory?: (cat: string) => void;
  focusNote?: Note | null;
}

export default function BubbleModal({
  isOpen,
  onClose,
  notes,
  filterStart,
  filterEnd,
  excludedKeywords = [],
  onExcludeKeyword,
  onIncludeKeyword,
  excludedCategories = [],
  onExcludeCategory,
  onIncludeCategory,
  focusNote
}: BubbleModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isWeekly, setIsWeekly] = useState(false);
  const [excludeExpanded, setExcludeExpanded] = useState(false);

  // Extract keywords & category of the focused note if provided
  const noteKeywords = useMemo(() => {
    return focusNote ? extractNoteKeywords(focusNote) : [];
  }, [focusNote]);

  const noteCategory = useMemo(() => {
    return focusNote ? getFolderFromKeywords(focusNote.keywords) : undefined;
  }, [focusNote]);

  const [isFocusedMode, setIsFocusedMode] = useState<boolean>(() => {
    return Boolean(focusNote && (noteKeywords.length > 0 || noteCategory));
  });

  // Re-sync focus mode if focusNote changes
  useEffect(() => {
    if (focusNote && (noteKeywords.length > 0 || noteCategory)) {
      setIsFocusedMode(true);
    } else {
      setIsFocusedMode(false);
    }
  }, [focusNote, noteKeywords.length, noteCategory]);

  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; date: string; category: string; keyword: string; count: number; color: string }>({
    show: false,
    x: 0,
    y: 0,
    date: "",
    category: "",
    keyword: "",
    count: 0,
    color: ""
  });

  useEffect(() => {
    if (!isOpen || !svgRef.current || !containerRef.current) return;

    // Fetch dynamic bubble data parsed with focus filters if active
    const activeFocusKws = (isFocusedMode && noteKeywords.length > 0) ? noteKeywords : undefined;
    const activeFocusCat = isFocusedMode ? noteCategory : undefined;
    const rawData = parseBubbleData(notes, filterStart, filterEnd, excludedKeywords, isWeekly, excludedCategories, activeFocusKws, activeFocusCat);

    // Extract axes dimensions
    const dates = Array.from(new Set(rawData.map(d => d.date))).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());
    const categories = Array.from(new Set(rawData.map(d => d.category))).sort();

    const container = containerRef.current;
    // Adapt width and height dynamically based on dates and categories count to enable perfect scrollability
    const width = Math.max(container.clientWidth - 48, dates.length * 40 + 170);
    const height = Math.max(container.clientHeight - 48, categories.length * 36 + 150);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous rendering
    svg.attr("width", width).attr("height", height);

    if (rawData.length === 0) {
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--muted)")
        .style("font-size", "14px")
        .text("指定した条件に一致するキーワードを含むノートがありません");
      return;
    }

    // Increased bottom margin to prevent vertically rotated axis texts from bleeding
    const margin = { top: 40, right: 40, bottom: 95, left: 110 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleBand()
      .domain(dates)
      .range([0, innerWidth])
      .padding(0.15);

    const yScale = d3.scaleBand()
      .domain(categories)
      .range([innerHeight, 0])
      .padding(0.85); // Keeps lines far apart for reading safety

    const maxCount = d3.max(rawData, d => d.count) || 1;
    const radiusScale = d3.scaleSqrt()
      .domain([1, maxCount])
      .range([6, 34]); // Generous limits for visibility

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(categories);

    // Draw Gridlines with sub-dashed configurations
    g.append("g")
      .attr("class", "grid")
      .attr("stroke", "var(--border2)")
      .attr("stroke-opacity", 0.15)
      .attr("stroke-dasharray", "3,3")
      .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ""));

    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${innerHeight})`)
      .attr("stroke", "var(--border2)")
      .attr("stroke-opacity", 0.15)
      .attr("stroke-dasharray", "3,3")
      .style("pointer-events", "none")
      .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => ""));

    // Draw X Axis with customized year exclusion format
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
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
      .select(".domain").attr("stroke", "var(--border)");

    // Always rotate labels vertically
    g.selectAll(".tick text")
      .attr("fill", "var(--subtle)")
      .attr("dx", "-0.8em")
      .attr("dy", "0.5em")
      .style("transform", "rotate(-90deg)")
      .style("text-anchor", "end")
      .style("font-size", "11px");

    // Draw Y Axis with click to exclude folder category
    const yAxisGroup = g.append("g")
      .call(d3.axisLeft(yScale).tickSize(0));
    
    yAxisGroup.select(".domain").remove();

    yAxisGroup.selectAll(".tick text")
      .attr("fill", "var(--subtle)")
      .attr("dx", "-0.7em")
      .style("font-size", "11px")
      .style("cursor", "pointer")
      .style("transition", "fill 0.15s")
      .attr("title", "クリックしてこのカテゴリを除外")
      .on("mouseover", function() {
        d3.select(this).attr("fill", "var(--red)");
      })
      .on("mouseout", function() {
        d3.select(this).attr("fill", "var(--subtle)");
      })
      .on("click", (event, d) => {
        onExcludeCategory?.(d as string);
      });

    // Introduce a slight physics offset jitter so nodes with same coordinates overlap organically
    const jitter = () => (Math.random() - 0.5) * 14;

    const nodes = g.selectAll(".bubble-node")
      .data(rawData)
      .enter()
      .append("circle")
      .attr("class", "bubble-node")
      .attr("cx", d => (xScale(d.date) || 0) + xScale.bandwidth() / 2 + jitter())
      .attr("cy", d => (yScale(d.category) || 0) + jitter())
      .attr("r", 0) // Initialize with 0 radius for transition
      .attr("fill", d => colorScale(d.category) as string)
      .style("opacity", 0.72)
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        g.selectAll(".bubble-node").style("opacity", 0.18);
        d3.select(this)
          .style("opacity", 1)
          .style("stroke", "var(--bright)")
          .style("stroke-width", "2px");

        const [mx, my] = d3.pointer(event, container);
        const color = colorScale(d.category) as string;

        setTooltip({
          show: true,
          x: mx + 15,
          y: my - 35,
          date: d.date,
          category: d.category,
          keyword: d.keyword,
          count: d.count,
          color
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
        g.selectAll(".bubble-node")
          .style("opacity", 0.72)
          .style("stroke", "#0d1117")
          .style("stroke-width", "1.5px");

        setTooltip(prev => ({ ...prev, show: false }));
      })
      .on("click", (event, d) => {
        // Direct exclude keyword filter on click
        if (confirm(`キーワード 「${d.keyword}」 を除外リストに入れてグラフから隠しますか？`)) {
          onExcludeKeyword?.(d.keyword);
          setTooltip(prev => ({ ...prev, show: false }));
        }
      });

    // Animate Bubble Entry
    nodes.transition()
      .duration(750)
      .delay((_, i) => i * 15)
      .attr("r", d => radiusScale(d.count));

  }, [isOpen, notes, filterStart, filterEnd, excludedKeywords, excludedCategories, isWeekly, isFocusedMode, noteKeywords, noteCategory]);

  if (!isOpen) return null;

  const hasExcludes = (excludedKeywords && excludedKeywords.length > 0) || (excludedCategories && excludedCategories.length > 0);

  return (
    <div
      className="fixed inset-0 bg-[#0d1117] z-[1000] flex flex-col animate-[fadeIn_0.2s_ease-out]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div className="p-4 px-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface)]">
        <div className="text-base font-bold text-[var(--bright)] flex items-center gap-2">
          <span>🫧</span> WikiLink キーワードカテゴリ別バブルチャート (時間 × フォルダ構造解析)
        </div>
        
        {/* Toggle Aggregations */}
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

      {/* Focus Note Banner */}
      {focusNote && (
        <div className="px-6 md:px-8 py-2 bg-[#1f293d] border-b border-[#388bfd44] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-[#388bfd33] text-[#58a6ff] font-bold border border-[#388bfd66] text-[11px] flex items-center gap-1">
              📌 この記事にフォーカス
            </span>
            <span className="text-[var(--bright)] font-semibold max-w-[240px] sm:max-w-md truncate" title={focusNote.title}>
              {focusNote.title}
            </span>
            {noteCategory && (
              <span className="px-2 py-0.5 rounded bg-[#388bfd22] text-[#79c0ff] border border-[#388bfd33] text-[10px]">
                📁 {noteCategory}
              </span>
            )}
            <span className="text-[var(--muted)] text-[11px]">
              ({noteKeywords.length}個のキーワード)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#161b22] border border-[var(--border2)] rounded-md p-0.5 text-xs">
              <button
                onClick={() => setIsFocusedMode(true)}
                className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                  isFocusedMode ? "bg-[#388bfd33] text-[#58a6ff] font-bold border border-[#388bfd55]" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                }`}
              >
                記事フォーカス
              </button>
              <button
                onClick={() => setIsFocusedMode(false)}
                className={`px-3 py-1 font-semibold rounded cursor-pointer transition-all ${
                  !isFocusedMode ? "bg-[var(--border)] text-[var(--bright)] font-bold" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                }`}
              >
                全体バブル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excluded Keywords and Categories Management Panel */}
      {hasExcludes ? (
        <div className="px-6 md:px-8 py-2 bg-[#161b22]/75 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <div className={`flex items-center gap-1.5 ${excludeExpanded ? "flex-wrap" : "flex-nowrap overflow-hidden max-w-[65vw] sm:max-w-[75vw]"}`}>
            <span className="font-semibold flex items-center gap-1 text-[var(--muted)] mr-1 shrink-0">
              <span className="text-amber-500">⚠</span> 除外中 (クリックで解除):
            </span>
            
            {/* Excluded Folders */}
            {excludedCategories.map(cat => (
              <span
                key={cat}
                onClick={() => onIncludeCategory?.(cat)}
                className="px-2.5 py-0.5 rounded-full bg-[#1b2a3a] hover:bg-red-950/80 hover:text-red-300 hover:border-red-900/60 text-[#58a6ff] border border-[#388bfd40] cursor-pointer transition-all flex items-center gap-1 font-sans text-[11px] shrink-0"
                title="カテゴリ除外を解除"
              >
                📁 {cat} <span className="text-[9px] opacity-70">✕</span>
              </span>
            ))}

            {/* Excluded Keywords */}
            {excludedKeywords.map(kw => (
              <span
                key={kw}
                onClick={() => onIncludeKeyword?.(kw)}
                className="px-2.5 py-0.5 rounded-full bg-[#30363d] hover:bg-red-950/80 hover:text-red-300 hover:border-red-900/60 text-[var(--subtle)] border border-[#30363d] cursor-pointer transition-all flex items-center gap-1 font-mono text-[11px] shrink-0"
                title="キーワード除外を解除"
              >
                [[{kw}]] <span className="text-[9px] opacity-70">✕</span>
              </span>
            ))}
          </div>
          {(excludedCategories.length + excludedKeywords.length) > 3 && (
            <button
              onClick={() => setExcludeExpanded(!excludeExpanded)}
              className="shrink-0 ml-auto block text-[9.5px] hover:text-[var(--text)] text-[var(--muted)] transition-colors px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] cursor-pointer mt-1 sm:mt-0 font-medium whitespace-nowrap"
            >
              {excludeExpanded ? "▲ 1列に折りたたむ" : `▼ もっと見る (${excludedCategories.length + excludedKeywords.length})`}
            </button>
          )}
        </div>
      ) : (
        <div className="px-6 md:px-8 py-2.5 bg-[#161b22]/40 border-b border-[var(--border)] text-[11px] text-[var(--muted)] flex items-center gap-1.5 font-medium">
          💡 <span className="font-mono">バブル（丸）をクリックしてキーワードを除外し、左側（縦軸）のフォルダカテゴリ名をクリックして特定カテゴリをごっそりグラフから除外できます。</span>
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={containerRef} id="bubble-container" className="flex-1 relative overflow-auto p-6 bg-[#0d1117]">
        <svg ref={svgRef} id="bubble-svg" className="block"></svg>

        {tooltip.show && (
          <div
            className="absolute bg-[rgba(22,27,34,0.95)] border border-[var(--border2)] rounded-md p-2.5 px-4 text-xs text-[var(--text)] pointer-events-none transition-opacity duration-150 backdrop-blur-[4px] shadow-lg z-[1010]"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="text-[var(--muted)] text-[9px] uppercase tracking-wider mb-1 font-mono">
              {isWeekly ? `${tooltip.date} 週` : tooltip.date} | {tooltip.category} (Click to exclude)
            </div>
            <div className="font-bold text-sm text-[var(--bright)] mb-1">[[{tooltip.keyword}]]</div>
            <div>
              出現数: <span className="font-bold text-[var(--blue)]">{tooltip.count} 回</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
