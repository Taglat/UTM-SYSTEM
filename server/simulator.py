import asyncio
import aiohttp
import json
import random
from datetime import datetime
import time

class DroneSimulator:
    """Симулятор дрона для отправки телеметрии в UTM систему"""
    
    def __init__(self, drone_id: str, api_base: str = "http://localhost:8000/api"):
        self.drone_id = drone_id
        self.api_base = api_base
        self.is_flying = False
        self.current_position = {"lat": 51.1694, "lng": 71.4491}  # Астана центр
        self.altitude = 0.0
        self.speed = 0.0
        self.battery = 100.0
        self.waypoints = []
        self.current_waypoint_index = 0
        
    async def load_flight_plan(self):
        """Загрузка плана полета из API"""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(f"{self.api_base}/flights/") as response:
                    if response.status == 200:
                        flights = await response.json()
                        # Найти активный полет для этого дрона
                        for flight in flights:
                            if (flight["drone_id"] == self.drone_id and 
                                flight["status"] == "active"):
                                self.waypoints = flight["waypoints"]
                                self.altitude = flight["altitude"]
                                print(f"Загружен план полета: {len(self.waypoints)} точек")
                                return True
                return False
            except Exception as e:
                print(f"Ошибка загрузки плана полета: {e}")
                return False
    
    async def send_telemetry(self):
        """Отправка телеметрии в API"""
        telemetry_data = {
            "drone_id": self.drone_id,
            "lat": self.current_position["lat"],
            "lng": self.current_position["lng"],
            "altitude": self.altitude,
            "speed": self.speed,
            "battery": self.battery,
            "timestamp": datetime.now().isoformat()
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.api_base}/telemetry/",
                    json=telemetry_data
                ) as response:
                    if response.status == 200:
                        print(f"Телеметрия отправлена: {self.current_position}")
                    else:
                        print(f"Ошибка отправки телеметрии: {response.status}")
            except Exception as e:
                print(f"Ошибка соединения: {e}")
    
    def calculate_next_position(self, target_waypoint):
        """Вычисление следующей позиции по направлению к целевой точке"""
        current_lat = self.current_position["lat"]
        current_lng = self.current_position["lng"]
        target_lat = target_waypoint["lat"]
        target_lng = target_waypoint["lng"]
        
        # Простое линейное движение (в реальности используется более сложная навигация)
        lat_diff = target_lat - current_lat
        lng_diff = target_lng - current_lng
        
        # Расстояние до цели
        distance = (lat_diff**2 + lng_diff**2)**0.5
        
        if distance < 0.0001:  # Достигли точки (примерно 10 метров)
            return target_waypoint, True
        
        # Скорость движения (градусы в секунду)
        move_speed = 0.0001  # Примерно 10 м/с
        
        # Нормализация направления
        if distance > 0:
            lat_step = (lat_diff / distance) * move_speed
            lng_step = (lng_diff / distance) * move_speed
        else:
            lat_step = lng_step = 0
        
        new_position = {
            "lat": current_lat + lat_step,
            "lng": current_lng + lng_step
        }
        
        return new_position, False
    
    async def fly_mission(self):
        """Выполнение полетного задания"""
        if not self.waypoints:
            print("Нет плана полета")
            return
        
        self.is_flying = True
        self.current_waypoint_index = 0
        self.speed = random.uniform(12.0, 18.0)  # м/с
        
        print(f"Начало полета по {len(self.waypoints)} точкам")
        
        while self.is_flying and self.current_waypoint_index < len(self.waypoints):
            target_waypoint = self.waypoints[self.current_waypoint_index]
            
            # Движение к текущей точке
            while self.is_flying:
                new_position, reached = self.calculate_next_position(target_waypoint)
                self.current_position = new_position
                
                # Имитация расхода батареи
                self.battery = max(0, self.battery - random.uniform(0.1, 0.3))
                
                # Добавление небольшого шума к позиции (имитация GPS погрешности)
                self.current_position["lat"] += random.uniform(-0.00001, 0.00001)
                self.current_position["lng"] += random.uniform(-0.00001, 0.00001)
                
                # Отправка телеметрии
                await self.send_telemetry()
                
                if reached:
                    print(f"Достигнута точка {self.current_waypoint_index + 1}")
                    self.current_waypoint_index += 1
                    break
                
                # Проверка критического уровня батареи
                if self.battery < 20:
                    print("Критический уровень батареи! Возвращение на базу")
                    self.is_flying = False
                    break
                
                await asyncio.sleep(2)  # Интервал отправки телеметрии
        
        self.is_flying = False
        self.speed = 0.0
        print("Полет завершен")
    
    async def emergency_landing(self):
        """Экстренная посадка"""
        print("Выполнение экстренной посадки")
        self.is_flying = False
        
        # Постепенное снижение высоты
        while self.altitude > 0:
            self.altitude = max(0, self.altitude - 5)
            self.speed = max(0, self.speed - 1)
            await self.send_telemetry()
            await asyncio.sleep(1)
        
        print("Экстренная посадка завершена")
    
    async def start_simulation(self):
        """Запуск симуляции"""
        print(f"Запуск симулятора дрона {self.drone_id}")
        
        # Попытка загрузить план полета
        flight_loaded = await self.load_flight_plan()
        
        if flight_loaded:
            await self.fly_mission()
        else:
            print("Нет активного плана полета, ожидание...")
            # Режим ожидания - отправка телеметрии текущей позиции
            for _ in range(10):
                await self.send_telemetry()
                await asyncio.sleep(5)

async def simulate_multiple_drones():
    """Симуляция нескольких дронов одновременно"""
    
    # Примерные ID дронов (должны существовать в системе)
    drone_ids = [
        "drone_1",
        "drone_2", 
        "drone_3"
    ]
    
    # Создание симуляторов
    simulators = [DroneSimulator(drone_id) for drone_id in drone_ids]
    
    print("Запуск симуляции нескольких дронов...")
    
    # Запуск всех симуляторов параллельно
    tasks = [simulator.start_simulation() for simulator in simulators]
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    print("Симулятор дронов UTM системы")
    print("1. Одиночный дрон")
    print("2. Несколько дронов")
    
    choice = input("Выберите режим (1 или 2): ")
    
    if choice == "1":
        drone_id = input("Введите ID дрона: ")
        simulator = DroneSimulator(drone_id)
        asyncio.run(simulator.start_simulation())
    elif choice == "2":
        asyncio.run(simulate_multiple_drones())
    else:
        print("Неверный выбор")