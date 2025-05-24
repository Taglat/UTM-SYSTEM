"use client"
import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Rectangle,
} from "react-leaflet";
import { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Types
interface Pilot {
  id: string;
  name: string;
  phone: string;
  email: string;
  created_at: string;
}

interface Drone {
  id: string;
  brand: string;
  model: string;
  serial_number: string;
  pilot_id: string;
  created_at: string;
}

interface Flight {
  id: string;
  drone_id: string;
  pilot_id: string;
  start_time: string;
  end_time: string;
  altitude: number;
  waypoints: Array<{ lat: number; lng: number }>;
  description?: string;
  status: "pending" | "approved" | "rejected" | "active" | "completed";
  created_at: string;
  violations?: string[];
}

interface TelemetryData {
  drone_id: string;
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  battery: number;
  timestamp: string;
}

interface RestrictedZone {
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

const API_BASE = "http://localhost:8000/api";

const UTMSystem: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "pilots" | "drones" | "flights" | "map"
  >("dashboard");
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [telemetryData, setTelemetryData] = useState<{
    [droneId: string]: TelemetryData[];
  }>({});
  const [restrictedZones, setRestrictedZones] = useState<RestrictedZone[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Forms state
  const [pilotForm, setPilotForm] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [droneForm, setDroneForm] = useState({
    brand: "",
    model: "",
    serial_number: "",
    pilot_id: "",
  });
  const [flightForm, setFlightForm] = useState({
    drone_id: "",
    pilot_id: "",
    start_time: "",
    end_time: "",
    altitude: 50,
    description: "",
    waypoints: [] as Array<{ lat: number; lng: number }>,
  });

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      wsRef.current = new WebSocket("ws://localhost:8000/ws");

      wsRef.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "telemetry") {
          const telemetry: TelemetryData = message.data;
          setTelemetryData((prev) => ({
            ...prev,
            [telemetry.drone_id]: [
              ...(prev[telemetry.drone_id] || []),
              telemetry,
            ].slice(-50),
          }));
        }
      };

      wsRef.current.onclose = () => {
        setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
      };
    };

    connectWebSocket();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [pilotsRes, dronesRes, flightsRes, zonesRes] = await Promise.all([
        fetch(`${API_BASE}/pilots/`),
        fetch(`${API_BASE}/drones/`),
        fetch(`${API_BASE}/flights/`),
        fetch(`${API_BASE}/restricted-zones/`),
      ]);

      setPilots(await pilotsRes.json());
      setDrones(await dronesRes.json());
      setFlights(await flightsRes.json());
      setRestrictedZones(await zonesRes.json());
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const createPilot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/pilots/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pilotForm),
      });
      if (response.ok) {
        setPilotForm({ name: "", phone: "", email: "" });
        loadData();
      }
    } catch (error) {
      console.error("Error creating pilot:", error);
    }
  };

  const createDrone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/drones/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(droneForm),
      });
      if (response.ok) {
        setDroneForm({ brand: "", model: "", serial_number: "", pilot_id: "" });
        loadData();
      }
    } catch (error) {
      console.error("Error creating drone:", error);
    }
  };

  const createFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (flightForm.waypoints.length < 2) {
      alert("Необходимо указать минимум 2 точки маршрута");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/flights/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...flightForm,
          start_time: new Date(flightForm.start_time).toISOString(),
          end_time: new Date(flightForm.end_time).toISOString(),
        }),
      });

      if (response.ok) {
        const newFlight = await response.json();
        if (newFlight.violations) {
          alert(
            `Полет отклонен! Нарушение запретных зон: ${newFlight.violations.join(
              ", "
            )}`
          );
        } else {
          alert("Полет одобрен!");
        }
        setFlightForm({
          drone_id: "",
          pilot_id: "",
          start_time: "",
          end_time: "",
          altitude: 50,
          description: "",
          waypoints: [],
        });
        loadData();
      }
    } catch (error) {
      console.error("Error creating flight:", error);
    }
  };

  const simulateFlight = async (flightId: string) => {
    try {
      const response = await fetch(`${API_BASE}/simulate-flight/${flightId}`, {
        method: "POST",
      });
      if (response.ok) {
        alert("Симуляция полета запущена!");
        loadData();
      }
    } catch (error) {
      console.error("Error starting simulation:", error);
    }
  };

  const addWaypoint = (lat: number, lng: number) => {
    setFlightForm((prev) => ({
      ...prev,
      waypoints: [...prev.waypoints, { lat, lng }],
    }));
  };

  const removeWaypoint = (index: number) => {
    setFlightForm((prev) => ({
      ...prev,
      waypoints: prev.waypoints.filter((_, i) => i !== index),
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "text-green-600";
      case "rejected":
        return "text-red-600";
      case "active":
        return "text-blue-600";
      case "completed":
        return "text-gray-600";
      default:
        return "text-yellow-600";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending":
        return "Ожидание";
      case "approved":
        return "Одобрено";
      case "rejected":
        return "Отклонено";
      case "active":
        return "Активно";
      case "completed":
        return "Завершено";
      default:
        return status;
    }
  };

  // Astana center coordinates
  const astanaCenter: LatLngExpression = [51.1694, 71.4491];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white p-4">
        <h1 className="text-2xl font-bold">UTM Система Казахстана</h1>
        <p className="text-blue-100">
          Система управления воздушным движением беспилотников
        </p>
      </header>

      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            {[
              { id: "dashboard", label: "Дашборд" },
              { id: "pilots", label: "Пилоты" },
              { id: "drones", label: "Дроны" },
              { id: "flights", label: "Полеты" },
              { id: "map", label: "Карта" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900">Пилоты</h3>
              <p className="text-3xl font-bold text-blue-600">
                {pilots.length}
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900">Дроны</h3>
              <p className="text-3xl font-bold text-green-600">
                {drones.length}
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900">
                Активные полеты
              </h3>
              <p className="text-3xl font-bold text-orange-600">
                {flights.filter((f) => f.status === "active").length}
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900">
                Всего полетов
              </h3>
              <p className="text-3xl font-bold text-purple-600">
                {flights.length}
              </p>
            </div>

            <div className="md:col-span-4 bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Последние полеты
              </h3>
              <div className="space-y-2">
                {flights
                  .slice(-5)
                  .reverse()
                  .map((flight) => {
                    const drone = drones.find((d) => d.id === flight.drone_id);
                    const pilot = pilots.find((p) => p.id === flight.pilot_id);
                    return (
                      <div
                        key={flight.id}
                        className="flex justify-between items-center p-3 bg-gray-50 rounded"
                      >
                        <div>
                          <span className="font-medium">
                            {drone?.brand} {drone?.model}
                          </span>
                          <span className="text-gray-500 ml-2">
                            ({pilot?.name})
                          </span>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-sm ${getStatusColor(
                            flight.status
                          )}`}
                        >
                          {getStatusText(flight.status)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "pilots" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Добавить пилота</h2>
              <form onSubmit={createPilot} className="space-y-4">
                <input
                  type="text"
                  placeholder="ФИО"
                  value={pilotForm.name}
                  onChange={(e) =>
                    setPilotForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full p-3 border rounded-lg"
                  required
                />
                <input
                  type="tel"
                  placeholder="Телефон"
                  value={pilotForm.phone}
                  onChange={(e) =>
                    setPilotForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full p-3 border rounded-lg"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={pilotForm.email}
                  onChange={(e) =>
                    setPilotForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full p-3 border rounded-lg"
                  required
                />
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700"
                >
                  Добавить пилота
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Список пилотов</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {pilots.map((pilot) => (
                  <div key={pilot.id} className="p-3 border rounded-lg">
                    <h3 className="font-medium">{pilot.name}</h3>
                    <p className="text-sm text-gray-600">{pilot.phone}</p>
                    <p className="text-sm text-gray-600">{pilot.email}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "drones" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Добавить дрон</h2>
              <form onSubmit={createDrone} className="space-y-4">
                <input
                  type="text"
                  placeholder="Марка"
                  value={droneForm.brand}
                  onChange={(e) =>
                    setDroneForm((prev) => ({ ...prev, brand: e.target.value }))
                  }
                  className="w-full p-3 border rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Модель"
                  value={droneForm.model}
                  onChange={(e) =>
                    setDroneForm((prev) => ({ ...prev, model: e.target.value }))
                  }
                  className="w-full p-3 border rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Серийный номер"
                  value={droneForm.serial_number}
                  onChange={(e) =>
                    setDroneForm((prev) => ({
                      ...prev,
                      serial_number: e.target.value,
                    }))
                  }
                  className="w-full p-3 border rounded-lg"
                  required
                />
                <select
                  value={droneForm.pilot_id}
                  onChange={(e) =>
                    setDroneForm((prev) => ({
                      ...prev,
                      pilot_id: e.target.value,
                    }))
                  }
                  className="w-full p-3 border rounded-lg"
                  required
                >
                  <option value="">Выберите пилота</option>
                  {pilots.map((pilot) => (
                    <option key={pilot.id} value={pilot.id}>
                      {pilot.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700"
                >
                  Добавить дрон
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Список дронов</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {drones.map((drone) => {
                  const pilot = pilots.find((p) => p.id === drone.pilot_id);
                  return (
                    <div key={drone.id} className="p-3 border rounded-lg">
                      <h3 className="font-medium">
                        {drone.brand} {drone.model}
                      </h3>
                      <p className="text-sm text-gray-600">
                        S/N: {drone.serial_number}
                      </p>
                      <p className="text-sm text-gray-600">
                        Пилот: {pilot?.name}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "flights" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">
                Подача заявки на полет
              </h2>
              <form onSubmit={createFlight} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    value={flightForm.drone_id}
                    onChange={(e) =>
                      setFlightForm((prev) => ({
                        ...prev,
                        drone_id: e.target.value,
                      }))
                    }
                    className="p-3 border rounded-lg"
                    required
                  >
                    <option value="">Выберите дрон</option>
                    {drones.map((drone) => (
                      <option key={drone.id} value={drone.id}>
                        {drone.brand} {drone.model} ({drone.serial_number})
                      </option>
                    ))}
                  </select>

                  <select
                    value={flightForm.pilot_id}
                    onChange={(e) =>
                      setFlightForm((prev) => ({
                        ...prev,
                        pilot_id: e.target.value,
                      }))
                    }
                    className="p-3 border rounded-lg"
                    required
                  >
                    <option value="">Выберите пилота</option>
                    {pilots.map((pilot) => (
                      <option key={pilot.id} value={pilot.id}>
                        {pilot.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="datetime-local"
                    placeholder="Время начала"
                    value={flightForm.start_time}
                    onChange={(e) =>
                      setFlightForm((prev) => ({
                        ...prev,
                        start_time: e.target.value,
                      }))
                    }
                    className="p-3 border rounded-lg"
                    required
                  />

                  <input
                    type="datetime-local"
                    placeholder="Время окончания"
                    value={flightForm.end_time}
                    onChange={(e) =>
                      setFlightForm((prev) => ({
                        ...prev,
                        end_time: e.target.value,
                      }))
                    }
                    className="p-3 border rounded-lg"
                    required
                  />

                  <input
                    type="number"
                    placeholder="Высота (м)"
                    value={flightForm.altitude}
                    onChange={(e) =>
                      setFlightForm((prev) => ({
                        ...prev,
                        altitude: parseFloat(e.target.value),
                      }))
                    }
                    className="p-3 border rounded-lg"
                    min="1"
                    max="120"
                    required
                  />

                  <input
                    type="text"
                    placeholder="Описание полета"
                    value={flightForm.description}
                    onChange={(e) =>
                      setFlightForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="p-3 border rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium">Маршрут полета:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="number"
                      placeholder="Широта"
                      step="any"
                      className="p-2 border rounded"
                      id="waypoint-lat"
                    />
                    <input
                      type="number"
                      placeholder="Долгота"
                      step="any"
                      className="p-2 border rounded"
                      id="waypoint-lng"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const latInput = document.getElementById(
                          "waypoint-lat"
                        ) as HTMLInputElement;
                        const lngInput = document.getElementById(
                          "waypoint-lng"
                        ) as HTMLInputElement;
                        const lat = parseFloat(latInput.value);
                        const lng = parseFloat(lngInput.value);
                        if (lat && lng) {
                          addWaypoint(lat, lng);
                          latInput.value = "";
                          lngInput.value = "";
                        }
                      }}
                      className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                    >
                      Добавить точку
                    </button>
                  </div>

                  {flightForm.waypoints.length > 0 && (
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Точки маршрута:</h4>
                      {flightForm.waypoints.map((waypoint, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center p-2 bg-gray-50 rounded"
                        >
                          <span className="text-sm">
                            Точка {index + 1}: {waypoint.lat.toFixed(6)},{" "}
                            {waypoint.lng.toFixed(6)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeWaypoint(index)}
                            className="text-red-500 hover:text-red-700 text-sm"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700"
                >
                  Подать заявку на полет
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Список полетов</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {flights.map((flight) => {
                  const drone = drones.find((d) => d.id === flight.drone_id);
                  const pilot = pilots.find((p) => p.id === flight.pilot_id);
                  return (
                    <div key={flight.id} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">
                            {drone?.brand} {drone?.model}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Пилот: {pilot?.name}
                          </p>
                          <p className="text-sm text-gray-600">
                            Высота: {flight.altitude}м | Точек:{" "}
                            {flight.waypoints.length}
                          </p>
                          <p className="text-sm text-gray-600">
                            {new Date(flight.start_time).toLocaleString()} -{" "}
                            {new Date(flight.end_time).toLocaleString()}
                          </p>
                          {flight.description && (
                            <p className="text-sm text-gray-600">
                              Описание: {flight.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2 py-1 rounded text-sm ${getStatusColor(
                              flight.status
                            )}`}
                          >
                            {getStatusText(flight.status)}
                          </span>
                          {flight.status === "approved" && (
                            <button
                              onClick={() => simulateFlight(flight.id)}
                              className="block mt-2 bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 text-sm"
                            >
                              Запустить симуляцию
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "map" && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Карта мониторинга</h2>
            <div className="h-96 rounded-lg overflow-hidden">
              <MapContainer
                center={astanaCenter}
                zoom={11}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="© OpenStreetMap contributors"
                />

                {/* Restricted Zones */}
                {restrictedZones.map((zone, index) => (
                  <Rectangle
                    key={index}
                    bounds={[
                      [zone.bounds.south, zone.bounds.west],
                      [zone.bounds.north, zone.bounds.east],
                    ]}
                    pathOptions={{
                      color: "red",
                      fillColor: "red",
                      fillOpacity: 0.2,
                    }}
                  >
                    <Popup>
                      <div>
                        <h3 className="font-bold text-red-600">
                          Запретная зона
                        </h3>
                        <p>{zone.name}</p>
                      </div>
                    </Popup>
                  </Rectangle>
                ))}

                {/* Flight Routes */}
                {flights
                  .filter(
                    (f) => f.status === "approved" || f.status === "active"
                  )
                  .map((flight) => (
                    <Polyline
                      key={flight.id}
                      positions={flight.waypoints.map(
                        (wp) => [wp.lat, wp.lng] as LatLngExpression
                      )}
                      pathOptions={{
                        color: flight.status === "active" ? "blue" : "green",
                        weight: 3,
                        opacity: 0.7,
                      }}
                    >
                      <Popup>
                        <div>
                          <h3 className="font-bold">План полета</h3>
                          <p>
                            Дрон:{" "}
                            {
                              drones.find((d) => d.id === flight.drone_id)
                                ?.brand
                            }{" "}
                            {
                              drones.find((d) => d.id === flight.drone_id)
                                ?.model
                            }
                          </p>
                          <p>Статус: {getStatusText(flight.status)}</p>
                          <p>Высота: {flight.altitude}м</p>
                        </div>
                      </Popup>
                    </Polyline>
                  ))}

                {/* Live Drone Positions */}
                {Object.entries(telemetryData).map(
                  ([droneId, telemetryList]) => {
                    if (telemetryList.length === 0) return null;
                    const latest = telemetryList[telemetryList.length - 1];
                    const drone = drones.find((d) => d.id === droneId);

                    return (
                      <Marker key={droneId} position={[latest.lat, latest.lng]}>
                        <Popup>
                          <div>
                            <h3 className="font-bold text-blue-600">
                              Активный дрон
                            </h3>
                            <p>
                              {drone?.brand} {drone?.model}
                            </p>
                            <p>Высота: {latest.altitude.toFixed(1)}м</p>
                            <p>Скорость: {latest.speed.toFixed(1)} м/с</p>
                            <p>Батарея: {latest.battery.toFixed(1)}%</p>
                            <p className="text-xs text-gray-500">
                              Обновлено:{" "}
                              {new Date(latest.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }
                )}
              </MapContainer>
            </div>

            {/* Live Telemetry Panel */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(telemetryData)
                .filter(([_, data]) => data.length > 0)
                .map(([droneId, data]) => {
                  const latest = data[data.length - 1];
                  const drone = drones.find((d) => d.id === droneId);

                  return (
                    <div
                      key={droneId}
                      className="p-4 border rounded-lg bg-blue-50"
                    >
                      <h3 className="font-semibold text-blue-900">
                        {drone?.brand} {drone?.model}
                      </h3>
                      <div className="text-sm space-y-1 mt-2">
                        <p>
                          Координаты: {latest.lat.toFixed(6)},{" "}
                          {latest.lng.toFixed(6)}
                        </p>
                        <p>Высота: {latest.altitude.toFixed(1)}м</p>
                        <p>Скорость: {latest.speed.toFixed(1)} м/с</p>
                        <div className="flex items-center">
                          <span>Батарея: {latest.battery.toFixed(1)}%</span>
                          <div className="ml-2 w-16 h-2 bg-gray-200 rounded">
                            <div
                              className={`h-2 rounded ${
                                latest.battery > 20
                                  ? "bg-green-500"
                                  : "bg-red-500"
                              }`}
                              style={{
                                width: `${Math.max(0, latest.battery)}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          Обновлено:{" "}
                          {new Date(latest.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default UTMSystem;
