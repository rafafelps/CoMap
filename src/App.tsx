import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Usb, Trash2, Printer, Layers, Info, Filter, Map as MapIcon, Target, Gauge, ArrowDown, MapPin, CalendarClock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  timestamp: number; // For chronological sorting
  lat: number | null;
  lon: number | null;
  data: DataPoint[];
}

interface LocationGroup {
  id: string;
  lat: number | null;
  lon: number | null;
  datasets: Dataset[];
}

// ASABE S313.3 Standard Cone
const DEFAULT_CONE_DIAMETER_MM = 12.83; 
const CONE_AREA_MM2 = Math.PI * Math.pow(DEFAULT_CONE_DIAMETER_MM / 2, 2);

// Haversine Formula to calculate distance between two GPS coordinates in meters
const calculateDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Graph Colors for Historical Overlay
const CHART_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [maxDepthFilter, setMaxDepthFilter] = useState<number>(600);
  const [serialPort, setSerialPort] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Group Datasets by Location (NEO-6M Precision grouping < 15 meters)
  const locationGroups = useMemo(() => {
    const groups: LocationGroup[] = [];
    const unknownGroup: LocationGroup = { id: 'unknown', lat: null, lon: null, datasets: [] };

    datasets.forEach(ds => {
      if (ds.lat === null || ds.lon === null) {
        unknownGroup.datasets.push(ds);
        return;
      }

      let matchedGroup = groups.find(g => 
        g.lat !== null && g.lon !== null && 
        calculateDistanceMeters(g.lat, g.lon, ds.lat!, ds.lon!) < 15 // 15m radius
      );

      if (matchedGroup) {
        matchedGroup.datasets.push(ds);
        // Sort chronologically
        matchedGroup.datasets.sort((a, b) => a.timestamp - b.timestamp);
      } else {
        groups.push({
          id: `loc_${ds.id}`,
          lat: ds.lat,
          lon: ds.lon,
          datasets: [ds]
        });
      }
    });

    if (unknownGroup.datasets.length > 0) {
       unknownGroup.datasets.sort((a, b) => a.timestamp - b.timestamp);
       groups.push(unknownGroup);
    }
    
    return groups;
  }, [datasets]);

  // Auto-select first group if none is active
  useEffect(() => {
    if (!activeGroupId && locationGroups.length > 0) {
      setActiveGroupId(locationGroups[0].id);
    } else if (activeGroupId && !locationGroups.find(g => g.id === activeGroupId)) {
      setActiveGroupId(locationGroups.length > 0 ? locationGroups[0].id : null);
    }
  }, [locationGroups, activeGroupId]);

  const calculateMPa = (kgf: number): number => {
    return (kgf * 9.80665) / CONE_AREA_MM2;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const text = e.target?.result as string;
        if (!text) return;
        
        const rows = text.split('\n');
        const headers = rows[0].toLowerCase().split(',').map(h => h.trim());
        const depthIdx = headers.findIndex(h => h.includes('depth'));
        const forceIdx = headers.findIndex(h => h.includes('force') || h.includes('kgf'));
        const timeIdx = headers.findIndex(h => h.includes('timestamp') || h.includes('time'));
        const latIdx = headers.findIndex(h => h.includes('latitude') || h.includes('lat'));
        const lonIdx = headers.findIndex(h => h.includes('longitude') || h.includes('lon'));
        
        if (depthIdx === -1 || forceIdx === -1) return;

        let lat: number | null = null;
        let lon: number | null = null;
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i].trim()) continue;
            const cols = rows[i].split(',');
            if (latIdx !== -1 && lonIdx !== -1 && cols[latIdx] && cols[lonIdx]) {
                lat = parseFloat(cols[latIdx]);
                lon = parseFloat(cols[lonIdx]);
                if (!isNaN(lat) && !isNaN(lon)) break; 
            }
        }

        let parsedDate = new Date().toLocaleDateString('en-GB');
        let timestamp = Date.now();
        if (timeIdx !== -1 && rows[1]) {
           const rawTimestamp = rows[1].split(',')[timeIdx];
           if (rawTimestamp) {
              const dateObj = new Date(rawTimestamp);
              if (!isNaN(dateObj.getTime())) {
                  timestamp = dateObj.getTime();
              }
              const datePart = rawTimestamp.split(' ')[0];
              if (datePart.includes('-')) {
                 const parts = datePart.split('-');
                 if (parts.length === 3 && parts[0].length === 4) parsedDate = `${parts[2]}/${parts[1]}/${parts[0]}`; 
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
            parsedData.push({ depth, kgf: force, mpa: calculateMPa(force) });
          }
        }

        setDatasets(prev => [...prev, {
          id: Date.now() + Math.random(),
          name: file.name.replace('.csv', ''),
          date: parsedDate,
          timestamp,
          lat, lon, data: parsedData
        }]);
      };
      reader.readAsText(file);
    });
    event.target.value = '';
  };

  const removeDataset = (id: number) => {
    setDatasets(datasets.filter(d => d.id !== id));
  };

  const wipeSD = async () => {
    if (!serialPort) return;
    if (window.confirm("Format ESP32 SD Card? All remote data will be lost.")) {
      try {
        const encoder = new TextEncoder();
        const writer = serialPort.writable.getWriter();
        await writer.write(encoder.encode("WIPE_SD\n"));
        writer.releaseLock();
      } catch (error) {
        console.error(error);
      }
    }
  };

  const activeGroup = locationGroups.find(g => g.id === activeGroupId);

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans print:bg-white print:text-black">
      {/* Sidebar */}
      <div className="w-72 bg-slate-950 p-6 flex flex-col shadow-xl print:hidden border-r border-slate-800">
        <div className="flex items-center gap-3 mb-8">
          <Layers className="text-green-500" size={32} />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">CoMap Pro</h1>
            <p className="text-[10px] text-slate-400">Geo-Spatial Analysis</p>
          </div>
        </div>

        <div className="space-y-8 flex-1">
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Data Import</h2>
            <label className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-md cursor-pointer transition-colors shadow-lg">
              <Upload size={16} />
              <span className="text-sm font-medium">Import CSV Files</span>
              <input type="file" multiple accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Filter size={14}/> Slicing & Settings</h2>
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-2">Standard Depth Slicer (mm)</label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => setMaxDepthFilter(150)} className={`text-[10px] py-1 rounded border transition-colors ${maxDepthFilter === 150 ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>Topsoil (150)</button>
                <button onClick={() => setMaxDepthFilter(300)} className={`text-[10px] py-1 rounded border transition-colors ${maxDepthFilter === 300 ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>Subsoil (300)</button>
                <button onClick={() => setMaxDepthFilter(600)} className={`text-[10px] py-1 rounded border col-span-2 transition-colors ${maxDepthFilter === 600 ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>Full Profile (600)</button>
              </div>
              <input 
                type="range" min="50" max="600" step="10" 
                value={maxDepthFilter} 
                onChange={(e) => setMaxDepthFilter(Number(e.target.value))}
                className="w-full accent-green-500"
              />
              <div className="text-right text-xs text-green-400 font-mono mt-1">{maxDepthFilter} mm</div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800">
          <button onClick={() => window.print()} className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 py-2 px-4 rounded-md transition-colors text-sm font-medium">
            <Printer size={16} /> Export PDF Report
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 print:bg-white">
        {datasets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <MapPin size={64} className="mb-4 opacity-20 text-green-500" />
            <h2 className="text-xl font-semibold mb-2 text-slate-300">Awaiting GPS Data</h2>
            <p className="max-w-md text-center text-sm leading-relaxed">Import CSV files. The app will automatically group files taken within 15 meters of each other to track compaction over time.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-auto print:overflow-visible">
             
            {/* Interactive Map Section (using native OpenStreetMap embed) */}
            <div className="h-64 border-b border-slate-800 relative shrink-0 print:hidden z-0 overflow-hidden bg-slate-950">
               {activeGroup && activeGroup.lat !== null && activeGroup.lon !== null ? (
                 <iframe
                   width="100%"
                   height="100%"
                   frameBorder="0"
                   scrolling="no"
                   marginHeight={0}
                   marginWidth={0}
                   src={`https://www.openstreetmap.org/export/embed.html?bbox=${activeGroup.lon - 0.005}%2C${activeGroup.lat - 0.005}%2C${activeGroup.lon + 0.005}%2C${activeGroup.lat + 0.005}&layer=mapnik&marker=${activeGroup.lat}%2C${activeGroup.lon}`}
                   className="opacity-90 saturate-[0.8] contrast-125"
                 ></iframe>
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-950/50">
                   <MapIcon size={32} className="mb-2 opacity-50" />
                   <span>Map View Unavailable (No GPS Data)</span>
                 </div>
               )}

               {/* Custom Location Selector Overlay */}
               <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 max-h-[80%] overflow-y-auto pr-2 fancy-scrollbar">
                  {locationGroups.map(group => group.lat !== null && (
                    <button
                       key={group.id}
                       onClick={() => setActiveGroupId(group.id)}
                       className={`px-3 py-2 rounded shadow-lg flex flex-col items-start text-xs border text-left transition-colors ${activeGroupId === group.id ? 'bg-green-600/90 border-green-500 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                    >
                       <span className="font-bold">Field Group ({group.datasets.length})</span>
                       <span className="font-mono opacity-80 text-[10px] mt-0.5">{group.lat.toFixed(4)}, {group.lon?.toFixed(4)}</span>
                    </button>
                  ))}
               </div>

                {/* Overlay indicating free maps */}
                <div className="absolute bottom-2 left-2 z-[400] bg-slate-900/80 backdrop-blur border border-slate-700 px-2 py-1 rounded text-[10px] text-slate-400 flex items-center gap-1 pointer-events-none">
                   <Info size={10}/> Free OSM Integration
                </div>
            </div>

            {/* Dashboard specific to the selected Location Group */}
            <div className="p-8 flex-1 fancy-scrollbar">
               {activeGroup && (
                  <div className="max-w-[1600px] mx-auto space-y-8">
                     {/* Header */}
                     <div className="flex justify-between items-end border-b border-slate-800 pb-4 print:border-black">
                        <div>
                           <h2 className="text-2xl font-bold text-slate-100 print:text-black flex items-center gap-2">
                              {activeGroup.id === 'unknown' ? <Info className="text-yellow-500" /> : <MapPin className="text-green-500" />}
                              {activeGroup.id === 'unknown' ? 'Unmapped Datasets (No GPS)' : 'Location Analysis Group'}
                           </h2>
                           <p className="text-sm text-slate-400 mt-1">
                              {activeGroup.lat !== null ? `${Math.abs(activeGroup.lat).toFixed(5)}° ${activeGroup.lat >= 0 ? 'N' : 'S'}, ${Math.abs(activeGroup.lon!).toFixed(5)}° ${activeGroup.lon! >= 0 ? 'E' : 'W'}` : 'Coordinates missing from CSV headers'}
                           </p>
                        </div>
                        <div className="text-right">
                           <p className="text-slate-300 font-medium">{activeGroup.datasets.length} Historical Datasets</p>
                           <p className="text-xs text-slate-500">Auto-grouped by NEO-6M precision (&lt;15m)</p>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Interactive Recharts Graph */}
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 print:bg-white print:border-gray-300 print:break-inside-avoid">
                           <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 print:text-gray-600 flex items-center gap-2">
                              <Gauge size={16} /> Pressure Profile Evolution
                           </h3>
                           <div className="h-80 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                  <XAxis type="number" dataKey="mpa" stroke="#94a3b8" 
                                         label={{ value: 'Pressure (MPa)', position: 'insideBottom', offset: -10, fill: '#94a3b8' }} 
                                         domain={[0, 'dataMax + 0.5']} />
                                  <YAxis type="number" dataKey="depth" reversed stroke="#94a3b8" 
                                         label={{ value: 'Depth (mm)', angle: -90, position: 'insideLeft', offset: 0, fill: '#94a3b8' }} 
                                         domain={[0, maxDepthFilter]} />
                                  <Tooltip 
                                     contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                                     itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                     labelFormatter={(val) => `Depth: ${val}mm`}
                                  />
                                  <Legend verticalAlign="top" height={36} iconType="circle" />
                                  {activeGroup.datasets.map((ds, i) => (
                                    <Line 
                                      key={ds.id} 
                                      data={ds.data.filter(d => d.depth <= maxDepthFilter)} 
                                      type="monotone" 
                                      dataKey="mpa" 
                                      name={ds.date} 
                                      stroke={CHART_COLORS[i % CHART_COLORS.length]} 
                                      dot={false} 
                                      strokeWidth={3} 
                                      activeDot={{ r: 6 }} 
                                    />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                           </div>
                        </div>

                        {/* Chronological Heatmap for this Location */}
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 print:bg-white print:border-gray-300 print:break-inside-avoid">
                           <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 print:text-gray-600 flex items-center gap-2">
                              <CalendarClock size={16} /> Chronological Heatmap
                           </h3>
                           <EvolutionHeatmap datasets={activeGroup.datasets} maxDepth={maxDepthFilter} />
                        </div>
                     </div>
                     
                     {/* List of Datasets in this group */}
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
                        {activeGroup.datasets.map((ds, i) => (
                           <div key={ds.id} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex justify-between items-center" style={{ borderLeft: `4px solid ${CHART_COLORS[i % CHART_COLORS.length]}` }}>
                              <div>
                                 <p className="font-bold text-slate-200">{ds.name}</p>
                                 <p className="text-xs text-slate-400">{ds.date}</p>
                              </div>
                              <button onClick={() => removeDataset(ds.id)} className="text-slate-500 hover:text-red-400 p-2"><Trash2 size={16}/></button>
                           </div>
                        ))}
                     </div>

                  </div>
               )}
            </div>
          </div>
        )}
      </div>
      
      {/* Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .fancy-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .fancy-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
        .fancy-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        @media print { .fancy-scrollbar::-webkit-scrollbar { display: none; } @page { size: landscape; margin: 10mm; } }
      `}} />
    </div>
  );
}

// -------------------------------------------------------------
// Group Evolution Heatmap (Extracted for Dashboard)
// -------------------------------------------------------------
function EvolutionHeatmap({ datasets, maxDepth }: { datasets: Dataset[], maxDepth: number }) {
  const bucketSize = 10; 
  const numBuckets = Math.ceil(maxDepth / bucketSize);
  
  const getMpaColor = (mpa: number | null) => {
    if (mpa === null) return undefined;
    const normalized = Math.max(0, Math.min(mpa / 3.0, 1));
    return `hsl(${(1 - normalized) * 120}, 90%, 45%)`;
  };

  const grid = datasets.map(dataset => {
    const buckets: (number | null)[] = Array(numBuckets).fill(null);
    dataset.data.forEach(point => {
      if (point.depth <= maxDepth) {
        const idx = Math.floor(point.depth / bucketSize);
        if (idx >= 0 && idx < numBuckets) {
          if (buckets[idx] === null || point.mpa > (buckets[idx] as number)) buckets[idx] = point.mpa;
        }
      }
    });
    return { name: dataset.date, buckets };
  });

  return (
    <div className="relative w-full overflow-x-auto pb-4 fancy-scrollbar">
      <div className="min-w-max flex">
        <div className="flex flex-col pr-4 pt-6 shrink-0 border-r border-slate-700 text-right text-[10px] text-slate-400 justify-between print:border-gray-300 print:text-black" style={{ height: '320px' }}>
          <span>0mm</span>
          <span>{Math.round(maxDepth / 2)}mm</span>
          <span>{maxDepth}mm</span>
        </div>
        <div className="flex gap-2 pl-4" style={{ height: '320px' }}>
          {grid.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col items-center w-16 shrink-0">
              <div className="h-6 flex items-center justify-center text-[10px] font-bold text-slate-300 print:text-black mb-1">{col.name}</div>
              <div className="flex-1 w-full flex flex-col gap-[1px] bg-slate-950 rounded print:bg-gray-200 overflow-hidden">
                {col.buckets.map((mpa, rowIdx) => (
                  <div key={rowIdx} className={`flex-1 w-full relative ${mpa === null ? 'bg-slate-800 print:bg-slate-100' : ''}`}
                    style={mpa !== null ? { backgroundColor: getMpaColor(mpa) } : undefined}
                    title={`Depth: ${rowIdx * bucketSize}-${(rowIdx+1) * bucketSize}mm\nPressure: ${mpa !== null ? mpa.toFixed(2) : 'N/A'} MPa`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-400">
         <span>0 MPa</span>
         <div className="w-24 h-2 rounded bg-gradient-to-r from-[hsl(120,90%,45%)] via-[hsl(60,90%,45%)] to-[hsl(0,90%,45%)]"></div>
         <span>3.0+ MPa</span>
      </div>
    </div>
  );
}