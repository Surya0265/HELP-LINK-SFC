from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.location import router as location_router
from routes.emergency import router as emergency_router
from routes.track import router as track_router

app = FastAPI(
    title="HelpLink:SFC API",
    description="Backend API for the HelpLink:SFC Emergency Response System",
    version="1.0.0"
)

# Allow requests from the mobile app (any origin for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(location_router)
app.include_router(emergency_router)
app.include_router(track_router)


@app.get("/")
def read_root():
    return {"message": "Welcome to HelpLink:SFC API", "version": "1.0.0"}
