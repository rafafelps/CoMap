# CoMap (Compaction Mapper)

CoMap is a localized, offline-first desktop application designed for agricultural and geotechnical engineering. Built with Electron and React, it ingests raw load-cell data from a custom ESP32-based penetrometer, calculates soil pressure according to ASABE standards, and visualizes chronological soil compaction profiles.

## ✨ Features

* **🔌 Direct Hardware Integration:** Connects directly to custom ESP32 firmware via USB-C using the Web Serial API. Includes remote SD card formatting (`WIPE_SD` command).

* **📊 Advanced Analytics Dashboard:** Extracts peak force, maximum pressure, and analyzed depth. Generates 2D depth profile graphs and 3D isometric block models entirely in CSS/SVG.

* **🗺️ 2D Chronology Heatmaps:** Aligns multiple historical datasets chronologically to map the evolution of soil compaction (e.g., hardpans, plow pans) over time.

* **📏 ASABE S313.3 Compliance:** Automatically converts raw Force (kgf) to Pressure (MPa) based on the standard 12.83mm cone diameter. Detects and flags 50kgf firmware safety cutoffs.


* **🔒 100% Offline:** Processes all analytics in local memory. Zero cloud connectivity required.

## 🛠️ Technology Stack

* **Framework:** Electron + Vite

* **Frontend:** React + TypeScript

* **Styling:** Tailwind CSS

* **Icons:** Lucide React

* **Data Visualization:** Native HTML/CSS/SVG

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v16 or higher recommended)

* Git

### Installation

Clone the repository and install the dependencies:

```
git clone https://github.com/rafafelps/CoMap-Desktop.git
cd comap-desktop
npm install
```

## 🧪 Testing and Development

To test the application locally with Hot Module Replacement (HMR) enabled:

```
npm start
```

This command will:

1. Start the Vite development server to bundle the React code.

2. Launch the Electron application window.

3. Automatically refresh the UI whenever you save changes to the `.tsx` or `.css` files.

*Note: The Web Serial API (USB-C connection) is fully functional in development mode.*

## 📦 Generating the Executable (.exe)

When you are ready to package the app for distribution, use Electron Forge's `make` command:

```
npm run make
```

**Where to find your executable:**
Once the build process finishes, look inside the newly generated `out/` folder in your project directory:

* **The Installer:** Located in `out/make/squirrel.windows/x64/` (Look for the `Setup.exe` file).

* **The Unpacked App:** Located in `out/comap-desktop-win32-x64/` (You can run the application directly from here without installing it).

*Warning: Never commit the `out/` or `node_modules/` folders to GitHub. Ensure they remain in your `.gitignore`.*

## 🎲 Generating Mock Data

If you don't have the ESP32 penetrometer hardware available, you can generate realistic test data using the included Python script.

The script simulates realistic soil density gradients, sensor noise, dense "hardpan" layers, and sudden rock-strikes that trigger the 50kgf safety limit.

**1. Run the script:**

```
python dataset/generate_mock_data.py
```

**2. Import the data:**
The script will create a `mock_datasets/` directory containing CSV files formatted with standard DD/MM/YYYY timestamps and GPS coordinates. Open the CoMap app, click **Import CSV Files**, and select these files to see the dashboard populate.

## 📁 Project Structure

```
comap-desktop/
├── src/
│   ├── App.tsx           # Main React application & logic
│   ├── main.ts           # Electron Main Process (Node.js backend)
│   ├── preload.ts        # Electron Preload script
│   ├── renderer.tsx      # React DOM entry point
│   ├── index.css         # Tailwind CSS imports & global styles
│   └── vite-env.d.ts     # Vite type declarations
├── dataset/
│   └── generate.py       # Python script for testing
├── tailwind.config.js    # Tailwind configuration
├── forge.config.ts       # Electron Forge packaging configuration
├── vite.config.ts        # Vite bundler configuration
└── package.json          # Project dependencies & scripts
```
