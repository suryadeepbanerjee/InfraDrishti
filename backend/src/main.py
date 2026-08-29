from fastapi import FastAPI
from src.api.routes import router

app = FastAPI(title="Infrastructure Intelligence Platform")
app.include_router(router)

@app.get("/health")
def health():
    return {"status": "ok"}