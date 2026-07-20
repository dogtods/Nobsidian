/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Note, GraphNode, GraphLink, FolderRelation } from "../types";
import { getFolderFromKeywords, formatDateStr, extractWikiLinks } from "../utils/graphDataParser";
import { DEFAULT_PROMPTS } from "./PromptSettingsModal";

interface KnowledgeGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onSelectNote: (id: string) => void;
  onSaveToast: (msg: string) => void;
  onCreateNoteExt: (title: string, content: string, folder: string, sourceUrl: string) => Note;
  apiPost: (body: any) => Promise<any>;
  onForceRefreshNotes: () => void;
  filterStart: string;
  filterEnd: string;
}

export default function KnowledgeGraphModal({
  isOpen,
  onClose,
  notes,
  onSelectNote,
  onSaveToast,
  onCreateNoteExt,
  apiPost,
  onForceRefreshNotes,
  filterStart,
  filterEnd,
}: KnowledgeGraphModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [minStrength, setMinStrength] = useState<number>(0);
  const [graphViewMode, setGraphViewMode] = useState<"note" | "folder">("note");
  const [folderRelationsAI, setFolderRelationsAI] = useState<FolderRelation[]>([]);
  const [lastGraphAiTime, setLastGraphAiTime] = useState(0);
  const [isFullLabel, setIsFullLabel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reportSelectedNodes, setReportSelectedNodes] = useState<Map<string, { title: string; content: string }>>(new Map());
  const [highlightMode, setHighlightMode] = useState<"connection" | "folder">("connection");
  const [activeSelectedNode, setActiveSelectedNode] = useState<GraphNode | null>(null);
  const [activeSelectedFolder, setActiveSelectedFolder] = useState<string | null>(null);
  const applyHighlightRef = useRef<((selNode: GraphNode | null, selFolder: string | null, mode: "connection" | "folder") => void) | null>(null);

  // Apply D3 highlight whenever selection states or modes change
  useEffect(() => {
    if (applyHighlightRef.current) {
      applyHighlightRef.current(activeSelectedNode, activeSelectedFolder, highlightMode);
    }
  }, [highlightMode, activeSelectedNode, activeSelectedFolder]);

  // Report modal states
  const [showReportResult, setShowReportResult] = useState(false);
  const [reportResultText, setReportResultText] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Popup state
  const [popup, setPopup] = useState<{
    show: boolean;
    x: number;
    y: number;
    node: GraphNode | null;
  }>({ show: false, x: 0, y: 0, node: null });

  // Load Folder relations
  useEffect(() => {
    try {
      const fr = localStorage.getItem("cn_folder_relations_ai");
      if (fr) setFolderRelationsAI(JSON.parse(fr));

      const lt = localStorage.getItem("cn_last_graph_ai_time");
      if (lt) setLastGraphAiTime(parseInt(lt, 10) || 0);
    } catch (e) {}
  }, []);

  // Save changes helper
  const saveFolderRelationsLocally = (rels: FolderRelation[], time: number) => {
    localStorage.setItem("cn_folder_relations_ai", JSON.stringify(rels));
    localStorage.setItem("cn_last_graph_ai_time", String(time));
    setFolderRelationsAI(rels);
    setLastGraphAiTime(time);
  };

  const getFolder = (note: Note) => getFolderFromKeywords(note.keywords);

  const getFilteredNotesList = () => {
    const startTime = filterStart ? new Date(filterStart + "T00:00:00").getTime() : null;
    const endTime = filterEnd ? new Date(filterEnd + "T23:59:59").getTime() : null;

    return notes.filter(n => {
      if (startTime && n.createdAt < startTime) return false;
      if (endTime && n.createdAt > endTime) return false;

      const folderName = getFolder(n);

      return true;
    });
  };

  // Graph data builds
  const buildGraphData = () => {
    const list = getFilteredNotesList();

    if (graphViewMode === "folder") {
      const folderMap: { [key: string]: GraphNode } = {};
      const links: GraphLink[] = [];

      list.forEach(note => {
        const folderName = getFolder(note);
        if (!folderMap[folderName]) {
          folderMap[folderName] = {
            id: folderName,
            title: folderName,
            noteCount: 0,
            linkCount: 0,
            notes: []
          };
        }
        folderMap[folderName].noteCount!++;
        folderMap[folderName].notes!.push(note);
      });

      const nodes = Object.values(folderMap);
      const folderTitles = nodes.map(n => n.title);

      // Links extracted via note content WikiLink mappings
      list.forEach(note => {
        const srcFolder = getFolder(note);
        const matches = [...note.content.matchAll(/\[\[(.*?)\]\]/g)];
        matches.forEach(m => {
          const targetTitle = m[1].trim();
          const targetNote = list.find(n => n.title === targetTitle);
          if (targetNote) {
            const tgtFolder = getFolder(targetNote);
            if (srcFolder !== tgtFolder) {
              const existing = links.find(l => l.source === srcFolder && l.target === tgtFolder);
              if (existing) {
                existing.value!++;
              } else {
                links.push({
                  source: srcFolder,
                  target: tgtFolder,
                  value: 1,
                  type: "wiki"
                });
              }
              folderMap[srcFolder].linkCount!++;
              folderMap[tgtFolder].linkCount!++;
            }
          }
        });
      });

      // AI relationships mapping
      folderRelationsAI.forEach(rel => {
        if (folderTitles.includes(rel.source) && folderTitles.includes(rel.target)) {
          links.push({
            source: rel.source,
            target: rel.target,
            value: 2.5,
            type: "ai",
            label: rel.reason
          });
        }
      });

      return { nodes, links };
    } else {
      const nodes: GraphNode[] = [];
      const links: GraphLink[] = [];
      const titleToNodeMap: { [key: string]: GraphNode } = {};

      list.forEach(note => {
        const gNode: GraphNode = {
          id: note.id,
          title: note.title,
          content: note.content,
          folder: getFolder(note),
          linkCount: 0,
          z: (Math.random() - 0.5) * 160,
          vz: 0
        };
        nodes.push(gNode);
        titleToNodeMap[note.title] = gNode;
      });

      list.forEach(note => {
        if (!note.content) return;
        const matches = [...note.content.matchAll(/\[\[(.*?)\]\]/g)];
        matches.forEach(m => {
          const targetTitle = m[1].trim();
          const targetNode = titleToNodeMap[targetTitle];
          if (targetNode && targetNode.id !== note.id) {
            // Check double or mutual links to consolidate them but increase connection strength
            const existingLink = links.find(l => 
              (l.source === note.id && l.target === targetNode.id) ||
              (l.source === targetNode.id && l.target === note.id)
            );

            if (existingLink) {
              existingLink.isMutual = true;
              // Increase connectivity score for mutual linkage
              existingLink.strength = Math.min(5.0, (existingLink.strength || 1.5) + 1.8);
            } else {
              // Compute dynamic connection strength based on:
              //   - shared keywords (Jaccard similarity)
              //   - appearance of titles inside target body text (latent links)
              let score = 1.5; // Base strength
              
              // 1. Keyword sharing strength bonus
              const noteKws = (note.keywords || "").split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
              const targetKws = ((targetNode as any).keywords || "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
              const shared = noteKws.filter(k => targetKws.includes(k));
              score += Math.min(2.0, shared.length * 0.5);

              // 2. Mention density bonus
              const targetTitleSafe = targetNode.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const mentions = (note.content.match(new RegExp(targetTitleSafe, "gi")) || []).length;
              if (mentions > 1) {
                score += Math.min(1.5, mentions * 0.35);
              }

              links.push({
                source: note.id,
                target: targetNode.id,
                isMutual: false,
                strength: parseFloat(score.toFixed(2))
              });
              titleToNodeMap[note.title].linkCount!++;
              targetNode.linkCount!++;
            }
          }
        });
      });

      // Confirm mutual linkages
      links.forEach(l1 => {
        const isM = links.some(l2 => l2.source === l1.target && l2.target === l1.source);
        if (isM) {
          l1.isMutual = true;
          l1.strength = Math.min(5.0, (l1.strength || 1.5) + 1.2);
        }
      });

      let filteredLinks = links;
      let filteredNodes = nodes;
      if (minStrength > 0) {
        filteredLinks = links.filter(l => (l.strength || 1.5) >= minStrength);
        
        // Recalculate node link connections and determine set of connected node IDs
        const activeNodeIds = new Set<string>();
        filteredLinks.forEach(l => {
          const srcId = typeof l.source === "object" ? (l.source as any).id : l.source;
          const tgtId = typeof l.target === "object" ? (l.target as any).id : l.target;
          activeNodeIds.add(srcId);
          activeNodeIds.add(tgtId);
        });

        nodes.forEach(n => { n.linkCount = 0; });
        filteredLinks.forEach(l => {
          const srcId = typeof l.source === "object" ? (l.source as any).id : l.source;
          const tgtId = typeof l.target === "object" ? (l.target as any).id : l.target;
          const srcNode = nodes.find(n => n.id === srcId);
          const tgtNode = nodes.find(n => n.id === tgtId);
          if (srcNode) srcNode.linkCount!++;
          if (tgtNode) tgtNode.linkCount!++;
        });

        // Filter out isolated nodes that do not contain any connection under the selected strength threshold
        filteredNodes = nodes.filter(n => activeNodeIds.has(n.id));
      }

      return { nodes: filteredNodes, links: filteredLinks };
    }
  };


  // Render SVG Force layout
  useEffect(() => {
    if (!isOpen || !svgRef.current || !containerRef.current) return;

    setPopup({ show: false, x: 0, y: 0, node: null });
    setActiveSelectedNode(null);
    setActiveSelectedFolder(null);
    let currentSelectedFolder: string | null = null;
    let currentSelectedNode: GraphNode | null = null;
    const { nodes, links } = buildGraphData();

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    // Main group container of graph components
    const g = svg.append("g");

    // Native zoom config supporting scroll, drag pan, and touch zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4.0])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setPopup(prev => ({ ...prev, show: false })); // Hide popup during moving
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    // Color mapper setup
    const folderNames = [...new Set(nodes.map(n => n.folder || n.title))];
    const folderColorMap: { [key: string]: string } = {};
    const goldenAngle = 137.508;
    folderNames.forEach((f, i) => {
      const hue = (i * goldenAngle) % 360;
      folderColorMap[f] = `hsl(${hue}, 65%, 55%)`;
    });

    // Node dynamics sizes helper
    const getRadius = (d: GraphNode) => {
      if (graphViewMode === "folder") {
        return Math.min(60, Math.max(30, 30 + (d.noteCount || 0) * 2));
      }
      return Math.min(24, Math.max(7, 7 + (d.linkCount || 0) * 1.5));
    };

    const getColor = (d: GraphNode) => {
      const key = d.folder || d.title;
      return folderColorMap[key] || "#6e7681";
    };

    // Physics Force Simulation Engine - velocityDecay raised to prevent slow oscillation and settle fast
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .velocityDecay(0.55)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(d => {
          const score = d.strength || 1.5;
          if (graphViewMode === "folder") return 180;
          return Math.max(40, 150 - score * 25);
        })
        .strength(d => {
          const score = d.strength || 1.5;
          return graphViewMode === "folder" ? 0.45 : Math.min(1.0, 0.15 + score * 0.16);
        })
      )
      .force("charge", d3.forceManyBody().strength(
        graphViewMode === "folder" ? -600 : -280
      ))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<GraphNode>().radius(d => getRadius(d) + 12).iterations(1))
      .force("x", d3.forceX<GraphNode>().x(width / 2).strength(0.04))
      .force("y", d3.forceY<GraphNode>().y(height / 2).strength(0.04));

    simulationRef.current = simulation;

    // Edge visualization elements
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "graph-link")
      .attr("stroke", d => {
        if (graphViewMode === "folder") {
          return d.type === "ai" ? "var(--purple)" : "#30363d";
        }
        
        // Color grading for link strength:
        const s = d.strength || 1.5;
        if (s >= 4.0) return "var(--blue)"; // Strong connections are glowing cyan/blue
        if (s >= 2.5) return "rgba(163, 113, 247, 0.9)"; // Medium AI-related linkages in purple
        return "rgba(110, 118, 129, 0.5)"; // Weak connections are thin gray
      })
      .attr("stroke-width", d => {
        if (graphViewMode === "folder") return (d.value || 1) + 1;
        const s = d.strength || 1.5;
        return d.isMutual ? s * 1.3 : s * 0.9;
      })
      .attr("stroke-dasharray", d => {
        if (d.type === "ai") return "4 2";
        const s = d.strength || 1.5;
        if (s < 2.0) return "2 4"; // Low connections are dotted
        if (s < 3.0) return "6 4"; // Medium connections are dashed
        return "none"; // Strong ties are solid lines
      })
      .attr("opacity", d => {
        if (graphViewMode === "folder") {
          return d.type === "ai" ? 0.75 : 0.55;
        }
        const s = d.strength || 1.5;
        if (s < 2.0) return 0.28;
        if (s < 3.0) return 0.65;
        return 0.95;
      })
      .on("mouseover", function (event, d: any) {
        if (d.type === "ai") {
          d3.select(this).attr("stroke", "var(--bright)").attr("stroke-width", (d.value || 1) + 2.5);
          onSaveToast(`✦ AI解析による繋がり: ${d.label}`);
        } else {
          onSaveToast(`✦ つながりの強度: ${d.strength || "1.5"} / 5.0 (${d.isMutual ? '双方向' : '単方向'})`);
        }
      })
      .on("mouseout", function (event, d: any) {
        if (d.type === "ai") {
          d3.select(this).attr("stroke", "var(--purple)").attr("stroke-width", (d.value || 1) + 1);
        }
      });

    // Node rendering groupings
    const nodeGroup = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node-group")
      .style("cursor", "pointer");

    // Drag constraints helpers
    const drag = (sim: d3.Simulation<any, any>) => {
      function dragstarted(event: any, d: any) {
        if (!event.active) sim.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(event: any, d: any) {
        d.fx = event.x;
        d.fy = event.y;
        setPopup(prev => ({ ...prev, show: false })); // dismiss popup
      }
      function dragended(event: any, d: any) {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      return d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    };

    nodeGroup.call(drag(simulation));

    // Shapes: Circles for Notes, rounded rectangles for Folders
    let shapes: any;
    if (graphViewMode === "folder") {
      shapes = nodeGroup.append("rect")
        .attr("class", "graph-node")
        .attr("fill", d => getColor(d))
        .attr("width", d => getRadius(d) * 2)
        .attr("height", d => getRadius(d) * 1.5)
        .attr("x", d => -getRadius(d))
        .attr("y", d => -getRadius(d) * 0.75)
        .attr("rx", 5)
        .attr("ry", 5);
    } else {
      shapes = nodeGroup.append("circle")
        .attr("class", "graph-node")
        .attr("fill", d => getColor(d))
        .attr("r", d => getRadius(d));
    }

    // Node label placements
    const labels = nodeGroup.append("text")
      .attr("class", "graph-label")
      .attr("dy", d => getRadius(d) + 12)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .text(d => {
        if (isFullLabel) return d.title;
        return d.title.length > 8 ? d.title.substring(0, 8) + "..." : d.title;
      });

    // Fast, lightweight 2D Ticker Loop
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      nodeGroup
        .attr("transform", (d: any) => `translate(${d.x!},${d.y!})`);
    });

    // Attach click events to nodes
    shapes.on("click", (event: any, d: GraphNode) => {
      event.stopPropagation();
      
      const nodeFolder = d.folder || d.title;
      setActiveSelectedNode(d);
      setActiveSelectedFolder(nodeFolder);

      // Open node popups on accurate container coordinates
      const containerRect = container.getBoundingClientRect();
      let px = event.clientX - containerRect.left + 15;
      let py = event.clientY - containerRect.top - 15;

      if (px + 240 > width) px -= 280;
      if (py + 100 > height) py -= 100;

      setPopup({
        show: true,
        x: px,
        y: py,
        node: d
      });
    });

    // Handle clicking background of the SVG to clear folder highlight selections
    svg.on("click", (event: any) => {
      if (event.target === svg.node()) {
        setActiveSelectedNode(null);
        setActiveSelectedFolder(null);
        setPopup({ show: false, x: 0, y: 0, node: null });
      }
    });

    // Hover interactive effects
    shapes.on("mouseover", function (event: any, d: GraphNode) {
      if (currentSelectedFolder || currentSelectedNode) return;
      d3.select(containerRef.current).classed("focus-mode", true);

      const adjacentIds = new Set<string>();
      adjacentIds.add(d.id);

      link.classed("focused", (l: any) => {
        const srcId = l.source.id ?? l.source;
        const tgtId = l.target.id ?? l.target;
        if (srcId === d.id || tgtId === d.id) {
          adjacentIds.add(srcId);
          adjacentIds.add(tgtId);
          return true;
        }
        return false;
      });

      shapes.classed("focused", (n: GraphNode) => adjacentIds.has(n.id));
      labels.classed("focused", (n: GraphNode) => adjacentIds.has(n.id));
    });

    shapes.on("mouseout", function () {
      if (currentSelectedFolder || currentSelectedNode) return;
      d3.select(containerRef.current).classed("focus-mode", false);
      link.classed("focused", false);
      shapes.classed("focused", false);
      labels.classed("focused", false);
    });

    // Persistent multi-pattern focus utility
    const getFolderOfNode = (node: GraphNode) => {
      return node.folder || node.title || "未分類";
    };

    const getFolderOfRef = (ref: any) => {
      if (!ref) return "";
      if (typeof ref === "object") {
        return getFolderOfNode(ref);
      }
      const found = nodes.find(n => n.id === ref);
      return found ? getFolderOfNode(found) : "";
    };

    const applyHighlight = (selNode: GraphNode | null, selFolder: string | null, mode: "connection" | "folder") => {
      const containerValue = d3.select(containerRef.current);
      const svgNodes = d3.select(svgRef.current).selectAll(".graph-node");
      const svgLabels = d3.select(svgRef.current).selectAll(".graph-label");
      const svgLinks = d3.select(svgRef.current).selectAll(".graph-link");

      const selFolderClean = selFolder || (selNode ? getFolderOfNode(selNode) : null);

      currentSelectedFolder = selFolderClean;
      currentSelectedNode = selNode;

      if (!selNode && !selFolderClean) {
        containerValue.classed("focus-mode", false);
        svgNodes.classed("focused", false);
        svgLabels.classed("focused", false);
        svgLinks.classed("focused", false);
        d3.selectAll(".legend-item").classed("active", false);
        return;
      }

      containerValue.classed("focus-mode", true);

      if (mode === "folder" && selFolderClean) {
        svgNodes.classed("focused", (n: GraphNode) => getFolderOfNode(n) === selFolderClean);
        svgLabels.classed("focused", (n: GraphNode) => getFolderOfNode(n) === selFolderClean);
        svgLinks.classed("focused", (l: any) => {
          const sf = getFolderOfRef(l.source);
          const tf = getFolderOfRef(l.target);
          return sf === selFolderClean || tf === selFolderClean;
        });

        d3.selectAll(".legend-item").classed("active", function() {
          return d3.select(this).attr("data-folder") === selFolderClean;
        });
      } else if (mode === "connection" && selNode) {
        const adjacentIds = new Set<string>();
        adjacentIds.add(selNode.id);

        svgLinks.classed("focused", (l: any) => {
          const srcId = l.source.id ?? l.source;
          const tgtId = l.target.id ?? l.target;
          if (srcId === selNode.id || tgtId === selNode.id) {
            adjacentIds.add(srcId);
            adjacentIds.add(tgtId);
            return true;
          }
          return false;
        });

        svgNodes.classed("focused", (n: GraphNode) => adjacentIds.has(n.id));
        svgLabels.classed("focused", (n: GraphNode) => adjacentIds.has(n.id));

        const parentFolder = getFolderOfNode(selNode);
        d3.selectAll(".legend-item").classed("active", function() {
          return d3.select(this).attr("data-folder") === parentFolder;
        });
      }
    };

    applyHighlightRef.current = applyHighlight;

    // Double-click background resetting zoom back to default
    svg.on("dblclick", (event) => {
      if (event.target === svg.node()) {
        svg.transition().duration(550).call(zoom.transform, d3.zoomIdentity);
        onSaveToast("✦ 2Dビューの位置を初期化しました");
      }
    });

    // Mount Legend Overlay
    const legend = d3.select("#graph-legend-overlay");
    legend.selectAll("*").remove();

    if (graphViewMode === "note") {
      const counts: { [f: string]: number } = {};
      nodes.forEach(n => {
        const f = n.folder || "未分類";
        counts[f] = (counts[f] || 0) + 1;
      });

      const sortedFolders = Object.keys(counts).sort((a, b) => {
        if (a === "未分類") return 1;
        if (b === "未分類") return -1;
        return counts[b] - counts[a];
      });

      legend.append("div")
        .attr("class", "graph-legend-title")
        .text("📁 フォルダ");

      sortedFolders.forEach(f => {
        const item = legend.append("div")
          .attr("class", "legend-item")
          .attr("data-folder", f)
          .style("cursor", "pointer")
          .on("click", function (event) {
            event.stopPropagation();
            const isActive = d3.select(this).classed("active");
            if (isActive) {
              setActiveSelectedNode(null);
              setActiveSelectedFolder(null);
            } else {
              setHighlightMode("folder");
              setActiveSelectedNode(null);
              setActiveSelectedFolder(f);
            }
          });

        item.append("span")
          .attr("class", "legend-dot")
          .style("background", folderColorMap[f] || "#6e7681")
          .style("display", "inline-block")
          .style("width", "10px")
          .style("height", "10px")
          .style("border-radius", "50%")
          .style("margin-right", "8px");

        item.append("span")
          .attr("class", "legend-name")
          .text(f);

        item.append("span")
          .attr("class", "legend-count")
          .style("font-size", "9px")
          .style("color", "var(--muted)")
          .style("margin-left", "auto")
          .text(" " + counts[f]);
      });
    }

    g.attr("opacity", 0).transition().duration(600).attr("opacity", 1);

    return () => {
      simulation.stop();
    };
  }, [isOpen, graphViewMode, notes, folderRelationsAI, isFullLabel, filterStart, filterEnd, minStrength]);

  const handleZoomReset = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(550)
        .call(zoomRef.current.transform, d3.zoomIdentity);
      onSaveToast("✦ 2Dビューの位置を初期化しました");
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      d3.selectAll(".graph-node").style("stroke", "#0d1117").style("stroke-width", "1.5px");
      return;
    }

    let firstFound: any = null;
    d3.selectAll(".graph-node")
      .style("stroke", (d: any) => {
        if (d.title.toLowerCase().includes(query.toLowerCase())) {
          if (!firstFound) firstFound = d;
          return "var(--bright)";
        }
        return "#0d1117";
      })
      .style("stroke-width", (d: any) => d.title.toLowerCase().includes(query.toLowerCase()) ? "3.5px" : "1.5px");

    // Center viewport camera on targeted node with zoom bias natively using D3 transform
    if (firstFound && svgRef.current && zoomRef.current && containerRef.current) {
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      d3.select(svgRef.current)
        .transition()
        .duration(650)
        .call(
          zoomRef.current.transform,
          d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(1.25)
            .translate(-firstFound.x, -firstFound.y)
        );
    }
  };

  const runGraphAiAnalysis = async () => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) return onSaveToast("APIキーを [AI設定 ⚙] より登録してください");

    const { nodes } = buildGraphData();
    if (nodes.length < 2) return onSaveToast("十分にフォルダがありません。ノートに複数のフォルダ名を設定してください。");

    onSaveToast("全フォルダの類似関係をAI分析中...");
    try {
      const activeSummaries = nodes.map(f => {
        const titles = (f.notes || []).slice(0, 15).map(n => n.title).join(", ");
        return `[Folder: ${f.title}]\nNotes: ${titles}`;
      }).join("\n\n");

      const prompt = `あなたは知識管理の専門家です。以下のフォルダ（カテゴリ）の内容を読み、フォルダリストとの間の「意味的な繋がり」や「階層関係」を解析してください。

関係性のルール：
1. 「AはBの前提条件」「AとBは補完し合っている」など、深い関係を見つけてください。
2. 出力は必ず以下のJSON形式のみとしてください。
[{"source": "フォルダA", "target": "フォルダB", "reason": "関係の短い説明"}, ...]

フォルダリスト：
${activeSummaries}`;

      const model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";
      const temp = parseFloat(localStorage.getItem("cn_gemini_temp") || "0.2");
      const maxTok = parseInt(localStorage.getItem("cn_gemini_tokens") || "1024", 10);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: temp, maxOutputTokens: maxTok, response_mime_type: "application/json" }
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rData = await res.json();
      const text = rData.candidates?.[0]?.content?.parts?.[0]?.text;
      const newRels: FolderRelation[] = JSON.parse(text);

      saveFolderRelationsLocally(newRels, Date.now());
      onSaveToast("フォルダ関連AI分析が完了しました ✦");
    } catch (e: any) {
      console.error(e);
      onSaveToast("AI解析失敗: " + e.message);
    }
  };

  const linkUnconnectedNodesChain = async () => {
    // Collect unconnected nodes
    const isExcluded = (note: Note) => {
      const f = getFolderFromKeywords(note.keywords);
      return f === "未分類" || /^\d{8}$/.test(f);
    };

    const candidates = notes.filter(n => !isExcluded(n));
    const linkedIds = new Set<string>();

    // Analyze current structural links
    candidates.forEach(note => {
      const matches = [...note.content.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1].trim());
      matches.forEach(t => {
        const tn = candidates.find(candidate => candidate.title === t);
        if (tn) {
          linkedIds.add(note.id);
          linkedIds.add(tn.id);
        }
      });
    });

    const isolated = candidates.filter(n => !linkedIds.has(n.id));
    if (isolated.length === 0) {
      return onSaveToast("孤立しているノートはありません (日付・未分類フォルダ除く)");
    }

    if (!window.confirm(`${isolated.length}個の孤立ノートを双方向環状(チェーン状)に自動接続しますか？\n（未分類フォルダは除外されます）`)) return;

    try {
      const now = Date.now();
      for (let i = 0; i < isolated.length; i++) {
        const current = isolated[i];
        const next = isolated[(i + 1) % isolated.length];

        // Format and append missing wiki link
        current.content = current.content.trimEnd() + `\n\n[[${next.title}]]`;
        current.updatedAt = now;
      }

      onSaveToast("クラウド同期中...");
      await apiPost({ action: "saveAll", notes });
      onForceRefreshNotes();
      onSaveToast(`✅ ${isolated.length}個の孤立ノートを接続完了しました！`);
    } catch (e: any) {
      onSaveToast("エラー: " + e.message);
    }
  };

  // Multiple note selection report generator logic
  const handleToggleReportNode = (node: GraphNode) => {
    const id = node.id;
    const keyString = graphViewMode === "folder" ? " folder" : " note";
    const title = node.title;
    
    const optimizeEnabled = localStorage.getItem("cn_optimize_api_tokens") !== "false";

    let content = "";
    if (graphViewMode === "folder") {
      content = (node.notes || []).map(n => {
        if (optimizeEnabled) {
          const folder = getFolderFromKeywords(n.keywords);
          const links = extractWikiLinks(n.content);
          const linkPart = links.length > 0 ? `\n[接続リンク先] ${links.join(", ")}` : "";
          const summaryPart = n.summary ? `要約: ${n.summary}` : `本文（抜粋）: ${n.content.substring(0, 450)}...`;
          return `## ${n.title}\n[フォルダ/タグ] ${folder}\n${n.keywords ? `[キーワード] ${n.keywords}` : ""}${linkPart}\n${summaryPart}`;
        } else {
          return `## ${n.title}\n${n.content}`;
        }
      }).join("\n\n");
    } else {
      if (optimizeEnabled) {
        const originalNote = notes.find(n => n.id === id);
        if (originalNote) {
          const folder = getFolderFromKeywords(originalNote.keywords);
          const links = extractWikiLinks(originalNote.content);
          const linkPart = links.length > 0 ? `\n[接続リンク先] ${links.join(", ")}` : "";
          const summaryPart = originalNote.summary ? `要約: ${originalNote.summary}` : `本文（抜粋）: ${originalNote.content.substring(0, 450)}...`;
          content = `[フォルダ/タグ] ${folder}\n${originalNote.keywords ? `[キーワード] ${originalNote.keywords}` : ""}${linkPart}\n${summaryPart}`;
        } else {
          content = node.content ? node.content.substring(0, 450) + "..." : "";
        }
      } else {
        content = node.content || "";
      }
    }

    const newMap = new Map(reportSelectedNodes);
    if (newMap.has(id)) {
      newMap.delete(id);
    } else {
      newMap.set(id, { title, content });
    }
    setReportSelectedNodes(newMap);
    setPopup(prev => ({ ...prev, show: false })); // dismiss popup
  };

  const generateFocusReport = async (centerNode: GraphNode, depth: number = 1) => {
    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) return onSaveToast("APIキーを設定してください ⚙");

    const adjacentIds = new Set<string>();
    adjacentIds.add(centerNode.id);

    // Collect linked siblings up to specified depth
    const { links } = buildGraphData();
    let currentLevelIds = new Set<string>([centerNode.id]);

    for (let i = 0; i < depth; i++) {
      const nextLevelIds = new Set<string>();
      links.forEach(l => {
        const srcId = typeof l.source === "object" ? l.source.id : l.source;
        const tgtId = typeof l.target === "object" ? l.target.id : l.target;
        
        if (currentLevelIds.has(srcId) && !adjacentIds.has(tgtId as string)) {
          adjacentIds.add(tgtId as string);
          nextLevelIds.add(tgtId as string);
        }
        if (currentLevelIds.has(tgtId) && !adjacentIds.has(srcId as string)) {
          adjacentIds.add(srcId as string);
          nextLevelIds.add(srcId as string);
        }
      });
      currentLevelIds = nextLevelIds;
    }

    const targetNotes = notes.filter(n => adjacentIds.has(n.id));
    if (targetNotes.length === 0) return onSaveToast("接続先の対象ノートがありません");

    setShowReportResult(true);
    setReportResultText("🔍 周辺情報を抽出・AI解析中...");
    setIsGeneratingReport(true);

    try {
      const optimizeEnabled = localStorage.getItem("cn_optimize_api_tokens") !== "false";
      const notesContent = targetNotes
        .map(n => {
          if (optimizeEnabled) {
            const folder = getFolderFromKeywords(n.keywords);
            const links = extractWikiLinks(n.content);
            const linkPart = links.length > 0 ? `\n[接続リンク先] ${links.join(", ")}` : "";
            const summaryPart = n.summary ? `要約: ${n.summary}` : `本文（抜粋）: ${n.content.substring(0, 450)}...`;
            return `### ${n.title}\n[フォルダ/タグ] ${folder}\n${n.keywords ? `[キーワード] ${n.keywords}` : ""}${linkPart}\n${summaryPart}`;
          } else {
            return `### ${n.title}\n${n.content}`;
          }
        })
        .join("\n\n---\n\n");

      const promptTemplate = localStorage.getItem("cn_prompt_report") || DEFAULT_PROMPTS.REPORT;
      const prompt = promptTemplate.replace("{notes_content}", notesContent.substring(0, 20000));

      const model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";
      const temp = parseFloat(localStorage.getItem("cn_gemini_temp") || "0.3");
      const maxTok = parseInt(localStorage.getItem("cn_gemini_tokens") || "2000", 10);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: temp, maxOutputTokens: maxTok }
        })
      });

      if (!res.ok) throw new Error("API Request failed");
      const rData = await res.json();
      const parsedText = rData.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const usedNotesList = targetNotes.map(n => `- [[${n.title}]]`).join("\n");
      const fullReport = `${parsedText}\n\n---\n\n## 使用したノート\n${usedNotesList}`;

      setReportResultText(fullReport);
    } catch (e: any) {
      setReportResultText("エラー: " + e.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateBatchReport = async () => {
    if (reportSelectedNodes.size === 0) return;

    const apiKey = localStorage.getItem("cn_gemini_key");
    if (!apiKey) return onSaveToast("APIキーを設定してください ⚙");

    setIsGeneratingReport(true);
    setShowReportResult(true);
    setReportResultText("🤖 解析レポートを生成中...");

    try {
      const notesContent = (Array.from(reportSelectedNodes.values()) as Array<{ title: string; content: string }>)
        .map(n => `### ${n.title}\n${n.content}`)
        .join("\n\n---\n\n");

      const promptTemplate = localStorage.getItem("cn_prompt_report") || DEFAULT_PROMPTS.REPORT;
      const prompt = promptTemplate.replace("{notes_content}", notesContent.substring(0, 20000));

      const model = localStorage.getItem("cn_gemini_model") || "gemini-2.0-flash";
      const temp = parseFloat(localStorage.getItem("cn_gemini_temp") || "0.3");
      const maxTok = parseInt(localStorage.getItem("cn_gemini_tokens") || "2000", 10);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: temp, maxOutputTokens: maxTok }
        })
      });

      if (!res.ok) throw new Error("API Request failure");
      const rData = await res.json();
      const parsedText = rData.candidates?.[0]?.content?.parts?.[0]?.text || "";

      setReportResultText(parsedText);
    } catch (e: any) {
      setReportResultText("エラー: " + e.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const saveReportAsNewFile = () => {
    if (!reportResultText) return;
    const titles = (Array.from(reportSelectedNodes.values()) as Array<{ title: string; content: string }>).map(n => n.title).join("・");
    const name = `レポート: ${titles.substring(0, 25)}`;
    
    const formatted = `# ${name}\n\n${reportResultText}`;
    onCreateNoteExt(name, formatted, formatDateStr(Date.now()).replace(/-/g, ""), "");

    onSaveToast("レポートを新規ノートに書き出しました ✦");
    setShowReportResult(false);
    clearReportSelections();
    onClose();
  };

  const clearReportSelections = () => {
    setReportSelectedNodes(new Map());
    setPopup(prev => ({ ...prev, show: false }));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#0d1117] z-[1000] flex flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* HEADER CONTROLS bar */}
      <div className="p-3 px-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface)] z-10">
        <div className="flex items-center gap-3">
          <div
            className="bg-[#1c2128] border border-[var(--border2)] text-[var(--text)] w-8 h-8 rounded-md flex items-center justify-center cursor-pointer font-bold hover:bg-[var(--border)] transition-colors"
            onClick={onClose}
          >
            ✕
          </div>
          <div className="text-sm font-bold text-[var(--bright)] hidden md:block">🕸 Connected Knowledge Graph</div>
          
          {(activeSelectedFolder || activeSelectedNode) && (
            <div className="flex items-center gap-1.5 bg-[#a371f720] border border-[#a371f744] px-2.5 py-1 rounded-full text-xs text-[var(--purple)] font-bold animate-[fadeIn_0.2s_ease-out]">
              {activeSelectedNode ? (
                <span>◈ {activeSelectedNode.title} {activeSelectedFolder ? `(${activeSelectedFolder})` : ""}</span>
              ) : (
                <span>📁 {activeSelectedFolder}</span>
              )}
              <button
                type="button"
                className="hover:text-[var(--bright)] text-[var(--muted)] ml-1 bg-transparent border-0 cursor-pointer text-xs font-bold transition-all"
                onClick={() => {
                  setActiveSelectedNode(null);
                  setActiveSelectedFolder(null);
                  setPopup({ show: false, x: 0, y: 0, node: null });
                }}
                title="選択をクリア"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          {/* Highlight Mode Switcher (New Feature requested by user!) */}
          <div className="flex bg-[#1c2128] border border-[var(--border2)] rounded-md p-0.5" title="タップした際、何を明るくするか設定します">
            <button
              className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${highlightMode === "connection" ? "bg-[var(--purple)] text-white" : "text-[var(--text)] hover:bg-[#ffffff0c]"}`}
              onClick={() => setHighlightMode("connection")}
            >
              🔗 接続ノード
            </button>
            <button
              className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${highlightMode === "folder" ? "bg-[var(--purple)] text-white" : "text-[var(--text)] hover:bg-[#ffffff0c]"}`}
              onClick={() => setHighlightMode("folder")}
            >
              📁 同じ色
            </button>
          </div>

          {/* Note Graph / Folder Graph Switcher */}
          <div className="flex bg-[#1c2128] border border-[var(--border2)] rounded-md p-0.5">
            <button
              className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${graphViewMode === "note" ? "bg-[var(--blue)] text-white" : "text-[var(--text)] hover:bg-[#ffffff0c]"}`}
              onClick={() => setGraphViewMode("note")}
            >
              ノート
            </button>
            <button
              className={`px-3 py-1 text-[10px] font-semibold border-0 rounded cursor-pointer transition-all ${graphViewMode === "folder" ? "bg-[var(--blue)] text-white" : "text-[var(--text)] hover:bg-[#ffffff0c]"}`}
              onClick={() => setGraphViewMode("folder")}
            >
              フォルダ
            </button>
          </div>

          {graphViewMode === "folder" && (
            <div className="flex gap-1.5 items-center">
              <button
                className="bg-[#a371f715] hover:bg-[#a371f728] border border-[#a371f744] text-[var(--purple)] p-1 px-3 text-[10.5px] font-medium rounded-md cursor-pointer transition-colors"
                onClick={runGraphAiAnalysis}
              >
                ✦ AIフォルダ解析
              </button>
              <button
                className="bg-[#1c2128] hover:bg-[var(--border)] border border-[var(--border2)] text-[var(--text)] p-1 px-2.5 text-[10px] rounded-md cursor-pointer transition-colors"
                title="AIフォルダ関係性のリセット"
                onClick={() => {
                  if (window.confirm("AI解析による繋がりをリセットしますか？")) {
                    saveFolderRelationsLocally([], 0);
                    onSaveToast("フォルダ関連AIをリセットしました");
                  }
                }}
              >
                リセット
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-[var(--text)] cursor-pointer">
            <input
              type="checkbox"
              id="kg-full-label"
              className="accent-[var(--blue)] cursor-pointer w-4 h-4"
              checked={isFullLabel}
              onChange={(e) => setIsFullLabel(e.target.checked)}
            />
            <label htmlFor="kg-full-label" className="cursor-pointer text-[11px] whitespace-nowrap">全ラベル表示</label>
          </div>



          <input
            type="text"
            className="p-1 px-2.5 bg-[#1c2128] border border-[var(--border2)] rounded-md text-[var(--text)] text-[11px] outline-none focus:border-[var(--blue)] transition-all w-[140px] md:w-[170px]"
            placeholder="ノードを検索..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />

          <button
            className="p-1 px-3 bg-[#1cb5b525] border border-[#1cb5b544] text-[#7ee787] text-[11px] font-semibold rounded-md cursor-pointer hover:bg-[#1cb5b53a] transition-all whitespace-nowrap"
            onClick={linkUnconnectedNodesChain}
          >
            🔗 孤立ノードを一括繋ぐ
          </button>
          
          <button className="bg-[#1c2128] hover:bg-[var(--border)] border border-[var(--border2)] text-[var(--text)] p-1 px-3 text-[11px] rounded-md cursor-pointer" onClick={handleZoomReset}>
            全体表示
          </button>
        </div>
      </div>

      {/* Connection Strength Controls Help Bar */}
      <div className="bg-[#161b22] border-b border-[var(--border)] px-6 py-2 flex flex-wrap gap-x-6 gap-y-2 items-center justify-between text-[11px] text-[var(--subtle)]">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[var(--blue)] font-bold shrink-0">🔗 つながり強度しきい値:</span>
            <select
              value={minStrength}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setMinStrength(val);
                onSaveToast(val > 0 ? `つながりの強度を ${val}以上に制限しました (孤立ノード非表示)` : "すべてのノードを表示しました (孤立ノードを含む)");
              }}
              className="bg-[#0d1117] border border-[var(--border2)] rounded-md text-[var(--text)] text-[10px] p-0.5 px-2 outline-none cursor-pointer focus:border-[var(--blue)] transition-all font-sans"
            >
              <option value={0}>すべて表示 (強度 0 以上 | 孤立・リンクなしノード含む)</option>
              <option value={1.5}>接続ノードのみ表示 (強度 1.5 以上)</option>
              <option value={2.0}>接続ノードのみ表示 (強度 2.0 以上)</option>
              <option value={2.5}>接続ノードのみ表示 (強度 2.5 以上)</option>
              <option value={3.0}>接続ノードのみ表示 (強度 3.0 以上)</option>
              <option value={4.0}>接続ノードのみ表示 (強度 4.0 以上)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-[var(--muted)] flex-wrap">
          <span>🖱 ドラッグでマップ移動(パン)</span>
          <span>•</span>
          <span>スクロールでズーム</span>
          <span>•</span>
          <span>Wクリックで位置リセット</span>
        </div>
      </div>

      {/* SVG Canvas wrapper */}
      <div ref={containerRef} id="graph-container" className="flex-1 relative overflow-hidden bg-[#0d1117] graph-container">
        <svg ref={svgRef} id="graph-svg" className="w-full h-full"></svg>

        {/* Legend sidebar overlying overlay */}
        <div id="graph-legend-overlay" className="graph-legend block max-h-[50%] overflow-y-auto"></div>

        {/* Action node popups */}
        {popup.show && popup.node && (
          <div
            id="graph-popup"
            className="absolute bg-[#161b22] border border-[var(--border2)] rounded-lg p-3 w-[240px] text-[var(--text)] shadow-[0_4px_16px_rgba(0,0,0,0.5)] z-20"
            style={{ left: popup.x, top: popup.y }}
          >
            <div className="font-bold text-[var(--bright)] text-xs mb-1.5 border-b border-[var(--border)] pb-1 truncate">
              {graphViewMode === "folder" ? `📁 ${popup.node.title}` : `◈ ${popup.node.title}`}
            </div>
            
            <div className="text-[10px] text-[var(--blue)] mb-2">
              {graphViewMode === "folder" ? `📝 ノート数: ${popup.node.noteCount}` : `🔗 被リンク数: ${popup.node.linkCount}`}
            </div>

            {graphViewMode === "folder" && (
              <div className="text-[10px] text-[var(--subtle)] line-clamp-3 leading-relaxed mb-3">
                含まれるノート: {(popup.node.notes || []).map(n => n.title).join(", ")}
              </div>
            )}

            {/* Folder AI connections snippet */}
            {graphViewMode === "folder" && (() => {
              const rels = folderRelationsAI.filter(r => r.source === popup.node!.id || r.target === popup.node!.id);
              if (rels.length === 0) return null;
              return (
                <div className="border-t border-[var(--border)] pt-1.5 mt-1.5 text-[9.5px]">
                  <div className="text-[var(--purple)] font-bold mb-1">✦ AIによる階層分析</div>
                  <div className="max-h-[60px] overflow-y-auto leading-relaxed text-[var(--subtle)]">
                    {rels.map((r, ri) => (
                      <div key={ri} className="mb-1">
                        <strong>{r.source === popup.node!.id ? r.target : r.source}</strong>: {r.reason}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-col gap-1 mt-2">
              <button
                className="w-full py-1 bg-[#a371f71a] border border-[#a371f744] text-[var(--purple)] text-[10.5px] rounded cursor-pointer font-semibold"
                onClick={() => handleToggleReportNode(popup.node!)}
              >
                {reportSelectedNodes.has(popup.node!.id) ? "✦ レポート選択を外す" : "✦ レポート対象に収集"}
              </button>

              {graphViewMode === "note" && (
                <div className="flex flex-col gap-1.5 w-full bg-[#161b22] border border-[var(--border2)] rounded p-1.5 mt-1">
                  <span className="text-[9px] text-[var(--muted)] text-center font-bold">🔍 周辺ノードのAIレポート（対象階層）</span>
                  <div className="flex gap-1 w-full">
                    <button
                      className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                      onClick={() => generateFocusReport(popup.node!, 1)}
                    >
                      1階層先
                    </button>
                    <button
                      className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                      onClick={() => generateFocusReport(popup.node!, 2)}
                    >
                      2階層先
                    </button>
                    <button
                      className="flex-1 py-1.5 bg-[var(--green)] hover:opacity-80 text-white text-[10px] rounded cursor-pointer font-bold transition-opacity"
                      onClick={() => generateFocusReport(popup.node!, 3)}
                    >
                      3階層先
                    </button>
                  </div>
                </div>
              )}

              <button
                className="w-full py-1 bg-[var(--surface)] hover:bg-[var(--border)] border border-[var(--border2)] text-[var(--text)] text-[10.5px] rounded cursor-pointer font-medium"
                onClick={() => {
                  if (graphViewMode === "folder") {
                    // Filter notes list by folder
                    const searchBox = document.getElementById("search-box") as HTMLInputElement;
                    if (searchBox) searchBox.value = popup.node!.title;
                    onClose();
                  } else {
                    onSelectNote(popup.node!.id);
                    onClose();
                  }
                }}
              >
                {graphViewMode === "folder" ? "フォルダを開く" : "このノートを開く"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Batch selections analyzer panel */}
      {reportSelectedNodes.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#161b22] border border-[var(--border2)] rounded-lg p-3 z-[1010] min-w-[320px] max-w-[500px] shadow-2xl flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--purple)] font-bold">
            <span>✦ レポート対象 ({reportSelectedNodes.size}件収集)</span>
            <button className="text-[var(--muted)] cursor-pointer font-normal border-0 bg-transparent text-xs hover:underline" onClick={clearReportSelections}>
              クリア
            </button>
          </div>
          <div className="text-[10px] text-[var(--subtle)] line-clamp-2 leading-relaxed bg-[var(--bg)] p-1.5 rounded border border-[var(--border2)] overflow-y-auto max-h-[60px]">
            {(Array.from(reportSelectedNodes.values()) as Array<{ title: string; content: string }>).map(n => n.title).join(", ")}
          </div>
          <button
            className="w-full py-2 bg-[#a371f720] border border-[#a371f744] hover:bg-[#a371f730] text-[var(--purple)] text-xs font-bold rounded-md cursor-pointer transition-all"
            onClick={generateBatchReport}
            disabled={isGeneratingReport}
          >
            ✦ 選択したノートの AI 合成レポートを生成
          </button>
        </div>
      )}

      {/* Report results Modal Overlay */}
      {showReportResult && (
        <div
          className="fixed inset-0 bg-[#00000090] z-[1100] flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]"
          onClick={(e) => !isGeneratingReport && e.target === e.currentTarget && setShowReportResult(false)}
        >
          <div className="bg-[var(--surface)] border border-[var(--border2)] rounded-xl p-6 w-[720px] max-w-full max-h-[85vh] flex flex-col gap-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2">
              <div className="text-base font-bold text-[var(--purple)] flex items-center gap-2">
                <span>✦</span> AI 生成ナレッジレポート
              </div>
              <button
                className="text-[var(--muted)] hover:text-white text-2xl font-normal"
                onClick={() => !isGeneratingReport && setShowReportResult(false)}
                disabled={isGeneratingReport}
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto font-sans leading-relaxed text-xs text-[var(--text)] bg-[var(--bg)] p-4 rounded-md border border-[var(--border)] whitespace-pre-wrap select-text">
              {reportResultText}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--border2)] pt-4 mt-1">
              {!isGeneratingReport && (
                <button
                  className="bg-[#2386361a] hover:bg-[#23863633] border border-[#23863644] text-[#7ee787] text-xs font-bold p-2 px-5 rounded-md cursor-pointer transition-colors"
                  onClick={saveReportAsNewFile}
                >
                  ノートとして保存
                </button>
              )}
              <button
                className="text-xs text-[var(--subtle)] border border-[var(--border2)] hover:bg-[var(--border)] p-2 px-4 rounded-md cursor-pointer font-medium"
                onClick={() => setShowReportResult(false)}
                disabled={isGeneratingReport}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
