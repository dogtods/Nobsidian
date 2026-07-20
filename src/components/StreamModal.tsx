/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import { Note } from "../types";
import { parseStreamData } from "../utils/graphDataParser";

interface StreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  filterStart: string;
  filterEnd: string;
  excludedKeywords?: string[];
  onExcludeKeyword?: (kw: string) => void;
  onIncludeKeyword?: (kw: string) => void;
}

export default function StreamModal({
  isOpen,
  onClose,
  notes,
  filterStart,
  filterEnd,
  excludedKeywords = [],
  onExcludeKeyword,
  onIncludeKeyword
}: StreamModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isWeekly, setIsWeekly] = useState(false);
  const [wordLimit, setWordLimit] = useState(12);

  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; name: string; color: string }>({
    show: false,
    x: 0,
    y: 0,
    name: "",
    color: ""
  });

  // Calculate the full potential set of stream words/keywords (up to 60 keywords)
  const allStreamData = useMemo(() => {
    return parseStreamData(notes, filterStart, filterEnd, 60, excludedKeywords, isWeekly);
  }, [notes, filterStart, filterEnd, excludedKeywords, isWeekly]);

  // Extract active list based on wordLimit
  const activeSeries = useMemo(() => {
    return allStreamData.series.slice(0, wordLimit).map(s => {
      const sum = s.values.reduce((sum, v) => sum + v, 0);
      return { name: s.name, values: s.values, total: sum };
    });
  }, [allStreamData.series, wordLimit]);

  // Extract candidate pool (next in queue)
  const candidateSeries = useMemo(() => {
    return allStreamData.series.slice(wordLimit, wordLimit + 12).map(s => {
      const sum = s.values.reduce((sum, v) => sum + v, 0);
      return { name: s.name, values: s.values, total: sum };
    });
  }, [allStreamData.series, wordLimit]);

  // Shared stable color scale to draw waves and keep sidebar legends fully synced
  const colorScale = useMemo(() => {
    const activeKeys = activeSeries.map(s => s.name);
    return d3.scaleOrdinal(d3.schemeTableau10).domain(activeKeys);
  }, [activeSeries]);

  useEffect(() => {
    if (!isOpen || !svgRef.current || !containerRef.current) return;

    // Filtered data tailored dynamically to chosen wordLimit
    const data = {
      dates: allStreamData.dates,
      series: allStreamData.series.slice(0, wordLimit)
    };

    const container = containerRef.current;
    // Adapt width dynamically to the number of dates to support horizontal scrolling when there are lots of data points
    const width = Math.max(container.clientWidth - 32, data.dates.length * 35 + 120);
    const height = Math.max(380, container.clientHeight - 40);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous structures
    svg.attr("width", width).attr("height", height);

    if (data.series.length === 0 || data.dates.length === 0) {
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--muted)")
        .style("font-size", "14px")
        .text("指定した期間に WikiLink キーワードを含むノートがありません。除外を解除するか期間を広げてください。");
      return;
    }

    const margin = { top: 30, right: 30, bottom: 85, left: 45 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Format stack representation
    const stackData = data.dates.map((date, dateIdx) => {
      const obj: any = { date };
      data.series.forEach(col => {
        obj[col.name] = col.values[dateIdx] || 0;
      });
      return obj;
    });

    const keys = data.series.map(s => s.name);

    // Stream graph stacked layout (Organic wiggle offset)
    const stack = d3.stack()
      .keys(keys)
      .offset(d3.stackOffsetWiggle);

    const stackedSeries = stack(stackData);

    // X scale
    const xScale = d3.scalePoint()
      .domain(data.dates)
      .range([0, innerWidth]);

    // Y scale
    const yMax = d3.max(stackedSeries, layer => d3.max(layer, d => d[1])) || 1;
    const yMin = d3.min(stackedSeries, layer => d3.min(layer, d => d[0])) || 0;

    const yScale = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0]);

    // Graph Area wave mathematical path renderer
    const area = d3.area<any>()
      .x(d => xScale(d.data.date) || 0)
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveBasis);

    const paths = g.append("g")
      .selectAll("path")
      .data(stackedSeries)
      .join("path")
      .attr("class", "stream-path")
      .attr("fill", d => colorScale(d.key) as string)
      .attr("d", area)
      .style("opacity", 0.85)
      .style("cursor", "pointer")
      .on("mouseover", function (event, d) {
        g.selectAll(".stream-path").style("opacity", 0.25);
        d3.select(this)
          .style("opacity", 1)
          .style("stroke", "var(--bright)")
          .style("stroke-width", "1.5px");

        const [mx, my] = d3.pointer(event, container);
        const color = colorScale(d.key) as string;

        setTooltip({
          show: true,
          x: mx + 15,
          y: my - 25,
          name: d.key,
          color
        });
      })
      .on("mousemove", function (event) {
        const [mx, my] = d3.pointer(event, container);
        setTooltip(prev => ({ ...prev, x: mx + 15, y: my - 25 }));
      })
      .on("mouseout", function () {
        g.selectAll(".stream-path")
          .style("opacity", 0.85)
          .style("stroke", "none");

        setTooltip(prev => ({ ...prev, show: false }));
      })
      .on("click", (event, d) => {
        // Exclude wave key on click
        if (confirm(`キーワード 「${d.key}」 を除外リストに登録し、別のキーワードと交代させますか？`)) {
          onExcludeKeyword?.(d.key);
          setTooltip(prev => ({ ...prev, show: false }));
        }
      });

    // Draw X-Axis (Dates bottom timeline)
    const xAxis = g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(xScale)
          .tickSizeOuter(0)
          .ticks(window.innerWidth < 768 ? 6 : undefined as any)
          .tickFormat(d => {
            const rawStr = String(d);
            // Convert YYYY-MM-DD to MM/DD
            return rawStr.replace(/^\d{4}-/, '').replace('-', '/');
          })
      );

    xAxis.select(".domain").attr("stroke", "var(--border2)");
    xAxis.selectAll("line").attr("stroke", "var(--border2)");

    xAxis.selectAll("text")
      .attr("fill", "var(--subtle)")
      .attr("dx", "-0.85em")
      .attr("dy", "0.55em")
      .style("transform", "rotate(-90deg)")
      .style("text-anchor", "end")
      .style("font-size", "10px");

    // Seamless animated entry
    g.attr("opacity", 0).transition().duration(400).attr("opacity", 1);

  }, [isOpen, allStreamData, wordLimit, colorScale]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#0d1117] z-[1000] flex flex-col md:flex-row animate-[fadeIn_0.2s_ease-out]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Left panel: Interactive graph */}
      <div className="flex-1 flex flex-col h-2/3 md:h-full min-w-0">
        
        {/* Header */}
        <div className="p-4 px-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface)] shrink-0">
          <div className="text-sm md:text-base font-bold text-[var(--bright)] flex items-center gap-2">
            <span>🌊</span> 時系列トレンド・ストリーム (WikiLink の出現推移と交代)
          </div>

          <div
            className="cursor-pointer text-xl text-[var(--muted)] hover:text-[var(--red)] transition-colors select-none"
            onClick={onClose}
            title="閉じる"
          >
            ✕
          </div>
        </div>

        {/* Dynamic Controls Bar */}
        <div className="p-3 px-6 bg-[#161b22] border-b border-[var(--border)] flex flex-wrap gap-4 items-center shrink-0 text-xs">
          
          {/* Daily / Weekly toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[var(--muted)] font-bold">📅 集計間隔</span>
            <div className="flex bg-[#0d1117] border border-[var(--border2)] rounded p-0.5">
              <button
                type="button"
                onClick={() => setIsWeekly(false)}
                className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${
                  !isWeekly ? "bg-[var(--border)] text-[var(--blue)] font-bold" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                }`}
              >
                デイリー
              </button>
              <button
                type="button"
                onClick={() => setIsWeekly(true)}
                className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${
                  isWeekly ? "bg-[var(--border)] text-[var(--blue)] font-bold" : "text-[var(--subtle)] hover:bg-[#ffffff08]"
                }`}
              >
                週単位
              </button>
            </div>
          </div>

          {/* Word Count Slider */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px] max-w-[320px]">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-[var(--muted)] font-bold">🧬 推移に表示するワード数</span>
              <span className="text-[var(--purple)] font-mono font-bold">
                {wordLimit} 語まで
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full accent-[var(--purple)] cursor-pointer h-1 bg-[#21262d] rounded-lg appearance-none"
                min={5}
                max={30}
                step={1}
                value={wordLimit}
                onChange={(e) => setWordLimit(Number(e.target.value))}
              />
              <span className="text-[10px] text-[var(--muted)] shrink-0 select-none">
                5 ↔ 30
              </span>
            </div>
          </div>

          {/* Quick interactive helpers */}
          <div className="hidden lg:flex items-center gap-1.5 text-[var(--muted)] bg-[#1f242c] px-3 py-1.5 rounded border border-[#30363d] ml-auto text-[11px]">
            <span>💡</span>
            <span>波（または右の ✕ ボタン）をクリックすると除外され、次の候補キーワードが自動で繰り上がります。</span>
          </div>
        </div>

        {/* Graph area */}
        <div ref={containerRef} className="flex-1 relative bg-[#0d1117] overflow-auto select-none p-6">
          <svg ref={svgRef} className="block"></svg>

          {tooltip.show && (
            <div
              className="absolute bg-[rgba(22,27,34,0.95)] border border-[var(--border2)] rounded-md p-2 py-2.5 text-xs text-[var(--text)] pointer-events-none transition-opacity duration-150 backdrop-blur-[4px] shadow-xl z-[1010]"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className="text-[var(--muted)] text-[9px] uppercase tracking-wider mb-1 font-mono">ストリーム流 (クリックで除外)</div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tooltip.color }} />
                <span className="font-bold text-[var(--bright)] text-[13px]">[[{tooltip.name}]]</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Keyword Manager Sidebar */}
      <div className="w-full md:w-[320px] bg-[var(--surface)] border-t md:border-t-0 md:border-l border-[var(--border)] flex flex-col h-1/3 md:h-full shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[var(--border)] bg-[#161b22]/50 flex justify-between items-center text-xs text-[var(--muted)] font-bold font-mono">
          <span>🏷️ ストリーム・インスペクター</span>
          <span className="bg-[#21262d] px-2 py-0.5 rounded text-[10px]">
            実容量: {allStreamData.series.length} 語
          </span>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          
          {/* Active List */}
          <div>
            <div className="text-[11px] font-bold text-[var(--muted)] tracking-wider uppercase mb-2 flex justify-between">
              <span>🌊 現在表示中の {wordLimit} ワード</span>
              <span className="text-[var(--subtle)]">出現回数</span>
            </div>
            <div className="space-y-1.5">
              {activeSeries.map((s, idx) => {
                const waveColor = colorScale(s.name) as string;
                return (
                  <div 
                    key={s.name}
                    className="p-2 py-1.5 rounded bg-[#161b22] border border-[var(--border2)] flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-[var(--muted)] font-mono w-4">#{idx+1}</span>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: waveColor }} />
                      <span className="font-semibold text-[var(--bright)] truncate font-sans text-xs">[[{s.name}]]</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[var(--blue)] font-bold font-mono text-[11px] bg-[#21262d] px-1.5 py-0.5 rounded">
                        {s.total} 回
                      </span>
                      <button
                        type="button"
                        onClick={() => onExcludeKeyword?.(s.name)}
                        className="p-1 hover:bg-red-950/50 hover:text-red-400 text-[var(--muted)] rounded cursor-pointer border-0 bg-transparent text-xs transition-colors"
                        title="このキーワードを除外し、次の候補を上げる"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
              {activeSeries.length === 0 && (
                <div className="p-4 text-center text-[var(--muted)] border border-dashed border-[var(--border)] rounded text-xs">
                  表示中ワードはありません
                </div>
              )}
            </div>
          </div>

          {/* Pending queue list / Candidates */}
          <div>
            <div className="text-[11px] font-bold text-[var(--muted)] tracking-wider uppercase mb-2 flex justify-between">
              <span>📌 出現待ち・候補の控えるワード</span>
              <span className="text-[var(--subtle)]">出現回数</span>
            </div>
            
            <p className="text-[10px] text-[var(--muted)] leading-relaxed mb-2">
              ワード上限の数を引き上げるか、現在表示中の波を除外(交代)すると、以下の頻度が多い順からグラフへ昇格されます。
            </p>

            <div className="space-y-1.5">
              {candidateSeries.map((s, idx) => {
                return (
                  <div 
                    key={s.name}
                    className="p-2 py-1.5 rounded bg-[#161b22]/50 hover:bg-[#161b22] border border-[var(--border2)]/50 flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-[#484f58] font-mono w-4">#{wordLimit + idx + 1}</span>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-neutral-600" />
                      <span className="font-medium text-[var(--subtle)] truncate font-sans text-xs">[[{s.name}]]</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[var(--muted)] font-mono text-[11px] bg-[#161b22] px-1.5 py-0.5 rounded">
                        {s.total} 回
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Swap target: promote directly by excluding the lowest active element or just force display
                          // A very neat way is to exclude the lowest active element so this candidate automatically rises up!
                          if (activeSeries.length > 0) {
                            const lowestActiveName = activeSeries[activeSeries.length - 1].name;
                            if (confirm(`アクティブ表示の最下位 「${lowestActiveName}」 を除外し、候補の 「${s.name}」 をグラフに昇格させますか？`)) {
                              onExcludeKeyword?.(lowestActiveName);
                            }
                          } else {
                            // If none is active, increment slider
                            setWordLimit(prev => Math.min(30, prev + 1));
                          }
                        }}
                        className="px-2 py-0.5 text-[9px] bg-[var(--purple)]/20 hover:bg-[var(--purple)]/45 text-[var(--purple)] rounded font-semibold cursor-pointer border border-[var(--purple)]/30 transition-all font-sans"
                        title="このキーワードを昇格させて交代する"
                      >
                        昇格
                      </button>
                    </div>
                  </div>
                );
              })}
              {candidateSeries.length === 0 && (
                <div className="p-4 text-center text-neutral-600 border border-dashed border-neutral-800 rounded text-[11px]">
                  昇等待ちの控えているキーワード候補はありません
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Excluded Keywords (bottom of sidebar) */}
        {excludedKeywords && excludedKeywords.length > 0 && (
          <div className="p-3.5 bg-[#161b22] border-t border-[var(--border)] shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--muted)] mb-1.5 block">
              🚫 除外・交代済みのキーワード ({excludedKeywords.length})
            </span>
            <div className="flex flex-wrap gap-1 max-h-[85px] overflow-y-auto">
              {excludedKeywords.map(kw => (
                <span
                  key={kw}
                  onClick={() => onIncludeKeyword?.(kw)}
                  className="px-2 py-0.5 rounded-full bg-[#21262d] hover:bg-red-950/80 hover:text-red-300 text-[10px] cursor-pointer transition-all border border-[#30363d] font-mono text-[10px]"
                  title="除外（交代）を解除してグラフ候補に戻す"
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
