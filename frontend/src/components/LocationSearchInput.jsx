import { useState, useEffect, useRef } from "react";
import { searchLocations } from "../services/geocodingService";
import { Search, Loader2 } from "lucide-react";

export function LocationSearchInput({
  label,
  icon,
  value,
  onSelectLocation,
  onClearLocation,
  placeholder = "Search location..."
}) {
  const [query, setQuery] = useState(value?.name || "");
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Sync the text field only when the parent location actually changes
  // (e.g. after a swap). Guarded against re-syncing while the user types.
  useEffect(() => {
    setQuery(value?.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.coords, value?.name]);

  // Debounced search effect (300ms)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      const results = await searchLocations(query);
      setSuggestions(results);
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const select = (item) => {
    setQuery(item.name);
    onSelectLocation({ name: item.name, coords: item.coords });
    setIsOpen(false);
  };

  return (
    <div className="locationSearch" ref={dropdownRef}>
      <div className="inputBox searchInputBox">
        {icon}
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            // Typing invalidates any previously selected coordinates so a
            // stale location is never reused silently.
            if (onClearLocation) onClearLocation();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && suggestions.length > 0) {
              select(suggestions[0]);
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="geoInput"
          aria-label={label}
        />
        {isLoading ? (
          <Loader2 size={12} className="spinIcon" />
        ) : (
          <Search size={12} className="searchBtnIcon" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="suggestionsMenu" role="listbox">
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              className="suggestionItem"
              role="option"
              onClick={() => select(item)}
            >
              <div className="suggName">{item.name}</div>
              {item.description && <div className="suggDesc">{item.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}