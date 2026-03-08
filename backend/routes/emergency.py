import uuid
from fastapi import APIRouter, HTTPException
from models import EmergencyTrigger, EmergencyStop
from services.store import start_emergency, stop_emergency, get_emergency, get_emergency_by_session

router = APIRouter(prefix="/api/emergency", tags=["Emergency"])


@router.post("/trigger")
def trigger_emergency(data: EmergencyTrigger):
    """
    Called when the user presses SOS.
    Receives the locally generated tracking session ID from the phone.
    """
    contacts = [c.dict() for c in data.contacts]

    start_emergency(
        user_id=data.user_id,
        session_id=data.session_id,
        contacts=contacts,
        latitude=data.latitude,
        longitude=data.longitude,
    )

    return {
        "status": "emergency_started",
        "session_id": data.session_id,
        "tracking_url": f"/track/{data.session_id}",
        "user_id": data.user_id,
    }


@router.post("/stop")
def stop_emergency_route(data: EmergencyStop):
    """
    Called when the user ends the emergency.
    """
    stop_emergency(data.user_id)
    return {"status": "emergency_stopped", "user_id": data.user_id}


@router.get("/status/{user_id}")
def get_status(user_id: str):
    """
    Returns the current emergency status for a user.
    """
    emergency = get_emergency(user_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="No active emergency for this user")
    return {"user_id": user_id, **emergency}
