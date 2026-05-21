from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

# 1. Initialize the app
app = FastAPI()

# 2. Define a data structure (schema) for incoming data
class Item(BaseModel):
    name: str
    price: float
    is_on_sale: Optional[bool] = False

# 3. An in-memory database simulation to store our data
fake_database = {
    1: {"name": "Wireless Mouse", "price": 29.99, "is_on_sale": True},
    2: {"name": "Mechanical Keyboard", "price": 89.99, "is_on_sale": False}
}

# 4. GET Endpoint: A simple home welcome route
@app.get("/")
def home():
    return {"message": "Welcome to my global FastAPI app!"}

# 5. GET Endpoint: Read data using a 'Path Parameter' (item_id)
@app.get("/items/{item_id}")
def read_item(item_id: int):
    if item_id in fake_database:
        return fake_database[item_id]
    return {"error": "Item not found"}

# 6. POST Endpoint: Create new data using data validation
@app.post("/items/")
def create_item(item: Item):
    # Calculate a new ID based on current items
    new_id = max(fake_database.keys()) + 1
    
    # .dict() converts the Pydantic object into a standard Python dictionary
    fake_database[new_id] = item.dict()
    
    return {"message": "Success!", "inserted_id": new_id, "data": fake_database[new_id]}