import logging
import ctypes
from src.core.workspace import WorkspaceManager

logger = logging.getLogger(__name__)

def log_memory_estimate(ws_ib: WorkspaceManager):
    total_cells = ws_ib.manifest["aoi"]["cols"] * ws_ib.manifest["aoi"]["rows"]
    
    bytes_per_array = total_cells * 8
    feature_arrays_gb = (7 * bytes_per_array) / (1024**3)
    cost_surface_gb = bytes_per_array / (1024**3)
    mcp_internal_gb = (3 * bytes_per_array) / (1024**3)
    io_buffers_gb = 0.5 
    
    peak_memory_gb = feature_arrays_gb + cost_surface_gb + mcp_internal_gb + io_buffers_gb
    safety_margin_gb = peak_memory_gb * 1.5
    
    class MemoryStatusEx(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]
    
    stat = MemoryStatusEx()
    stat.dwLength = ctypes.sizeof(MemoryStatusEx)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
    
    available_gb = stat.ullAvailPhys / (1024**3)
    
    logger.info(f"Estimated peak memory: {peak_memory_gb:.2f} GB")
    logger.info(f"Required safety margin: {safety_margin_gb:.2f} GB")
    logger.info(f"Available system memory: {available_gb:.2f} GB")
    
    if available_gb < safety_margin_gb:
        logger.warning("WARNING: Available memory is below safety margin! Processing may crash.")
        
    return peak_memory_gb

