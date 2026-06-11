from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="TicketZilla AI Service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/")
def root() -> dict:
    return {"service": "ticketzilla-ai", "version": "0.1.0"}
