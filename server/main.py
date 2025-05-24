from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import json
import asyncio
import uuid
from dataclasses import dataclass, asdict

app = FastAPI(title="UTM System API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enums
class FlightStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    COMPLETED = "completed"

# Pydantic models
class DroneCreate(BaseModel):
    brand: str
    model: str
    serial_number: str
    pilot_id: str

class PilotCreate(BaseModel):
    name: str
    phone: str
    email: str

class FlightPlan(BaseModel):
    drone_id: str
    pilot_id: str
    start_time: datetime
    end_time: datetime
    altitude: float
    waypoints: List[Dict[str, float]]  # [{"lat": 51.1, "lng": 71.4}, ...]
    description: Optional[str] = None

class TelemetryData(BaseModel):
    drone_id: str
    lat: float
    lng: float
    altitude: float
    speed: float
    battery: float
    timestamp: datetime

# Data classes for storage
@dataclass
class Drone:
    id: str
    brand: str
    model: str
    serial_number: str
    pilot_id: str
    created_at: datetime

@dataclass
class Pilot:
    id: str
    name: str
    phone: str
    email: str
    created_at: datetime

@dataclass
class Flight:
    id: str
    drone_id: str
    pilot_id: str
    start_time: datetime
    end_time: datetime
    altitude: float
    waypoints: List[Dict[str, float]]
    description: Optional[str]
    status: FlightStatus
    created_at: datetime

# In-memory storage (in production, use database)
pilots: Dict[str, Pilot] = {}
drones: Dict[str, Drone] = {}
flights: Dict[str, Flight] = {}
telemetry_data: Dict[str, List[TelemetryData]] = {}

# WebSocket connections manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

# Запретные зоны Астаны (примерные координаты)
ASTANA_RESTRICTED_ZONES = [
    {
        "name": "Аэропорт Нур-Султан",
        "bounds": {
            "north": 51.0342,
            "south": 51.0142,
            "east": 71.4842,
            "west": 71.4442
        }
    },
    {
        "name": "Ак-Орда",
        "bounds": {
            "north": 51.1742,
            "south": 51.1642,
            "east": 71.4142,
            "west": 71.4042
        }
    }
]

def check_restricted_zones(waypoints: List[Dict[str, float]]) -> List[str]:
    """Проверка пересечения маршрута с запретными зонами"""
    violations = []
    
    for waypoint in waypoints:
        lat, lng = waypoint.get("lat"), waypoint.get("lng")
        if not lat or not lng:
            continue
            
        for zone in ASTANA_RESTRICTED_ZONES:
            bounds = zone["bounds"]
            if (bounds["south"] <= lat <= bounds["north"] and 
                bounds["west"] <= lng <= bounds["east"]):
                violations.append(zone["name"])
    
    return list(set(violations))

# API Routes

@app.get("/")
async def root():
    return {"message": "UTM System API"}

# Pilots endpoints
@app.post("/api/pilots/")
async def create_pilot(pilot_data: PilotCreate):
    pilot_id = str(uuid.uuid4())
    pilot = Pilot(
        id=pilot_id,
        name=pilot_data.name,
        phone=pilot_data.phone,
        email=pilot_data.email,
        created_at=datetime.now()
    )
    pilots[pilot_id] = pilot
    return asdict(pilot)

@app.get("/api/pilots/")
async def get_pilots():
    return [asdict(pilot) for pilot in pilots.values()]

@app.get("/api/pilots/{pilot_id}")
async def get_pilot(pilot_id: str):
    if pilot_id not in pilots:
        raise HTTPException(status_code=404, detail="Pilot not found")
    return asdict(pilots[pilot_id])

# Drones endpoints
@app.post("/api/drones/")
async def create_drone(drone_data: DroneCreate):
    if drone_data.pilot_id not in pilots:
        raise HTTPException(status_code=400, detail="Pilot not found")
    
    drone_id = str(uuid.uuid4())
    drone = Drone(
        id=drone_id,
        brand=drone_data.brand,
        model=drone_data.model,
        serial_number=drone_data.serial_number,
        pilot_id=drone_data.pilot_id,
        created_at=datetime.now()
    )
    drones[drone_id] = drone
    return asdict(drone)

@app.get("/api/drones/")
async def get_drones():
    return [asdict(drone) for drone in drones.values()]

@app.get("/api/drones/{drone_id}")
async def get_drone(drone_id: str):
    if drone_id not in drones:
        raise HTTPException(status_code=404, detail="Drone not found")
    return asdict(drones[drone_id])

# Flight plans endpoints
@app.post("/api/flights/")
async def create_flight_plan(flight_data: FlightPlan):
    if flight_data.drone_id not in drones:
        raise HTTPException(status_code=400, detail="Drone not found")
    if flight_data.pilot_id not in pilots:
        raise HTTPException(status_code=400, detail="Pilot not found")
    
    # Проверка запретных зон
    restricted_violations = check_restricted_zones(flight_data.waypoints)
    
    flight_id = str(uuid.uuid4())
    status = FlightStatus.REJECTED if restricted_violations else FlightStatus.APPROVED
    
    flight = Flight(
        id=flight_id,
        drone_id=flight_data.drone_id,
        pilot_id=flight_data.pilot_id,
        start_time=flight_data.start_time,
        end_time=flight_data.end_time,
        altitude=flight_data.altitude,
        waypoints=flight_data.waypoints,
        description=flight_data.description,
        status=status,
        created_at=datetime.now()
    )
    flights[flight_id] = flight
    
    response = asdict(flight)
    if restricted_violations:
        response["violations"] = restricted_violations
    
    return response

@app.get("/api/flights/")
async def get_flights():
    return [asdict(flight) for flight in flights.values()]

@app.get("/api/flights/{flight_id}")
async def get_flight(flight_id: str):
    if flight_id not in flights:
        raise HTTPException(status_code=404, detail="Flight not found")
    return asdict(flights[flight_id])

@app.patch("/api/flights/{flight_id}/status")
async def update_flight_status(flight_id: str, status: FlightStatus):
    if flight_id not in flights:
        raise HTTPException(status_code=404, detail="Flight not found")
    
    flights[flight_id].status = status
    return asdict(flights[flight_id])

# Telemetry endpoints
@app.post("/api/telemetry/")
async def receive_telemetry(telemetry: TelemetryData):
    if telemetry.drone_id not in drones:
        raise HTTPException(status_code=400, detail="Drone not found")
    
    if telemetry.drone_id not in telemetry_data:
        telemetry_data[telemetry.drone_id] = []
    
    telemetry_data[telemetry.drone_id].append(telemetry)
    
    # Keep only last 100 records per drone
    if len(telemetry_data[telemetry.drone_id]) > 100:
        telemetry_data[telemetry.drone_id] = telemetry_data[telemetry.drone_id][-100:]
    
    # Broadcast to WebSocket clients
    await manager.broadcast({
        "type": "telemetry",
        "data": telemetry.dict()
    })
    
    return {"status": "received"}

@app.get("/api/telemetry/{drone_id}")
async def get_drone_telemetry(drone_id: str, limit: int = 50):
    if drone_id not in drones:
        raise HTTPException(status_code=404, detail="Drone not found")
    
    data = telemetry_data.get(drone_id, [])
    return [t.dict() for t in data[-limit:]]

@app.get("/api/restricted-zones/")
async def get_restricted_zones():
    return ASTANA_RESTRICTED_ZONES

# WebSocket endpoint for real-time updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Flight simulation endpoint (for demo)
@app.post("/api/simulate-flight/{flight_id}")
async def simulate_flight(flight_id: str):
    if flight_id not in flights:
        raise HTTPException(status_code=404, detail="Flight not found")
    
    flight = flights[flight_id]
    if flight.status != FlightStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Flight must be approved")
    
    # Start simulation in background
    asyncio.create_task(run_flight_simulation(flight))
    
    flights[flight_id].status = FlightStatus.ACTIVE
    return {"status": "simulation_started"}

async def run_flight_simulation(flight: Flight):
    """Симуляция полета дрона по заданным точкам"""
    waypoints = flight.waypoints
    if len(waypoints) < 2:
        return
    
    for i in range(len(waypoints) - 1):
        start_point = waypoints[i]
        end_point = waypoints[i + 1]
        
        # Интерполяция между точками
        steps = 10
        for step in range(steps + 1):
            progress = step / steps
            lat = start_point["lat"] + (end_point["lat"] - start_point["lat"]) * progress
            lng = start_point["lng"] + (end_point["lng"] - start_point["lng"]) * progress
            
            telemetry = TelemetryData(
                drone_id=flight.drone_id,
                lat=lat,
                lng=lng,
                altitude=flight.altitude,
                speed=15.0,  # m/s
                battery=100.0 - (progress * 20),  # Simulation of battery drain
                timestamp=datetime.now()
            )
            
            # Store telemetry
            if flight.drone_id not in telemetry_data:
                telemetry_data[flight.drone_id] = []
            telemetry_data[flight.drone_id].append(telemetry)
            
            # Broadcast telemetry
            await manager.broadcast({
                "type": "telemetry",
                "data": telemetry.dict()
            })
            
            await asyncio.sleep(2)  # 2 seconds between updates
    
    # Mark flight as completed
    flights[flight.id].status = FlightStatus.COMPLETED

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)