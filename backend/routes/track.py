from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from services.store import get_emergency_by_session, get_location

router = APIRouter(tags=["Tracking"])


@router.get("/track/{session_id}", response_class=HTMLResponse)
def live_tracking_page(session_id: str):
    """
    Live tracking page opened by emergency contacts.
    Auto-refreshes location from the backend every 5 seconds.
    """
    session = get_emergency_by_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Tracking session not found")

    user_id = session.get("user_id", "")
    initial_lat = session.get("latitude", 0)
    initial_lng = session.get("longitude", 0)
    start_time = session.get("start_time", "")
    status = session.get("status", "active")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>HelpLink:SFC — Live Tracking</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #fff; }}
    .header {{
      background: #c0392b;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }}
    .header h1 {{ font-size: 18px; font-weight: 700; }}
    .header p {{ font-size: 12px; opacity: 0.85; margin-top: 2px; }}
    .status-bar {{
      background: #1a1a1a;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      border-bottom: 1px solid #333;
    }}
    .dot {{
      width: 10px; height: 10px; border-radius: 50%;
      background: #2ecc71; animation: pulse 1.5s infinite;
    }}
    .dot.offline {{ background: #e74c3c; animation: none; }}
    @keyframes pulse {{ 0%, 100% {{ opacity:1 }} 50% {{ opacity:0.3 }} }}
    #map {{ width: 100%; height: calc(100vh - 140px); border: none; }}
    .info-panel {{
      background: #1a1a1a;
      padding: 16px 20px;
      font-size: 13px;
      color: #aaa;
      border-top: 1px solid #333;
    }}
    .info-panel span {{ color: #fff; }}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>EMERGENCY — Live Location</h1>
      <p>This person needs help. Track their real-time location below.</p>
    </div>
  </div>

  <div class="status-bar">
    <div class="dot" id="status-dot"></div>
    <span id="status-text">Fetching live location...</span>
  </div>

  <iframe id="map"
    src="https://maps.google.com/maps?q={initial_lat},{initial_lng}&z=16&output=embed"
    allowfullscreen>
  </iframe>

  <div class="info-panel">
    Last updated: <span id="last-updated">—</span> &nbsp;|&nbsp;
    Emergency started: <span>{start_time[:19].replace("T", " ")} UTC</span> &nbsp;|&nbsp;
    Session: <span>{session_id}</span>
  </div>

  <script>
    const userId = "{user_id}";
    const sessionId = "{session_id}";

    async function refreshLocation() {{
      try {{
        const res = await fetch('/api/location/latest/' + userId);
        if (!res.ok) throw new Error('No data');
        const data = await res.json();
        const lat = data.latitude;
        const lng = data.longitude;

        document.getElementById('map').src =
          `https://maps.google.com/maps?q=${{lat}},${{lng}}&z=16&output=embed`;

        document.getElementById('status-dot').className = 'dot';
        document.getElementById('status-text').textContent = 'Live — updating every 5 seconds';
        document.getElementById('last-updated').textContent =
          new Date().toLocaleTimeString();
      }} catch (e) {{
        document.getElementById('status-dot').className = 'dot offline';
        document.getElementById('status-text').textContent =
          'Signal lost — showing last known location';
      }}
    }}

    // Refresh every 5 seconds
    setInterval(refreshLocation, 5000);
    refreshLocation();
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)
