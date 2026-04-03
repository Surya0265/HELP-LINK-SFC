"""
In-memory store for location data and active emergencies.
In production this would be replaced with a database (Redis / PostgreSQL).
"""
from typing import Dict, Optional
from datetime import datetime


# Stores latest location per user_id
# { user_id: { latitude, longitude, accuracy, timestamp } }
location_store: Dict[str, dict] = {}

# Stores active emergency sessions
# { user_id: { session_id, start_time, contacts, last_ping } }
emergency_store: Dict[str, dict] = {}


def update_location(user_id: str, latitude: float, longitude: float,
                    accuracy: Optional[float], timestamp: Optional[str] = None):
    location_store[user_id] = {
        "latitude": latitude,
        "longitude": longitude,
        "accuracy": accuracy,
        "timestamp": timestamp or datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    # If user has an active emergency, refresh last_ping
    if user_id in emergency_store:
        emergency_store[user_id]["last_ping"] = datetime.utcnow().isoformat()


def get_location(user_id: str) -> Optional[dict]:
    return location_store.get(user_id)


def start_emergency(user_id: str, session_id: str, contacts: list,
                    latitude: float, longitude: float):
    emergency_store[user_id] = {
        "session_id": session_id,
        "start_time": datetime.utcnow().isoformat(),
        "last_ping": datetime.utcnow().isoformat(),
        "contacts": contacts,
        "latitude": latitude,
        "longitude": longitude,
        "status": "active",
        "current_layer": 1,
        "acknowledged_by": None,
        "is_acknowledged": False
    }
    update_location(user_id, latitude, longitude, None)

def update_emergency_layer(user_id: str, new_layer: int):
    if user_id in emergency_store:
        emergency_store[user_id]["current_layer"] = new_layer

def acknowledge_emergency(user_id: str, contact_phone: str):
    if user_id in emergency_store:
        emergency_store[user_id]["status"] = "acknowledged"
        emergency_store[user_id]["is_acknowledged"] = True
        emergency_store[user_id]["acknowledged_by"] = contact_phone


def stop_emergency(user_id: str):
    if user_id in emergency_store:
        emergency_store[user_id]["status"] = "stopped"


def get_emergency(user_id: str) -> Optional[dict]:
    return emergency_store.get(user_id)


def get_emergency_by_session(session_id: str) -> Optional[dict]:
    for user_id, data in emergency_store.items():
        if data.get("session_id") == session_id:
            loc = location_store.get(user_id, {})
            return {**data, "user_id": user_id, **loc}
    return None
