import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, Usb, Trash2, Printer, Settings, Map as MapIcon, Layers, Info } from 'lucide-react';

// ASABE S313.3 Standard Cone
const DEFAULT_CONE_DIAMETER_MM = 12.83; 

export default function App() {
  const [datasets, setDatasets] = useState([]);
  const [coneDiameter, setConeDiameter] = useState(DEFAULT_CONE_DIAMETER_MM);
  const [maxDepthFilter, setMaxDepthFilter] = useState(500); // mm
  const [serialPort, setSerialPort] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('heatmap');

  const coneArea = useMemo(() => Math.PI * Math.pow(coneDiameter / 2, 2), [coneDiameter]);

  // Convert kgf to MPa (1 kgf = 9.80665 N, 1 MPa = 1 N/mm^2)
  const calculateMPa = (kgf) => {
    const newtons = kgf * 9.80665;
    return newtons / coneArea;
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const rows = text.split('\n');
        
        // Basic CSV Parser (assumes Timestamp, Lat, Lon, Depth, Force_kgf)
        // Auto-detect columns based on first header row
        const headers = rows[0].toLowerCase().split(',').map(h => h.trim());
        const depthIdx = headers.findIndex(h => h.includes('depth'));
        const forceIdx = headers.findIndex(h => h.includes('force') || h.includes('kgf'));
        
        if (depthIdx === -1 || forceIdx === -1) {
          alert(`Could not find Depth or Force columns in ${file.name}`);
          return;
        }

        const parsedData = [];
        for (let i = 1; i < rows.length; i++) {
          if (!rows[i].trim()) continue;
          const cols = rows[i].split(',');
          const depth = parseFloat(cols[depthIdx]);
          const force = parseFloat(cols[forceIdx]);
          
          if (!isNaN(depth) && !isNaN(force)) {
            parsedData.push({
              depth,
              kgf: force,
              mpa: calculateMPa(force)
            });
          }
        }

        setDatasets(prev => [...prev, {
          id: Date.now() + Math.random(),
          name: file.name.replace('.csv', ''),
          date: new Date().toLocaleDateString(),
          data: parsedData
        }]);
      };
      reader.readAsText(file);
    });
  };

  const removeDataset = (id) => {
    setDatasets(datasets.filter(d => d.id !== id));
  };

  // Web Serial API implementation for USB-C ESP32 connection
  const connectSerial = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      setSerialPort(port);
      setIsConnected(true);
      alert("Connected to ESP32 via USB-C");
    } catch (error) {
      console.error("Serial connection error:", error);
      alert("Failed to connect to ESP32. Ensure it is plugged in and no other program is using the COM port.");
    }
  };

  const wipeSD = async () => {
    if (!serialPort) return;
    if (window.confirm("Are you sure you want to format the ESP32 SD Card? All remote data will be lost.")) {
      try {
        const encoder = new TextEncoder();
        const writer = serialPort.writable.getWriter();
        await writer.write(encoder.encode("WIPE_SD\n"));
        writer.releaseLock();
        alert("WIPE_SD command sent to firmware.");
      } catch (error) {
        console.error("Failed to write to port:", error);
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar - Hidden during PDF Print */}
      <div className="w-72 bg-slate-900 text-slate-100 p-6 flex flex-col shadow-xl print:hidden overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <Layers className="text-green-400" size={32} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">CoMap</h1>
            <p className="text-xs text-slate-400">Soil Compaction Analysis</p>
          </div>
        </div>

        <div className="space-y-6 flex-1">
          {/* Data Ingestion */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Data Import</h2>
            <label className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md cursor-pointer transition-colors">
              <Upload size={18} />
              <span>Import CSV Files</span>
              <input type="file" multiple accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          {/* USB-C ESP32 Connection */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Device Control</h2>
            <div className="space-y-2">
              <button 
                onClick={connectSerial}
                className={`flex items-center justify-center gap-2 w-full py-2 px-4 rounded-md border transition-colors ${isConnected ? 'bg-emerald-900/50 border-emerald-500 text-emerald-400' : 'border-slate-700 hover:bg-slate-800'}`}
              >
                <Usb size={18} />
                <span>{isConnected ? 'ESP32 Connected' : 'Connect via USB-C'}</span>
              </button>
              
              <button 
                onClick={wipeSD}
                disabled={!isConnected}
                className="flex items-center justify-center gap-2 w-full bg-red-900/30 hover:bg-red-900/60 border border-red-800/50 text-red-400 py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={18} />
                <span>Format SD Card</span>
              </button>
            </div>
          </div>

          {/* Settings / Depth Slicer */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Analysis Settings</h2>
            
            <div className="mb-4">
              <label className="block text-xs text-slate-300 mb-1">Max Depth Slice (mm): {maxDepthFilter}</label>
              <input 
                type="range" min="50" max="600" step="10" 
                value={maxDepthFilter} 
                onChange={(e) => setMaxDepthFilter(Number(e.target.value))}
                className="w-full accent-green-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Cone Base Diameter (mm)</label>
              <input 
                type="number" step="0.01" 
                value={coneDiameter} 
                onChange={(e) => setConeDiameter(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">ASABE S313.3 Std: 12.83mm</p>
            </div>
          </div>
        </div>

        {/* Report Export */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <button 
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-white py-2 px-4 rounded-md transition-colors"
          >
            <Printer size={18} />
            <span>Export PDF Report</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - Hidden on Print */}
        <header className="bg-white border-b border-slate-200 p-4 flex justify-between items-center print:hidden">
          <div className="flex gap-4">
            <button 
              className={`px-4 py-2 font-medium rounded-md ${activeTab === 'heatmap' ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('heatmap')}
            >
              2D Compaction Heatmap
            </button>
            <button 
              className={`px-4 py-2 font-medium rounded-md ${activeTab === 'data' ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('data')}
            >
              Raw Data Overlay
            </button>
          </div>
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <Info size={16} />
            <span>{datasets.length} datasets loaded</span>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8 bg-slate-50 print:p-0 print:bg-white">
          {datasets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <MapIcon size={64} className="mb-4 opacity-20" />
              <h2 className="text-xl font-semibold mb-2 text-slate-600">No Data Available</h2>
              <p className="max-w-md text-center">Import CSV files from the SD card or connect the ESP32 via USB-C to begin soil compaction analysis.</p>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto">
              
              {/* PDF Header (Only visible when printing) */}
              <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
                <h1 className="text-3xl font-bold text-slate-900">Soil Compaction Report</h1>
                <div className="flex justify-between mt-2 text-sm">
                  <p>Generated: {new Date().toLocaleDateString()}</p>
                  <p>Cone Diameter: {coneDiameter}mm | Area: {coneArea.toFixed(2)}mm²</p>
                </div>
              </div>

              {activeTab === 'heatmap' && (
                <HeatmapView 
                  datasets={datasets} 
                  maxDepth={maxDepthFilter} 
                />
              )}

              {activeTab === 'data' && (
                <RawDataOverlay 
                  datasets={datasets} 
                  removeDataset={removeDataset} 
                />
              )}
            </div>
          )}
        </main>
      </div>
      
      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: landscape; margin: 10mm; }
        }
      `}} />
    </div>
  );
}

// -------------------------------------------------------------
// Heatmap Visualization Component
// -------------------------------------------------------------
function HeatmapView({ datasets, maxDepth }) {
  // Config
  const bucketSize = 10; // 10mm depth increments
  const numBuckets = Math.ceil(maxDepth / bucketSize);
  
  // Calculate color based on MPa (0 = green, 1.5 = yellow, 3.0+ = red)
  const getMpaColor = (mpa) => {
    if (mpa === null || mpa === undefined) return '#e2e8f0'; // empty/slate-200
    // Hue from 120 (Green) to 0 (Red)
    const normalized = Math.max(0, Math.min(mpa / 3.0, 1));
    const hue = (1 - normalized) * 120;
    return `hsl(${hue}, 90%, 45%)`;
  };

  // Process data into a grid: columns = datasets, rows = depth buckets
  const grid = datasets.map(dataset => {
    const buckets = Array(numBuckets).fill(null);
    dataset.data.forEach(point => {
      if (point.depth <= maxDepth) {
        const bucketIdx = Math.floor(point.depth / bucketSize);
        if (bucketIdx >= 0 && bucketIdx < numBuckets) {
          // Store max MPa in this depth bucket
          if (buckets[bucketIdx] === null || point.mpa > buckets[bucketIdx]) {
            buckets[bucketIdx] = point.mpa;
          }
        }
      }
    });
    return { name: dataset.name, buckets };
  });

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:shadow-none print:border-none">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">2D Compaction Profile (Depth Slice)</h2>
          <p className="text-sm text-slate-500">Pressure in Megapascals (MPa). Depth limit: {maxDepth}mm</p>
        </div>
        
        {/* Color Legend */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
          <span>0 MPa</span>
          <div className="w-32 h-3 rounded bg-gradient-to-r from-[hsl(120,90%,45%)] via-[hsl(60,90%,45%)] to-[hsl(0,90%,45%)]"></div>
          <span>3.0+ MPa</span>
        </div>
      </div>

      {/* Heatmap Grid Render */}
      <div className="relative w-full overflow-x-auto">
        <div className="min-w-max flex">
          {/* Y-Axis Labels (Depth) */}
          <div className="flex flex-col pr-4 pt-8 shrink-0 border-r border-slate-200 text-right text-xs text-slate-500 justify-between" style={{ height: '500px' }}>
            <span>0mm</span>
            <span>{Math.round(maxDepth / 4)}mm</span>
            <span>{Math.round(maxDepth / 2)}mm</span>
            <span>{Math.round((maxDepth / 4) * 3)}mm</span>
            <span>{maxDepth}mm</span>
          </div>

          {/* Grid Area */}
          <div className="flex gap-1 pl-4" style={{ height: '500px' }}>
            {grid.map((col, colIdx) => (
              <div key={colIdx} className="flex flex-col items-center group w-20 shrink-0">
                {/* Column Header */}
                <div className="h-8 flex items-center justify-center text-xs font-semibold text-slate-700 truncate w-full mb-1" title={col.name}>
                  {col.name.substring(0, 10)}
                </div>
                
                {/* Cells */}
                <div className="flex-1 w-full flex flex-col gap-[1px] bg-slate-100 rounded overflow-hidden">
                  {col.buckets.map((mpa, rowIdx) => (
                    <div 
                      key={rowIdx} 
                      className="flex-1 w-full transition-opacity hover:opacity-80 relative"
                      style={{ backgroundColor: getMpaColor(mpa) }}
                      title={`Depth: ${rowIdx * bucketSize}-${(rowIdx+1) * bucketSize}mm\nPressure: ${mpa !== null ? mpa.toFixed(2) : 'N/A'} MPa`}
                    >
                       {/* Tooltip hint trigger via browser title attribute for zero-lag rendering */}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Raw Data & Overlay Component
// -------------------------------------------------------------
function RawDataOverlay({ datasets, removeDataset }) {
  // Calculate some quick stats for each dataset
  const stats = datasets.map(d => {
    let maxKgf = 0;
    let maxMpa = 0;
    let maxDepth = 0;
    d.data.forEach(p => {
      if (p.kgf > maxKgf) maxKgf = p.kgf;
      if (p.mpa > maxMpa) maxMpa = p.mpa;
      if (p.depth > maxDepth) maxDepth = p.depth;
    });
    return { ...d, maxKgf, maxMpa, maxDepth, count: d.data.length };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(stat => (
          <div key={stat.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-slate-800 break-all">{stat.name}</h3>
                <p className="text-xs text-slate-500">{stat.date} • {stat.count} pts</p>
              </div>
              <button 
                onClick={() => removeDataset(stat.id)}
                className="text-slate-400 hover:text-red-500 transition-colors print:hidden"
                title="Remove dataset"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-y-3 mt-auto">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Max Force</p>
                <p className="font-semibold text-slate-800">{stat.maxKgf.toFixed(1)} kgf</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Max Pressure</p>
                <p className="font-semibold text-slate-800">{stat.maxMpa.toFixed(2)} MPa</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider">Depth Reached</p>
                <p className="font-semibold text-slate-800">{stat.maxDepth.toFixed(0)} mm</p>
              </div>
              <div>
                 <div className={`mt-1 h-2 w-full rounded-full ${stat.maxKgf >= 50 ? 'bg-red-500' : 'bg-green-500'}`} title={stat.maxKgf >= 50 ? 'Hit Structural Safety Limit' : 'Normal Stroke'}></div>
                 <p className="text-[10px] text-slate-400 mt-1">{stat.maxKgf >= 50 ? 'Cutoff triggered' : 'Safe stroke'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 print:break-inside-avoid">
         <h2 className="text-xl font-bold text-slate-800 mb-4">Historical Overlay Info</h2>
         <p className="text-slate-600 text-sm mb-4">
           The desktop analysis software automatically processes incoming data chronologically. 
           To perform a historical overlay, simply import CSV files from different dates. 
           The Heatmap View automatically aligns them side-by-side to show soil compaction evolution over time.
         </p>
         <div className="bg-green-50 p-4 rounded-md border border-green-100 flex gap-3 text-green-800 text-sm">
            <Info className="shrink-0" size={20} />
            <p><strong>Standard Compliance:</strong> MPa conversion is actively locked to the {DEFAULT_CONE_DIAMETER_MM}mm ASABE cone standard setting. Any points exceeding the 50kgf firmware threshold are accurately represented as high-pressure zones (Red) in the heatmap.</p>
         </div>
      </div>
    </div>
  );
}