import { useEffect, useRef } from "react";
import {
  X,
  FileText,
  MapPin,
  ShieldAlert,
  Sliders,
  Route,
  Layers,
  AlertTriangle,
  Sparkles,
  Database,
  BookOpen
} from "lucide-react";

const MENU_ITEMS = [
  {
    num: "01",
    id: "sec-overview",
    title: "1. Project Overview",
    desc: "Mission, corridor sector, buffer width, and spatial multi-criteria",
    icon: <FileText size={15} className="menuIcon cyan" />
  },
  {
    num: "02",
    id: "sec-input",
    title: "2. Route Input",
    desc: "Origin terminal, destination terminal, and geocoding controls",
    icon: <MapPin size={15} className="menuIcon green" />
  },
  {
    num: "03",
    id: "sec-constraints",
    title: "3. Spatial Constraints",
    desc: "Statutory protected bio-reserves, water floodplains, and slopes",
    icon: <ShieldAlert size={15} className="menuIcon red" />
  },
  {
    num: "04",
    id: "sec-factors",
    title: "4. Multi-Criteria Weights",
    desc: "Assign multi-criteria importance to population, terrain and access",
    icon: <Sliders size={15} className="menuIcon amber" />
  },
  {
    num: "05",
    id: "sec-analysis",
    title: "5. Corridor Analysis",
    desc: "Interactive MapLibre GIS map, 500m buffer, and status analytics",
    icon: <Route size={15} className="menuIcon blue" />
  },
  {
    num: "06",
    id: "sec-analysis",
    title: "6. GIS Layers",
    desc: "Rivers, forest canopy, bio-reserves, slope, and building clusters",
    icon: <Layers size={15} className="menuIcon cyan" />
  },
  {
    num: "07",
    id: "sec-factors",
    title: "7. Risk & Exposure",
    desc: "Population settlement density, building footprint conflicts",
    icon: <AlertTriangle size={15} className="menuIcon red" />
  },
  {
    num: "08",
    id: "sec-recommended",
    title: "8. Recommended Corridor",
    desc: "Recommended corridor decision rationale & factor score breakdown",
    icon: <Sparkles size={15} className="menuIcon green" />
  },
  {
    num: "09",
    id: "sec-data",
    title: "9. Data / Dataset",
    desc: "Data provenance, GIS layers, OSRM routing, and OSM provenance",
    icon: <Database size={15} className="menuIcon blue" />
  },
  {
    num: "10",
    id: "sec-overview",
    title: "10. Methodology",
    desc: "Spatial multi-criteria evaluation and optimization framework",
    icon: <BookOpen size={15} className="menuIcon purple" />
  }
];

export function ProjectIntelligenceMenu({ isOpen, onClose }) {
  const drawerRef = useRef(null);

  // Close on ESC key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target) && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Smooth scroll handler
  const handleScrollToSection = (targetId) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="menuBackdrop" role="dialog" aria-modal="true" aria-label="Project Intelligence Menu">
      <div className="menuDrawer" ref={drawerRef}>
        {/* DRAWER HEADER */}
        <div className="drawerHeader">
          <div className="drawerBrand">
            <div className="drawerIconWrap">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="drawerTitle">PROJECT INTELLIGENCE</div>
              <div className="drawerSubtitle">SPATIAL DECISION PIPELINE / 10 MODULES</div>
            </div>
          </div>
          <button
            className="drawerCloseBtn"
            onClick={onClose}
            aria-label="Close Project Menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* DRAWER SEQUENCE LIST */}
        <div className="drawerList">
          {MENU_ITEMS.map((item) => (
            <div
              key={item.num}
              className="drawerItem"
              onClick={() => handleScrollToSection(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleScrollToSection(item.id);
                }
              }}
            >
              <div className="itemNumBadge">{item.num}</div>
              <div className="itemIconWrap">{item.icon}</div>
              <div className="itemTextWrap">
                <div className="itemTitle">{item.title}</div>
                <div className="itemDesc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* DRAWER FOOTER */}
        <div className="drawerFooter">
          <span className="footerTag">INDIA SPATIAL ENGINE v2.0</span>
          <span className="footerSec">DMIC SECTOR NH 48</span>
        </div>
      </div>
    </div>
  );
}
