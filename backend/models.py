from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class LocationUpdate(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: Optional[str] = None


class EmergencyContact(BaseModel):
    name: str
    phone: str
    layer: Optional[int] = 1

class EmergencyTrigger(BaseModel):
    user_id: str
    session_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    contacts: List[EmergencyContact] = []

class EmergencyAcknowledge(BaseModel):
    session_id: str
    contact_phone: str
    message: Optional[str] = None


class EmergencyStop(BaseModel):
    user_id: str
    session_id: str


class LocationData(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: str
    is_emergency: bool = False
