from fastapi import APIRouter, HTTPException
from models import LocationUpdate
from services.store import update_location, get_location

router = APIRouter(prefix="/api/location", tags=["Location"])


@router.post("/update")
def post_location(data: LocationUpdate):
    """
    Called by the phone every 5 seconds during an active emergency
    (or every 30 seconds in normal mode) to keep the backend in sync.
    """
    update_location(
        user_id=data.user_id,
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy,
        timestamp=data.timestamp,
    )
    return {"status": "ok", "user_id": data.user_id}


@router.get("/latest/{user_id}")
def get_latest_location(user_id: str):
    """
    Returns the most recent location for a given user.
    Used by the live tracking page to refresh the map marker.
    """
    loc = get_location(user_id)
    if not loc:
        raise HTTPException(status_code=404, detail="No location found for this user")
    return {"user_id": user_id, **loc}
