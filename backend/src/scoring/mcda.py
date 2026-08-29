import numpy as np
import yaml
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

def load_profile(infrastructure_type):
    profile_path = BASE_DIR / "configs/infrastructure_profiles.yaml"
    with open(profile_path) as f:
        config = yaml.safe_load(f)
    if infrastructure_type in config['profiles']:
        return config['profiles'][infrastructure_type]
    return config['profiles']['highway']

def run_mcda(candidates, metrics_config):
    metric_names = list(metrics_config.keys())
    raw_values = {m: [] for m in metric_names}
    for c in candidates:
        for m in metric_names:
            raw_values[m].append(c['metrics'].get(m, 0.0))
            
    normalized_values = {m: [] for m in metric_names}
    for m in metric_names:
        vals = np.array(raw_values[m], dtype=float)
        v_min = np.nanmin(vals) if len(vals) > 0 else 0
        v_max = np.nanmax(vals) if len(vals) > 0 else 0
        
        if v_max == v_min:
            norm_vals = np.ones_like(vals)
        else:
            if metrics_config[m]['minimize']:
                norm_vals = (v_max - vals) / (v_max - v_min)
            else:
                norm_vals = (vals - v_min) / (v_max - v_min)
        normalized_values[m] = norm_vals.tolist()
        
    for i, c in enumerate(candidates):
        score = 0.0
        contributions = {}
        norm_metrics = {}
        for m in metric_names:
            weight = metrics_config[m]['weight']
            n_val = normalized_values[m][i]
            contrib = n_val * weight
            score += contrib
            contributions[m] = float(contrib)
            norm_metrics[m] = float(n_val)
            
        c['mcda_score'] = float(score)
        c['normalized_metrics'] = norm_metrics
        c['weighted_contributions'] = contributions
        
    candidates.sort(key=lambda x: x['mcda_score'], reverse=True)
    
    for i, c in enumerate(candidates):
        c['rank'] = i + 1
        
    return candidates