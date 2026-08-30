import { useState } from "react";
import { Layers, ChevronDown, ChevronUp } from "lucide-react";

export function MapLegend() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="gisLegend">
      <button
        className="legendHeader"
        onClick={() => setExpanded(!expanded)}
        aria-label="Toggle Legend"
      >
        <div className="legendTitle">
          <Layers size={12} />
          <span>GIS MAP LEGEND</span>
        </div>
        {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>

      {expanded && (
        <div className="legendBody">
          {/* CORRIDORS */}
          <div className="legendGroup">
            <div className="groupLabel">CORRIDORS</div>
            <div className="legendRow">
              <span className="lineSymbol recLine"></span>
              <span>Recommended Corridor (Cyan)</span>
            </div>
            <div className="legendRow">
              <span className="lineSymbol alt1Line"></span>
              <span>Alternative Corridor 1 (Orange)</span>
            </div>
            <div className="legendRow">
              <span className="lineSymbol alt2Line"></span>
              <span>Alternative Corridor 2 (Red)</span>
            </div>
            <div className="legendRow">
              <span className="polySymbol bufferPoly"></span>
              <span>500m Analysis Corridor Buffer</span>
            </div>
          </div>

          {/* INDIA GIS LAYERS */}
          <div className="legendGroup">
            <div className="groupLabel">INDIA GIS LAYERS</div>
            <div className="legendRow">
              <span className="lineSymbol indiaBoundaryLine"></span>
              <span>India National Boundary</span>
            </div>
            <div className="legendRow">
              <span className="lineSymbol stateBoundaryLine"></span>
              <span>Indian State Boundaries</span>
            </div>
            <div className="legendRow">
              <span className="lineSymbol riverLine"></span>
              <span>Rivers &amp; Water Catchments</span>
            </div>
            <div className="legendRow">
              <span className="polySymbol forestPoly"></span>
              <span>Forest &amp; Sensitive Land</span>
            </div>
            <div className="legendRow">
              <span className="dotSymbol cityDot"></span>
              <span>Corridor Cities &amp; DMIC Hubs</span>
            </div>
          </div>

          {/* SPATIAL CONSTRAINTS */}
          <div className="legendGroup">
            <div className="groupLabel">SPATIAL CONSTRAINTS</div>
            <div className="legendRow">
              <span className="polySymbol protectedPoly"></span>
              <span>Protected Bio-Reserves (Sariska)</span>
            </div>
            <div className="legendRow">
              <span className="polySymbol slopePoly"></span>
              <span>Excessive Slope (&gt;35%)</span>
            </div>
            <div className="legendRow">
              <span className="polySymbol buildingPoly"></span>
              <span>Dense Building Clusters</span>
            </div>
          </div>

          {/* TERMINAL NODES */}
          <div className="legendGroup">
            <div className="groupLabel">TERMINAL NODES</div>
            <div className="legendRow">
              <span className="dotSymbol originDot"></span>
              <span>Origin Node (Delhi NCR)</span>
            </div>
            <div className="legendRow">
              <span className="dotSymbol destDot"></span>
              <span>Destination Node (Jaipur)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
