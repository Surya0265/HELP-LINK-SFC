from fastapi import FastAPI

app = FastAPI(
    title="HelpLink:SFC API",
    description="Backend API for the HelpLink:SFC Emergency Response System",
    version="1.0.0"
)

@app.get("/")
def read_root():
    return {"message": "Welcome to HelpLink:SFC API"}
