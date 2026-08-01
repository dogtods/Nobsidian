import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update applyHighlightRef definition
old_ref = 'const applyHighlightRef = useRef<((selNode: GraphNode | null, selFolder: string | null, mode: "connection" | "folder") => void) | null>(null);'
new_ref = 'const applyHighlightRef = useRef<((selNode: GraphNode | null, selFolder: string | null, mode: "connection" | "folder", reportNodes?: Map<string, {title: string, content: string}>) => void) | null>(null);'
content = content.replace(old_ref, new_ref)

# 2. Update useEffect for applyHighlightRef
old_effect = """  useEffect(() => {
    if (applyHighlightRef.current) {
      applyHighlightRef.current(activeSelectedNode, activeSelectedFolder, highlightMode);
    }
  }, [highlightMode, activeSelectedNode, activeSelectedFolder]);"""
  
new_effect = """  useEffect(() => {
    if (applyHighlightRef.current) {
      applyHighlightRef.current(activeSelectedNode, activeSelectedFolder, highlightMode, reportSelectedNodes);
    }
  }, [highlightMode, activeSelectedNode, activeSelectedFolder, reportSelectedNodes]);"""
content = content.replace(old_effect, new_effect)

# 3. Update applyHighlight implementation
old_apply = """    const applyHighlight = (selNode: GraphNode | null, selFolder: string | null, mode: "connection" | "folder") => {
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
    };"""
    
new_apply = """    const applyHighlight = (selNode: GraphNode | null, selFolder: string | null, mode: "connection" | "folder", reportNodes?: Map<string, any>) => {
      const containerValue = d3.select(containerRef.current);
      const svgNodes = d3.select(svgRef.current).selectAll(".graph-node");
      const svgLabels = d3.select(svgRef.current).selectAll(".graph-label");
      const svgLinks = d3.select(svgRef.current).selectAll(".graph-link");

      const selFolderClean = selFolder || (selNode ? getFolderOfNode(selNode) : null);
      currentSelectedFolder = selFolderClean;
      currentSelectedNode = selNode;

      const hasReportNodes = reportNodes && reportNodes.size > 0;
      
      const isNodeInReport = (n: GraphNode) => {
        if (!hasReportNodes) return false;
        if (reportNodes.has(n.id)) return true;
        if (n.notes && n.notes.some(note => reportNodes.has(note.id))) return true;
        return false;
      };

      if (!selNode && !selFolderClean && !hasReportNodes) {
        containerValue.classed("focus-mode", false);
        svgNodes.classed("focused", false);
        svgLabels.classed("focused", false);
        svgLinks.classed("focused", false);
        d3.selectAll(".legend-item").classed("active", false);
        return;
      }

      containerValue.classed("focus-mode", true);
      
      if (!selNode && !selFolderClean && hasReportNodes) {
        svgNodes.classed("focused", (n: GraphNode) => isNodeInReport(n));
        svgLabels.classed("focused", (n: GraphNode) => isNodeInReport(n));
        svgLinks.classed("focused", (l: any) => {
          const srcId = l.source.id ?? l.source;
          const tgtId = l.target.id ?? l.target;
          return reportNodes.has(srcId) || reportNodes.has(tgtId); 
        });
        d3.selectAll(".legend-item").classed("active", false);
      } else if (mode === "folder" && selFolderClean) {
        svgNodes.classed("focused", (n: GraphNode) => getFolderOfNode(n) === selFolderClean || isNodeInReport(n));
        svgLabels.classed("focused", (n: GraphNode) => getFolderOfNode(n) === selFolderClean || isNodeInReport(n));
        svgLinks.classed("focused", (l: any) => {
          const sf = getFolderOfRef(l.source);
          const tf = getFolderOfRef(l.target);
          const srcId = l.source.id ?? l.source;
          const tgtId = l.target.id ?? l.target;
          return sf === selFolderClean || tf === selFolderClean || (hasReportNodes && (reportNodes.has(srcId) || reportNodes.has(tgtId)));
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
          return (hasReportNodes && (reportNodes.has(srcId) || reportNodes.has(tgtId)));
        });

        svgNodes.classed("focused", (n: GraphNode) => adjacentIds.has(n.id) || isNodeInReport(n));
        svgLabels.classed("focused", (n: GraphNode) => adjacentIds.has(n.id) || isNodeInReport(n));
        
        const parentFolder = getFolderOfNode(selNode);
        d3.selectAll(".legend-item").classed("active", function() {
          return d3.select(this).attr("data-folder") === parentFolder;
        });
      }
    };"""

content = content.replace(old_apply, new_apply)

with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated highlighting!")
