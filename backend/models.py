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


class EmergencyTrigger(BaseModel):
    user_id: str
    session_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    contacts: List[EmergencyContact] = []


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
