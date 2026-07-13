#!/usr/bin/env python3
"""Generate a self-contained interactive HTML map of evaluated car wash sites.

Zero third-party dependencies: uses only the Python standard library and loads
Leaflet from a public CDN at view time. No `pip install` required.

Input JSON is a list of objects, each with:
    address, lat, lon, price, lot_size, zoning, frontage, aadt, score, notes
`score` is one of "green" (pass), "yellow"/"orange" (borderline), "red" (fail).
"""

import argparse
import html
import json
import sys

# US geographic center — fallback when no parcel has coordinates.
DEFAULT_CENTER = (39.8283, -98.5795)

# Map a parcel score to a Leaflet marker color and a status label.
SCORE_STYLES = {
    "green": ("#2e7d32", "PASS"),
    "yellow": ("#ef6c00", "BORDERLINE"),
    "orange": ("#ef6c00", "BORDERLINE"),
    "red": ("#c62828", "FAIL"),
}


def _money(value):
    try:
        return "${:,}".format(int(value))
    except (TypeError, ValueError):
        return "N/A"


def _popup_html(prop, color, status):
    """Build the escaped popup HTML for a single parcel."""
    def esc(key, default="N/A"):
        return html.escape(str(prop.get(key, default)))

    return (
        '<div style="width:250px;">'
        "<h4 style=\"margin:0 0 6px;\">{address}</h4>"
        "<b>Price:</b> {price}<br>"
        "<b>Lot Size:</b> {lot} acres<br>"
        "<b>Zoning:</b> {zoning}<br>"
        "<b>Frontage:</b> {frontage} ft<br>"
        "<b>AADT:</b> {aadt}<br>"
        "<hr>"
        '<b>Status:</b> <span style="color:{color};font-weight:bold;">{status}</span><br>'
        "<i>{notes}</i>"
        "</div>"
    ).format(
        address=esc("address", "Unknown Address"),
        price=html.escape(_money(prop.get("price"))),
        lot=esc("lot_size"),
        zoning=esc("zoning"),
        frontage=esc("frontage"),
        aadt=esc("aadt"),
        color=color,
        status=status,
        notes=esc("notes", ""),
    )


def create_map(properties_file, output_file):
    try:
        with open(properties_file, "r") as f:
            properties = json.load(f)
    except Exception as e:
        print("Error reading properties file: {}".format(e))
        sys.exit(1)

    if not properties:
        print("No properties found to map.")
        sys.exit(1)

    # Center on the first parcel that has coordinates, else the US center.
    center_lat, center_lon = DEFAULT_CENTER
    for prop in properties:
        if prop.get("lat") is not None and prop.get("lon") is not None:
            center_lat, center_lon = prop["lat"], prop["lon"]
            break

    markers_js = []
    for prop in properties:
        lat = prop.get("lat")
        lon = prop.get("lon")
        if lat is None or lon is None:
            continue

        score = str(prop.get("score", "red")).lower()
        color, status = SCORE_STYLES.get(score, SCORE_STYLES["red"])
        popup = _popup_html(prop, color, status)
        tooltip = html.escape(str(prop.get("address", "Property")))

        markers_js.append(
            "L.circleMarker([{lat}, {lon}], {{radius: 9, color: '#333', weight: 1, "
            "fillColor: '{color}', fillOpacity: 0.9}})"
            ".addTo(map).bindPopup({popup}).bindTooltip({tooltip});".format(
                lat=lat,
                lon=lon,
                color=color,
                popup=json.dumps(popup),
                tooltip=json.dumps(tooltip),
            )
        )

    if not markers_js:
        print("No properties had coordinates to plot.")
        sys.exit(1)

    doc = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Car Wash Site Scout Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
  html, body {{ margin: 0; height: 100%; }}
  #map {{ height: 100vh; width: 100%; }}
  .legend {{ background: #fff; padding: 8px 10px; border-radius: 4px; font: 13px sans-serif;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3); line-height: 1.6; }}
  .legend .dot {{ display: inline-block; width: 12px; height: 12px; border-radius: 50%;
    margin-right: 6px; border: 1px solid #333; }}
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map').setView([{lat}, {lon}], 10);
  L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }}).addTo(map);

  {markers}

  var legend = L.control({{position: 'bottomright'}});
  legend.onAdd = function () {{
    var div = L.DomUtil.create('div', 'legend');
    div.innerHTML =
      '<span class="dot" style="background:#2e7d32"></span>Pass<br>' +
      '<span class="dot" style="background:#ef6c00"></span>Borderline<br>' +
      '<span class="dot" style="background:#c62828"></span>Fail';
    return div;
  }};
  legend.addTo(map);
</script>
</body>
</html>
""".format(lat=center_lat, lon=center_lon, markers="\n  ".join(markers_js))

    try:
        with open(output_file, "w") as f:
            f.write(doc)
    except Exception as e:
        print("Error writing output file: {}".format(e))
        sys.exit(1)

    print("Map successfully generated at: {}".format(output_file))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a car wash site map.")
    parser.add_argument("--input", required=True, help="Path to JSON file containing property data.")
    parser.add_argument("--output", default="car_wash_sites_map.html", help="Path to output HTML file.")
    args = parser.parse_args()
    create_map(args.input, args.output)
