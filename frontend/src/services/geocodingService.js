/**
 * Geocoding Service using OpenStreetMap / Nominatim API with fallback support.
 */

const PRESET_LOCATIONS = [
  { name: "Delhi NCR", coords: [77.2090, 28.6139], description: "National Capital Region, India" },
  { name: "Jaipur", coords: [75.7873, 26.9124], description: "Pink City, Rajasthan, India" },
  { name: "Gurgaon (Gurugram)", coords: [77.0266, 28.4595], description: "Corporate Corridor, Haryana, India" },
  { name: "Neemrana", coords: [76.3812, 27.9945], description: "Japanese Industrial Zone, Rajasthan, India" },
  { name: "Alwar", coords: [76.6045, 27.5705], description: "NCR Western Sub-region, Rajasthan, India" },
  { name: "Rewari", coords: [76.6170, 28.1831], description: "Logistics Hub, Haryana, India" },
  { name: "Kotputli", coords: [76.2012, 27.7011], description: "Highway Junction, Rajasthan, India" },
  { name: "Bhiwadi", coords: [76.8400, 28.2100], description: "Industrial Corridor, Rajasthan, India" },
  { name: "Chandigarh", coords: [76.7794, 30.7333], description: "Capital City, Punjab/Haryana, India" },
  { name: "Agra", coords: [78.0081, 27.1767], description: "Uttar Pradesh, India" },
  { name: "Ahmedabad", coords: [72.5714, 23.0225], description: "Gujarat, India" },
  { name: "Mumbai", coords: [72.8777, 19.0760], description: "Maharashtra, India" }
];

/**
 * Search locations using Nominatim with debounced calling in UI
 */
export async function searchLocations(query) {
  if (!query || query.trim().length < 2) {
    return PRESET_LOCATIONS.slice(0, 5);
  }

  const q = query.trim().toLowerCase();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'InfrastructureIntelligenceSpatialPlanner/1.0'
      }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item) => ({
          name: item.display_name.split(',')[0],
          fullName: item.display_name,
          coords: [parseFloat(item.lon), parseFloat(item.lat)],
          description: item.display_name.split(',').slice(1, 3).join(', ').trim()
        }));
      }
    }
  } catch (error) {
    console.warn("Nominatim Geocoding API request failed, falling back to local dataset:", error);
  }

  // Local preset filtering
  const matches = PRESET_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(q) ||
      loc.description.toLowerCase().includes(q)
  );

  return matches.length > 0 ? matches : PRESET_LOCATIONS.slice(0, 5);
}

/**
 * Get fallback default location by name
 */
export function getDefaultLocation(name) {
  const loc = PRESET_LOCATIONS.find((l) =>
    l.name.toLowerCase().includes(name.toLowerCase())
  );
  if (loc) return loc;
  return PRESET_LOCATIONS[0];
}
