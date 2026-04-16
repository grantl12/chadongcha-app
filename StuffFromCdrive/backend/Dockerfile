FROM python:3.12-slim

WORKDIR /app

# Copy requirements from the backend folder
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY backend/ .

# Ensure main.py is in the workdir so uvicorn can find it
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
