import csv
import os
import random
from datetime import datetime, timedelta

# ==========================================
# CONFIGURATION
# ==========================================

# General Settings
OUTPUT_DIR = "dataset/mock_datasets"
NUM_FILES_TO_GENERATE = 20

# Penetrometer Settings
MAX_DEPTH_MM = 600      # The maximum stroke length of the penetrometer
DEPTH_STEP_MM = 5       # Resolution: take a reading every X mm
SAFETY_CUTOFF_KGF = 50  # Firmware stops pushing if force exceeds this

# Soil Simulation Settings
# Modifying these changes how the "Heatmap" will look in the React App
BASE_SOIL_DENSITY = 0.05    # Base multiplier for depth-to-force
NOISE_LEVEL = 2.0           # Random kgf fluctuation to simulate real sensors
SIMULATE_HARDPAN = True     # If True, creates a dense layer of soil midway down
HARDPAN_DEPTH_START = 200   # Depth where the dense layer begins (mm)
HARDPAN_DEPTH_END = 350     # Depth where the dense layer ends (mm)
HARDPAN_INTENSITY = 15      # Additional kgf added inside the hardpan layer

# ==========================================
# GENERATION SCRIPT
# ==========================================

def generate_compaction_data():
    """Generates realistic soil compaction force values based on depth."""
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created directory: {OUTPUT_DIR}/")

    base_date = datetime.now()

    for i in range(1, NUM_FILES_TO_GENERATE + 1):
        # Generate a mock timestamp and coordinate for the header
        file_date = base_date - timedelta(days=(NUM_FILES_TO_GENERATE - i))
        timestamp_str = file_date.strftime("%Y-%m-%d %H:%M:%S")
        mock_lat = round(random.uniform(-25.0, -25.5), 6)
        mock_lon = round(random.uniform(-49.0, -49.5), 6)
        
        # Decide if this specific sample hits a rock/extreme density
        # 30% chance to have a massive spike that triggers the 50kgf safety limit
        hits_rock = random.random() < 0.3 
        rock_depth = random.randint(100, MAX_DEPTH_MM - 50) if hits_rock else 9999

        filename = os.path.join(OUTPUT_DIR, f"Field_Sample_{file_date.strftime('%Y%m%d')}_{i}.csv")
        
        with open(filename, mode='w', newline='') as file:
            writer = csv.writer(file)
            # Write Header (React app looks for "depth" and "kgf"/"force")
            writer.writerow(["Timestamp", "Latitude", "Longitude", "Depth_mm", "Force_kgf"])
            
            current_depth = 0
            
            while current_depth <= MAX_DEPTH_MM:
                # 1. Base force increases slightly as we go deeper
                force = current_depth * BASE_SOIL_DENSITY
                
                # 2. Add realistic sensor noise
                force += random.uniform(0, NOISE_LEVEL)
                
                # 3. Simulate a "Hardpan" (plow pan) layer
                if SIMULATE_HARDPAN and (HARDPAN_DEPTH_START <= current_depth <= HARDPAN_DEPTH_END):
                    # Bell curve effect for the hardpan to make it look smooth
                    midpoint = (HARDPAN_DEPTH_START + HARDPAN_DEPTH_END) / 2
                    distance = abs(current_depth - midpoint)
                    pan_factor = max(0, 1 - (distance / ((HARDPAN_DEPTH_END - HARDPAN_DEPTH_START)/2)))
                    force += (HARDPAN_INTENSITY * pan_factor)
                
                # 4. Simulate hitting an impassable object (triggers safety cutoff)
                if current_depth >= rock_depth:
                    force += random.uniform(20, 40) # Massive sudden spike
                
                # Format to 2 decimal places
                force = round(force, 2)
                
                # Write row
                writer.writerow([timestamp_str, mock_lat, mock_lon, current_depth, force])
                
                # 5. Firmware Safety Cutoff Logic
                # If the force hits 50kgf, the ESP32 stops the motor. 
                # We simulate this by ending the file generation early.
                if force >= SAFETY_CUTOFF_KGF:
                    break 
                    
                current_depth += DEPTH_STEP_MM

        print(f"Generated: {filename} ({'Triggered 50kgf Safety Cutoff' if force >= SAFETY_CUTOFF_KGF else 'Full Stroke'})")

if __name__ == "__main__":
    print(f"Starting mock data generation...")
    generate_compaction_data()
    print(f"\nDone! You can now import the CSV files from the '{OUTPUT_DIR}' folder into the CoMap desktop app.")