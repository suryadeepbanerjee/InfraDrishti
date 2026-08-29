from src.core.workspace import WorkspaceManager

ws = WorkspaceManager()
ws.calculate_corridor_aoi(75.8577, 22.7196, 77.4126, 23.2599, 50, buffer_margin_m=5000)
print(ws.manifest["aoi"])
