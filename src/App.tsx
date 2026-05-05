import React, { useState, useMemo } from 'react';
import { Upload, Usb, Trash2, Printer, Map as MapIcon, Layers, Info, Filter, Activity, Box } from 'lucide-react';

// Tell TypeScript about the Web Serial API
declare global {
  interface Navigator {
    serial: {
      requestPort(): Promise<any>;
      getPorts(): Promise<any[]>;
    };
  }
}

// Data Structures
interface DataPoint {
  depth: number;
  kgf: number;
  mpa: number;
}

interface Dataset {
  id: number;
  name: string;
  date: string;
  data: DataPoint[];
}

interface HeatmapViewProps {
  datasets: Dataset[];
  maxDepth: number;
}

interface AnalyticsDashboardProps {
  datasets: Dataset[];
  removeDataset: (id: number) => void;
  maxDepth: number;
}

// Global Color Utility for Heatmap & 3D Blocks
const getMpaColor = (mpa: number | null) => {
  if (mpa === null) return undefined;
  const normalized = Math.max(0, Math.min(mpa / 3.0, 1));
  const hue = (1 - normalized) * 120; // 120 = Green, 0 = Red
  return `hsl(${hue}, 90%, 45%)`;
};

// ASABE S313.3 Standard Cone
const DEFAULT_CONE_DIAMETER_MM = 12.83; 

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [coneDiameter, setConeDiameter] = useState<number>(DEFAULT_CONE_DIAMETER_MM);
  const [maxDepthFilter, setMaxDepthFilter] = useState<number>(600); // Default to full 600mm stroke
  const [serialPort, setSerialPort] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'dashboard'>('dashboard');

  const coneArea = useMemo(() => Math.PI * Math.pow(coneDiameter / 2, 2), [coneDiameter]);

  const calculateMPa = (kgf: number): number => {
    const newtons = kgf * 9.80665;
    return newtons / coneArea;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const text = e.target?.result as string;
        if (!text) return;
        
        const rows = text.split('\n');
        
        // Parse Headers
        const headers = rows[0].toLowerCase().split(',').map(h => h.trim());
        const depthIdx = headers.findIndex(h => h.includes('depth'));
        const forceIdx = headers.findIndex(h => h.includes('force') || h.includes('kgf'));
        const timeIdx = headers.findIndex(h => h.includes('timestamp') || h.includes('time'));
        
        if (depthIdx === -1 || forceIdx === -1) {
          alert(`Could not find Depth or Force columns in ${file.name}`);
          return;
        }

        // Extract and format date (Prioritize CSV timestamp, fallback to today DD/MM/YYYY)
        let parsedDate = new Date().toLocaleDateString('en-GB');
        if (timeIdx !== -1 && rows[1]) {
           const rawTimestamp = rows[1].split(',')[timeIdx];
           if (rawTimestamp) {
              const datePart = rawTimestamp.split(' ')[0];
              // Ensure DD/MM/YYYY formatting
              if (datePart.includes('-')) {
                 const parts = datePart.split('-');
                 if (parts.length === 3 && parts[0].length === 4) parsedDate = `${parts[2]}/${parts[1]}/${parts[0]}`; // YYYY-MM-DD to DD/MM/YYYY
                 else parsedDate = datePart;
              } else {
                 parsedDate = datePart;
              }
           }
        }

        const parsedData: DataPoint[] = [];
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
          date: parsedDate,
          data: parsedData
        }]);
      };
      reader.readAsText(file);
    });
    event.target.value = '';
  };

  const removeDataset = (id: number) => {
    setDatasets(datasets.filter(d => d.id !== id));
  };

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
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans print:bg-white print:text-black">
      {/* Sidebar - Hidden during PDF Print */}
      <div className="w-72 bg-slate-950 text-slate-100 p-6 flex flex-col shadow-xl print:hidden overflow-y-auto border-r border-slate-800 fancy-scrollbar">
        <div className="flex items-center gap-3 mb-8">
          <Layers className="text-green-500" size={32} />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">CoMap Pro</h1>
            <p className="text-xs text-slate-400">Desktop Analytics</p>
          </div>
        </div>

        <div className="space-y-8 flex-1">
          {/* Data Ingestion */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Data Import</h2>
            <label className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-md cursor-pointer transition-colors shadow-lg shadow-green-900/20">
              <Upload size={16} />
              <span className="text-sm font-medium">Import CSV Files</span>
              <input type="file" multiple accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          {/* USB-C ESP32 Connection */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Hardware Link</h2>
            <div className="space-y-2">
              <button 
                onClick={connectSerial}
                className={`flex items-center justify-center gap-2 w-full py-2 px-4 rounded-md border transition-colors text-sm font-medium ${isConnected ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-400' : 'border-slate-800 hover:bg-slate-800 text-slate-300'}`}
              >
                <Usb size={16} />
                <span>{isConnected ? 'ESP32 Connected' : 'Connect USB-C'}</span>
              </button>
              
              <button 
                onClick={wipeSD}
                disabled={!isConnected}
                className="flex items-center justify-center gap-2 w-full bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-400 py-2 px-4 rounded-md transition-colors text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={16} />
                <span>Format Device SD</span>
              </button>
            </div>
          </div>

          {/* Settings / Depth Slicer */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Filter size={14}/> Slicing & Settings</h2>
            
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-2">Standard Depth Slicer (mm)</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => setMaxDepthFilter(150)} className={`text-[10px] py-1 rounded border transition-colors ${maxDepthFilter === 150 ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>Topsoil (150)</button>
                <button onClick={() => setMaxDepthFilter(300)} className={`text-[10px] py-1 rounded border transition-colors ${maxDepthFilter === 300 ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>Subsoil (300)</button>
                <button onClick={() => setMaxDepthFilter(600)} className={`text-[10px] py-1 rounded border col-span-2 transition-colors ${maxDepthFilter === 600 ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}>Full Profile (600)</button>
              </div>
              <input 
                type="range" min="50" max="600" step="10" 
                value={maxDepthFilter} 
                onChange={(e) => setMaxDepthFilter(Number(e.target.value))}
                className="w-full accent-green-500"
              />
              <div className="text-right text-xs text-green-400 font-mono mt-1">{maxDepthFilter} mm</div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Cone Base Diameter (mm)</label>
              <input 
                type="number" step="0.01" 
                value={coneDiameter} 
                onChange={(e) => setConeDiameter(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-sm text-slate-100 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 transition-all"
              />
              <p className="text-[10px] text-slate-500 mt-1">ASABE S313.3 Std: 12.83mm</p>
            </div>
          </div>
        </div>

        {/* Report Export */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <button 
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-4 rounded-md transition-colors text-sm font-medium"
          >
            <Printer size={16} />
            <span>Export PDF Report</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 print:bg-white">
        {/* Header */}
        <header className="bg-slate-950/50 border-b border-slate-800 p-4 flex justify-between items-center print:hidden">
          <div className="flex gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
             <button 
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'dashboard' ? 'bg-slate-800 text-green-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <Activity size={16} />
              Analytics Dashboard
            </button>
            <button 
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'heatmap' ? 'bg-slate-800 text-green-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('heatmap')}
            >
              <MapIcon size={16} />
              2D Heatmap
            </button>
          </div>
          <div className="text-sm text-slate-400 flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
            <Info size={14} className="text-blue-400" />
            <span>{datasets.length} datasets active</span>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8 print:p-0 fancy-scrollbar">
          {datasets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <Box size={64} className="mb-4 opacity-20 text-green-500" />
              <h2 className="text-xl font-semibold mb-2 text-slate-300">Workspace Empty</h2>
              <p className="max-w-md text-center text-sm leading-relaxed">Import CSV files from the SD card or connect the hardware via USB-C to generate 2D/3D soil compaction models.</p>
            </div>
          ) : (
             <div className="max-w-[1600px] mx-auto">
              
              {/* PDF Header */}
              <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4 text-black">
                <h1 className="text-3xl font-bold">Soil Compaction Analytics</h1>
                <div className="flex justify-between mt-2 text-sm">
                  <p>Generated: {new Date().toLocaleDateString('en-GB')}</p>
                  <p>Cone: {coneDiameter}mm | Depth Slice: {maxDepthFilter}mm</p>
                </div>
              </div>

              {activeTab === 'dashboard' && (
                <AnalyticsDashboard 
                  datasets={datasets} 
                  removeDataset={removeDataset} 
                  maxDepth={maxDepthFilter}
                />
              )}

              {activeTab === 'heatmap' && (
                <HeatmapView 
                  datasets={datasets} 
                  maxDepth={maxDepthFilter} 
                />
              )}
            </div>
          )}
        </main>
      </div>
      
      {/* Global & Print Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Stylized Scrollbars */
        .fancy-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .fancy-scrollbar::-webkit-scrollbar-track { background: #0f172a; border-radius: 4px; }
        .fancy-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; border: 2px solid #0f172a; }
        .fancy-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }

        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
          @page { size: landscape; margin: 10mm; }
          .fancy-scrollbar::-webkit-scrollbar { display: none; }
        }
      `}} />
    </div>
  );
}

// -------------------------------------------------------------
// Advanced Analytics Dashboard (Stats + 2D Graph + 3D Block)
// -------------------------------------------------------------
function AnalyticsDashboard({ datasets, removeDataset, maxDepth }: AnalyticsDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {datasets.map(dataset => (
          <DatasetAnalyticsCard 
            key={dataset.id} 
            dataset={dataset} 
            maxDepth={maxDepth} 
            removeDataset={removeDataset} 
          />
        ))}
      </div>
    </div>
  );
}

function DatasetAnalyticsCard({ dataset, maxDepth, removeDataset }: { dataset: Dataset, maxDepth: number, removeDataset: (id: number) => void }) {
  // Compute Stats within depth slice
  const filteredData = dataset.data.filter(d => d.depth <= maxDepth);
  let maxKgf = 0; let maxMpa = 0; let reachedDepth = 0;
  
  filteredData.forEach(p => {
    if (p.kgf > maxKgf) maxKgf = p.kgf;
    if (p.mpa > maxMpa) maxMpa = p.mpa;
    if (p.depth > reachedDepth) reachedDepth = p.depth;
  });

  return (
    <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm flex flex-col print:bg-white print:border-gray-300 print:break-inside-avoid">
      {/* Header */}
      <div className="flex justify-between items-start mb-4 border-b border-slate-700 pb-4 print:border-gray-200">
        <div>
          <h3 className="font-bold text-slate-100 print:text-black flex items-center gap-2">
            <MapIcon size={16} className="text-blue-400 print:text-blue-600"/> 
            {dataset.name}
          </h3>
          <p className="text-xs text-slate-400 print:text-gray-500 mt-1">{dataset.date} • {filteredData.length} pts</p>
        </div>
        <button 
          onClick={() => removeDataset(dataset.id)}
          className="text-slate-500 hover:text-red-400 transition-colors print:hidden bg-slate-900/50 hover:bg-slate-900 p-2 rounded-md"
          title="Remove dataset"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      {/* Top Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 print:bg-gray-50 print:border-gray-200">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold print:text-gray-500">Peak Force</p>
          <p className="font-bold text-lg text-slate-100 print:text-black">{maxKgf.toFixed(1)} <span className="text-xs font-normal text-slate-500">kgf</span></p>
          <div className={`mt-2 h-1 w-full rounded-full ${maxKgf >= 50 ? 'bg-red-500' : 'bg-green-500'}`}></div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 print:bg-gray-50 print:border-gray-200">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold print:text-gray-500">Peak Pressure</p>
          <p className="font-bold text-lg text-slate-100 print:text-black">{maxMpa.toFixed(2)} <span className="text-xs font-normal text-slate-500">MPa</span></p>
        </div>
        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 print:bg-gray-50 print:border-gray-200">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold print:text-gray-500">Depth Analysed</p>
          <p className="font-bold text-lg text-slate-100 print:text-black">{reachedDepth.toFixed(0)} <span className="text-xs font-normal text-slate-500">mm</span></p>
        </div>
      </div>

      {/* Visuals: Graph + 3D Model */}
      <div className="flex gap-6 items-stretch h-56 mt-auto">
         {/* 2D Depth Profile Graph */}
         <div className="flex-1 flex flex-col relative">
            <h4 className="text-[10px] text-slate-500 font-semibold mb-2 uppercase tracking-wide">Pressure Profile (Depth vs MPa)</h4>
            <DepthLineGraph data={filteredData} maxDepth={maxDepth} maxMpa={Math.max(3.0, maxMpa)} />
         </div>
         
         {/* 3D Isometric Block Model */}
         <div className="w-1/3 flex flex-col items-center justify-center border-l border-slate-700 print:border-gray-200 relative overflow-hidden bg-slate-950/30 rounded-r-lg print:bg-transparent">
            <h4 className="absolute top-0 left-4 text-[10px] text-slate-500 font-semibold mt-0 uppercase tracking-wide">3D Block Model</h4>
            <BlockModel3D data={filteredData} maxDepth={maxDepth} />
         </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Pure SVG Line Graph Component
// -------------------------------------------------------------
function DepthLineGraph({ data, maxDepth, maxMpa }: { data: DataPoint[], maxDepth: number, maxMpa: number }) {
  if (data.length === 0) return <div className="text-xs text-slate-500">No data</div>;
  
  // Coordinates mapping: X = MPa (0 to maxMpa), Y = Depth (0 to maxDepth, rendered top-down)
  const pointsStr = data.map(p => {
    const x = (p.mpa / maxMpa) * 100;
    const y = (p.depth / maxDepth) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="relative w-full flex-1 border-l border-t border-slate-600 print:border-gray-400">
      {/* Grid Lines */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
         <div className="border-b border-slate-500 w-full h-0"></div>
         <div className="border-b border-slate-500 w-full h-0"></div>
         <div className="border-b border-slate-500 w-full h-0"></div>
      </div>
      
      {/* The Line */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
        <polyline 
          points={pointsStr} 
          fill="none" 
          stroke="#22c55e" 
          strokeWidth="2" 
          vectorEffect="non-scaling-stroke"
          className="drop-shadow-[0_0_3px_rgba(34,197,94,0.5)] print:drop-shadow-none"
        />
      </svg>
      
      {/* Axis Labels */}
      <div className="absolute -bottom-5 left-0 text-[9px] text-slate-400">0 MPa</div>
      <div className="absolute -bottom-5 right-0 text-[9px] text-slate-400">{maxMpa.toFixed(1)} MPa</div>
      <div className="absolute top-0 -left-6 text-[9px] text-slate-400">0mm</div>
      <div className="absolute bottom-0 -left-10 text-[9px] text-slate-400">{maxDepth}mm</div>
    </div>
  );
}

// -------------------------------------------------------------
// Pure CSS Isometric 3D Model Component
// -------------------------------------------------------------
function BlockModel3D({ data, maxDepth }: { data: DataPoint[], maxDepth: number }) {
  // Chunk data into visual blocks (e.g. 50mm layers)
  const layerSize = 50;
  const numLayers = Math.max(1, Math.ceil(maxDepth / layerSize));
  const layers = Array(numLayers).fill(0);
  const counts = Array(numLayers).fill(0);

  data.forEach(p => {
    const idx = Math.floor(p.depth / layerSize);
    if (idx >= 0 && idx < numLayers) {
      layers[idx] += p.mpa;
      counts[idx] += 1;
    }
  });

  const avgLayers = layers.map((sum, i) => counts[i] > 0 ? sum / counts[i] : null);

  return (
    <div className="flex items-center justify-center w-full h-full" style={{ perspective: '800px' }}>
      <div 
        className="relative w-16 h-16 transition-transform duration-500 hover:rotate-z-12"
        style={{ transform: 'rotateX(60deg) rotateZ(-45deg)', transformStyle: 'preserve-3d' }}
      >
        {avgLayers.map((mpa, i) => mpa !== null && (
          <div 
            key={i} 
            title={`${i*layerSize}-${(i+1)*layerSize}mm | ${mpa.toFixed(2)} MPa`}
            className="absolute inset-0 border border-white/20 print:border-black/20 transition-all hover:scale-110 cursor-pointer"
            style={{
              backgroundColor: getMpaColor(mpa),
              transform: `translateZ(${-i * 8}px)`, // Z-spacing for layers
              boxShadow: i === avgLayers.length - 1 ? '0 10px 20px rgba(0,0,0,0.5)' : 'none',
              opacity: 0.85
            }} 
          />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Heatmap Visualization Component
// -------------------------------------------------------------
function HeatmapView({ datasets, maxDepth }: HeatmapViewProps) {
  const bucketSize = 10; // 10mm depth increments
  const numBuckets = Math.ceil(maxDepth / bucketSize);
  
  const grid = datasets.map(dataset => {
    const buckets: (number | null)[] = Array(numBuckets).fill(null);
    dataset.data.forEach(point => {
      if (point.depth <= maxDepth) {
        const bucketIdx = Math.floor(point.depth / bucketSize);
        if (bucketIdx >= 0 && bucketIdx < numBuckets) {
          if (buckets[bucketIdx] === null || point.mpa > (buckets[bucketIdx] as number)) {
            buckets[bucketIdx] = point.mpa;
          }
        }
      }
    });
    return { name: dataset.name, buckets };
  });

  return (
    <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 print:bg-white print:shadow-none print:border-none print:p-0">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100 print:text-black">2D Compaction Chronology Profile</h2>
          <p className="text-sm text-slate-400 print:text-gray-600">Aligns datasets side-by-side to track compaction evolution over time. Limit: {maxDepth}mm</p>
        </div>
        
        {/* Color Legend */}
        <div className="flex items-center gap-3 text-xs font-medium text-slate-300 bg-slate-900/50 px-3 py-2 rounded-md border border-slate-700 print:bg-gray-100 print:border-gray-300 print:text-black">
          <span>0 MPa</span>
          <div className="w-32 h-3 rounded bg-gradient-to-r from-[hsl(120,90%,45%)] via-[hsl(60,90%,45%)] to-[hsl(0,90%,45%)]"></div>
          <span>3.0+ MPa</span>
        </div>
      </div>

      {/* Heatmap Grid Render */}
      <div className="relative w-full overflow-x-auto pb-4 fancy-scrollbar">
        <div className="min-w-max flex">
          {/* Y-Axis Labels (Depth) */}
          <div className="flex flex-col pr-4 pt-8 shrink-0 border-r border-slate-700 text-right text-xs text-slate-400 justify-between print:border-gray-300 print:text-black" style={{ height: '600px' }}>
            <span>0mm</span>
            <span>{Math.round(maxDepth / 4)}mm</span>
            <span>{Math.round(maxDepth / 2)}mm</span>
            <span>{Math.round((maxDepth / 4) * 3)}mm</span>
            <span>{maxDepth}mm</span>
          </div>

          {/* Grid Area */}
          <div className="flex gap-1 pl-4" style={{ height: '600px' }}>
            {grid.map((col, colIdx) => (
              <div key={colIdx} className="flex flex-col items-center group w-24 shrink-0">
                {/* Column Header */}
                <div className="h-8 flex items-center justify-center text-xs font-semibold text-slate-300 truncate w-full mb-1 print:text-black" title={col.name}>
                  {col.name.substring(0, 12)}
                </div>
                
                {/* Cells */}
                <div className="flex-1 w-full flex flex-col gap-[1px] bg-slate-950 rounded overflow-hidden print:bg-gray-200 border border-slate-800 print:border-none">
                  {col.buckets.map((mpa, rowIdx) => (
                    <div 
                      key={rowIdx} 
                      className={`flex-1 w-full transition-opacity hover:opacity-80 relative ${mpa === null ? 'bg-slate-800 print:bg-slate-100' : ''}`}
                      style={mpa !== null ? { backgroundColor: getMpaColor(mpa) } : undefined}
                      title={`Depth: ${rowIdx * bucketSize}-${(rowIdx+1) * bucketSize}mm\nPressure: ${mpa !== null ? mpa.toFixed(2) : 'N/A'} MPa`}
                    />
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