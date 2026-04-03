from fastapi import APIRouter, HTTPException
from models import EmergencyTrigger, EmergencyStop, EmergencyAcknowledge
from pydantic import BaseModel
from services.store import start_emergency, stop_emergency, get_emergency, get_emergency_by_session, update_emergency_layer, acknowledge_emergency

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

class LayerEscalate(BaseModel):
    user_id: str
    session_id: str
    new_layer: int

@router.post("/escalate-layer")
def escalate_emergency_layer(data: LayerEscalate):
    """
    Called to move the emergency to the next tier of contacts.
    """
    emergency = get_emergency(data.user_id)
    if not emergency or emergency.get("session_id") != data.session_id:
        raise HTTPException(status_code=404, detail="Active emergency not found")

    update_emergency_layer(data.user_id, data.new_layer)
    return {"status": "layer_escalated", "current_layer": data.new_layer}

@router.post("/acknowledge")
def acknowledge(data: EmergencyAcknowledge):
    """
    Called when a reply is detected by the phone natively.
    """
    import services.store as store
    # find user_id by session_id
    user_id = None
    for uid, em in store.emergency_store.items():
        if em.get("session_id") == data.session_id:
            user_id = uid
            break

    if not user_id:
        raise HTTPException(status_code=404, detail="Active emergency not found")

    acknowledge_emergency(user_id, data.contact_phone)
    return {"status": "acknowledged", "phone": data.contact_phone}


@router.get("/status/{user_id}")
def get_status(user_id: str):
    """
    Returns the current emergency status for a user.
    """
    emergency = get_emergency(user_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="No active emergency for this user")
    return {"user_id": user_id, **emergency}
