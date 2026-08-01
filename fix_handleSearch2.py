import re

with open("src/components/KnowledgeGraphModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

start_idx = content.find("  const handleSearchChange = (query: string) => {")
end_idx = content.find("  const linkUnconnectedNodesChain = async () => {")

if start_idx != -1 and end_idx != -1:
    old_handle = content[start_idx:end_idx]
    
    new_handle = """  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) return;

    let firstFound: any = null;
    const nodesData = d3.select(svgRef.current).selectAll(".graph-node").data() as GraphNode[];
    for (const d of nodesData) {
      if (d.title.toLowerCase().includes(query.toLowerCase())) {
        firstFound = d;
        break;
      }
    }

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

"""
    content = content[:start_idx] + new_handle + content[end_idx:]
    with open("src/components/KnowledgeGraphModal.tsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated handleSearchChange!")

