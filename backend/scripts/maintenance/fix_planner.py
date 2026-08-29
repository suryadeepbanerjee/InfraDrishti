from pathlib import Path
f = Path(r"D:\Learn\B_Tech\Hackathons\1_BuildWithBharat\Prototype\src\corridor\planner.py")
c = f.read_text(encoding='utf-8')
c = c.replace(
    'return cost, meta, slope, pop, build, lc, rivers, afi, dist_highway, pa',
    'return cost, meta, slope, pop, build, lc, rivers, afi, dist_highway, pa, water_occ'
)
c = c.replace(
    'cost_surf, meta, slope, pop, build, lc, rivers, afi, dist_highway, pa = get_cost_surface()',
    'cost_surf, meta, slope, pop, build, lc, rivers, afi, dist_highway, pa, water_occ = get_cost_surface()'
)
f.write_text(c, encoding='utf-8')
